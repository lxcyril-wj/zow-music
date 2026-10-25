"""One-pass timing worker. Process exit releases the model; no agent review loop."""
import sys,json,os,sysconfig,re,types
from pathlib import Path
from alignment import align,lyric_lines,norm

def main():
    spec=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
    handles=[]
    if os.name=='nt':
        for part in ['cublas','cudnn']:
            folder=Path(sysconfig.get_paths()['purelib'])/'nvidia'/part/'bin'
            if folder.exists():handles.append(os.add_dll_directory(str(folder)))
    if spec['kind']=='whisper':
        from faster_whisper import WhisperModel
        model=WhisperModel(spec['model'],device='cuda',compute_type='float16',local_files_only=True)
        # Decode locally: newer PyAV removed metadata_errors used by older faster-whisper.
        import soundfile as sf
        import numpy as np
        from scipy.signal import resample_poly
        from math import gcd
        samples,rate=sf.read(spec['audio'],dtype='float32',always_2d=True)
        samples=samples.mean(axis=1)
        if rate!=16000:
            factor=gcd(rate,16000);samples=resample_poly(samples,16000//factor,rate//factor).astype(np.float32)
        segments,info=model.transcribe(samples,language=spec.get('language','zh'),vad_filter=False,word_timestamps=True,condition_on_previous_text=False,temperature=0,beam_size=5)
        raw=[dict(start=s.start,end=s.end,text=s.text,words=[dict(start=w.start,end=w.end,word=w.word,probability=w.probability) for w in s.words or []]) for s in segments]
        result=align(spec['lyrics'],raw,info.duration)
        result.pop('review',None)
        Path(spec['output']).with_suffix('.asr.json').write_text(json.dumps(raw,ensure_ascii=False),encoding='utf-8')
    else:
        stub=types.ModuleType('nagisa')
        def unsupported(_):raise RuntimeError('Japanese requires a supported tokenizer')
        stub.tagging=unsupported;sys.modules.setdefault('nagisa',stub)
        import torch
        from qwen_asr import Qwen3ForcedAligner
        model=Qwen3ForcedAligner.from_pretrained(spec['model'],dtype=torch.bfloat16,device_map='cuda:0')
        lines=lyric_lines(spec['lyrics']);aligned=model.align(audio=spec['audio'],text='\n'.join(lines),language='Chinese')[0]
        units=list(aligned.items) if getattr(aligned,'items',None) is not None else list(aligned)
        baseline=spec.get('baseline',{});cues=[];missing=[];index=0
        for line in lines:
            target=norm(line);selected=[];text=''
            while index<len(units) and len(text)<len(target):
                u=units[index];index+=1;text+=norm(u.text);selected.append(u)
            start=selected[0].start_time if selected else 0;end=selected[-1].end_time if selected else 0
            # Structural validity only; one pass, no model-based review or retry.
            valid=bool(selected) and text==target and end>start and end-start<=max(12,len(target)*1.2) and all(u.end_time>u.start_time for u in selected)
            if valid and (not cues or start>=cues[-1]['end']):cues.append(dict(start=start,end=end,text=line))
            else:
                old=next((c for c in baseline.get('timedLyrics',[]) if norm(c['text'])==target and (not cues or c['start']>=cues[-1]['end'])),None)
                if old:cues.append(old)
                else:missing.append(line)
        result=dict(lyrics=spec['lyrics'],timedLyrics=cues,unmatchedLyrics=missing)
    result['lyrics']=spec['lyrics']
    target=Path(spec['output']);temp=target.with_suffix('.tmp');temp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(target)

if __name__=='__main__':main()
