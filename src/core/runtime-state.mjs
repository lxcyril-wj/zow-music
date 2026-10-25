import fs from 'node:fs';
import path from 'node:path';
import {readJSON,writeJSON,within} from './store.mjs';

const file=p=>typeof p==='string'&&fs.existsSync(p)&&fs.statSync(p).isFile();
const model=(folder,files)=>!!folder&&files.every(name=>file(path.join(folder,name))&&fs.statSync(path.join(folder,name)).size>0);

// An installed portable runtime is discovered from its marker. UI settings are
// derived from owned files, never from a developer machine's absolute paths.
export function reconcileRuntime(store){
 const root=path.resolve(store.root),base=path.join(root,'runtime'),marker=path.join(base,'runtime.json');
 const record=readJSON(marker,null);if(!record)return {ready:false,changed:false};
 const venvName=record.venvName||'venv';if(!/^venv[a-zA-Z0-9_-]*$/.test(venvName))return {ready:false,changed:false};
 const python=path.join(base,venvName,'Scripts/python.exe');
 const source=path.join(base,path.basename(record.comfy||''));
 if(!file(python)||!file(path.join(source,'main.py')))return {ready:false,changed:false};
 within(root,python);within(root,source);
 const previousRoot=record.dataRoot||(record.python?path.resolve(path.dirname(record.python),'../../..'):root);
 const relocate=p=>{
  if(typeof p!=='string')return p;
  const relative=path.relative(previousRoot,p);
  return relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)?path.join(root,relative):p;
 };
 // uv's relocatable launcher still needs an up-to-date CPython home in this file.
 const config=path.join(base,venvName,'pyvenv.cfg'),pythonRoot=path.join(base,'python');
 if(record.relocatable&&file(config)&&fs.existsSync(pythonRoot)){
  const homes=fs.readdirSync(pythonRoot,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^cpython-\d/.test(e.name)&&!fs.lstatSync(path.join(pythonRoot,e.name)).isSymbolicLink());
  const currentHome=homes.find(e=>file(path.join(pythonRoot,e.name,'python.exe')));
  if(currentHome){const value=fs.readFileSync(config,'utf8'),next=value.replace(/^home\s*=.*$/m,'home = '+path.join(pythonRoot,currentHome.name));if(next!==value){fs.copyFileSync(config,config+'.before-relocation-'+Date.now());fs.writeFileSync(config,next);}}
 }
 const components=readJSON(path.join(base,'components.json'),{}),saved=components.workers||components;
 const workers={...store.settings.workers};
 for(const key of ['whisperModel','qwenModel'])if(workers[key])workers[key]=relocate(workers[key]);
 const selected=workers.whisperVariant||saved.whisperVariant||'small';
 const whisperCandidates=[workers.whisperModel,relocate(saved.whisperModel),path.join(root,'models',selected==='large-v3'?'whisper':'whisper-small')];
 const whisper=whisperCandidates.find(folder=>model(folder,['config.json','model.bin','tokenizer.json']));
 const qwenCandidates=[workers.qwenModel,relocate(saved.qwenModel),path.join(root,'models/qwen')];
 const qwen=qwenCandidates.find(folder=>model(folder,['config.json','model.safetensors']));
 workers.python=python;workers.qwenPython=python;
 if(whisper){workers.whisperModel=whisper;workers.whisperVariant=workers.whisperVariant||saved.whisperVariant||(path.basename(whisper)==='whisper-small'?'small':'large-v3');}
 if(qwen)workers.qwenModel=qwen;
 const comfy={...store.settings.comfy,url:'http://127.0.0.1:18745',managed:true,python,main:path.join(source,'main.py'),fastProfile:!!record.fastProfile};
 const changed=JSON.stringify(comfy)!==JSON.stringify(store.settings.comfy)||JSON.stringify(workers)!==JSON.stringify(store.settings.workers);
 if(changed)store.configure({comfy,workers});
 const next={...record,python,comfy:source,dataRoot:root};
 if(JSON.stringify(record)!==JSON.stringify(next))writeJSON(marker,next);
 return {ready:true,changed};
}
