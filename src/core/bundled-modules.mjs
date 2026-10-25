import fs from 'node:fs';
import path from 'node:path';
import {readJSON,writeJSON} from './store.mjs';

const legacy={
 whisper:{apiVersion:1,id:'whisper',kind:'asr',name:'Whisper large-v3',version:'1.0.0',adapter:'python',script:'workers/timing.py'},
 'qwen-06b':{apiVersion:1,id:'qwen-06b',kind:'align',name:'Qwen3 ForcedAligner 0.6B',version:'1.0.0',adapter:'python',script:'workers/timing.py'},
};
const same=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.entries(b).every(([key,value])=>a[key]===value);

// New files are added without replacing custom modules. The only automatic
// replacement is an exact known old built-in manifest, with its original saved.
export function syncBundledModules(bundled,installed){
 fs.mkdirSync(installed,{recursive:true});
 for(const entry of fs.readdirSync(bundled,{withFileTypes:true})){
  const source=path.join(bundled,entry.name),target=path.join(installed,entry.name);
  if(entry.isDirectory()){
   if(entry.name==='workers')fs.cpSync(source,target,{recursive:true,force:false,errorOnExist:false,filter:p=>!p.includes('__pycache__')});
   continue;
  }
  if(!entry.name.endsWith('.json'))continue;
  if(!fs.existsSync(target)){fs.copyFileSync(source,target);continue;}
  const current=readJSON(target,{}),next=readJSON(source,{}),old=legacy[next.id];
  if(old&&same(current,old)&&next.version!==old.version){const history=path.join(installed,'.history',next.id+'-'+old.version+'-'+Date.now()+'.json');writeJSON(history,current);writeJSON(target,next);}
 }
}
