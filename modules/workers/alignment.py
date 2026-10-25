"""Deterministic original-lyric alignment; no batch-specific song names or windows."""
import difflib
import re


def norm(value):
    value=value.lower().replace('’', "'")
    value=re.sub(r"\b([a-z]+)in'\b",r'\1ing',value)
    return re.sub(r'[^a-z0-9\u3400-\u9fff]', '', value)


def tokens_for(value):
    return re.findall(r'[\u3400-\u9fff]|[a-z0-9]+',norm(value)) if re.search(r'[\u3400-\u9fff]',value) else [norm(w) for w in value.split() if norm(w)]


def lyric_lines(lyrics):
    # Historical lyric documents sometimes begin with bilingual title metadata.
    at=lyrics.find('[')
    if at>=0:lyrics=lyrics[at:]
    return [line.strip() for line in lyrics.splitlines() if line.strip() and not line.strip().startswith('[')]


def flatten(segments):
    words=[]
    for segment in segments:
        content=norm(segment.get('text',''))
        if content in ('thankyou','thanksforwatching','thankyouforwatching','musicoutro'):
            continue
        for word in segment.get('words',[]):
            if not norm(word['word']) or word['end']<=word['start']:continue
            if norm(word['word'])=='agi':
                width=(word['end']-word['start'])/3
                words.extend(dict(word,word=letter,start=word['start']+i*width,end=word['start']+(i+1)*width) for i,letter in enumerate('agi'))
            elif re.search(r'[\u3400-\u9fff]',word['word']):
                # Preserve measured ASR word boundaries, never interpolate character timing.
                words.extend(dict(word,word=token) for token in tokens_for(word['word']))
            else:words.append(word)
    words.sort(key=lambda w:(w['start'],w['end']))
    return words


def token_map(original,recognized):
    n,m=len(original),len(recognized)
    previous=list(range(m+1));ops=[bytearray(m+1) for _ in range(n+1)]
    for j in range(1,m+1):ops[0][j]=2
    for i in range(1,n+1):
        row=[float(i)]+[0.]*m;ops[i][0]=1
        for j in range(1,m+1):
            a,b=original[i-1],recognized[j-1]
            cost=0 if a==b else .65 if difflib.SequenceMatcher(None,a,b).ratio()>=.7 else 1.35
            options=(previous[j-1]+cost,previous[j]+1,row[j-1]+1)
            operation=min(range(3),key=options.__getitem__)
            row[j]=options[operation];ops[i][j]=operation
        previous=row
    i,j=n,m;mapping={}
    while i or j:
        operation=ops[i][j]
        if operation==0:mapping[i-1]=j-1;i-=1;j-=1
        elif operation==1:i-=1
        else:j-=1
    return mapping


def align(lyrics,segments,duration):
    lines=lyric_lines(lyrics);tokens=[];ranges=[]
    for line in lines:
        start=len(tokens);tokens.extend(tokens_for(line));ranges.append((start,len(tokens)))
    words=flatten(segments);mapping=token_map(tokens,[norm(w['word']) for w in words]);review=[]
    for index,(line,(a,b)) in enumerate(zip(lines,ranges)):
        pairs=[(i,mapping[i]) for i in range(a,b) if i in mapping]
        matched=[words[j] for _,j in pairs]
        exact=sum(tokens[i]==norm(words[j]['word']) for i,j in pairs)
        score=exact/max(1,b-a);coverage=len(matched)/max(1,b-a)
        start=matched[0]['start'] if matched else None;end=matched[-1]['end'] if matched else None
        reason=None
        if not matched or score<.3 or coverage<.5:reason='insufficient_words'
        elif start<0 or end>duration+.1 or end<=start:reason='invalid_range'
        elif end-start>max(12,(b-a)*1.7):reason='stretched_phrase'
        elif any(w['end']-w['start']>max(4,(end-start)*.75) for w in matched):reason='stretched_word'
        review.append(dict(index=index,text=line,start=round(start,3) if start is not None else None,end=round(end,3) if end is not None else None,score=round(score,3),coverage=round(coverage,3),reason=reason,recognized=' '.join(w['word'].strip() for w in matched)))
    cues=[]
    for row in review:
        if row['reason']:continue
        cue={k:row[k] for k in ('start','end','text')}
        if cues and cue['start']<cues[-1]['end']:
            if cue['start']<=cues[-1]['start']:
                row['reason']='duplicate_or_out_of_order';continue
            cues[-1]['end']=cue['start']
        cues.append(cue)
    return dict(timedLyrics=cues,unmatchedLyrics=[r['text'] for r in review if r['reason']],review=review)


def repair_windows(result,duration,limit=6):
    """Use neighboring reliable words to constrain retries; never invent timings."""
    rows=result['review'];windows=[]
    long_seen=set()
    for row in rows:
        if not row['reason'] and row['score']>=.55:continue
        i=row['index'];before=next((r for r in reversed(rows[:i]) if not r['reason']),None)
        after=next((r for r in rows[i+1:] if not r['reason']),None)
        start=max(0,(before['end'] if before else 0)-1)
        end=min(duration,(after['start'] if after else duration)+1)
        if row['start'] is not None and row['end'] is not None and not row['reason']:
            start=max(0,row['start']-1);end=min(duration,row['end']+1)
        if end<=start:continue
        if end-start>48:
            key=(round(start,1),round(end,1))
            if key in long_seen:continue
            long_seen.add(key)
            # Split a lost intro/verse into bounded recognition windows, not estimated cues.
            missing=[r['index'] for r in rows if r['reason'] and (r['index']>=i)]
            stop=after['index'] if after else len(rows)
            missing=[j for j in missing if j<stop]
            position=start
            while position<end:
                windows.append(dict(start=round(position,2),end=round(min(end,position+28),2),indices=missing or [i]))
                position+=27
            continue
        # Adjacent missing lines form one bounded recognition window.
        nearby=next((w for w in windows if start<=w['end'] and end>=w['start']),None)
        if nearby and max(nearby['end'],end)-min(nearby['start'],start)<=48:
            nearby['start']=min(start,nearby['start']);nearby['end']=max(end,nearby['end']);nearby['indices'].append(i)
        else:windows.append(dict(start=round(start,2),end=round(end,2),indices=[i]))
    for window in windows:
        lo=max(0,min(window['indices'])-1);hi=min(len(rows),max(window['indices'])+2)
        window['prompt']=' '.join(r['text'] for r in rows[lo:hi])[:1500]
    return windows[:limit]


def merge_patch(segments,patch):
    start,end=patch['window'];merged=[]
    for segment in segments:
        words=[w for w in segment.get('words',[]) if not start<=w['start']<end]
        if words:merged.append(dict(segment,words=words))
    return merged+patch['segments']


def quality(result):
    return (len(result['unmatchedLyrics']),-sum(r['score'] for r in result['review']))
