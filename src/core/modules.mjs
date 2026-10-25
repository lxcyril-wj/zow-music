import fs from 'node:fs';
import path from 'node:path';
import {readJSON} from './store.mjs';
export class Modules {
 constructor(root){this.root=root;this.reload();}
 reload(){this.items=fs.readdirSync(this.root).filter(x=>x.endsWith('.json')).map(x=>{const m=readJSON(path.join(this.root,x),{});if(!m.id||m.apiVersion!==1||!['music','cover','asr','align'].includes(m.kind))throw Error('Invalid module: '+x);return m;});}
 list(){return structuredClone(this.items);}
 get(id){const m=this.items.find(m=>m.id===id);if(!m)throw Error('Module unavailable: '+id);return structuredClone(m);}
 graph(id,input){const m=this.get(id);if(m.adapter!=='comfy')throw Error('Not a workflow module');const g=structuredClone(m.workflow);for(const [field,targets]of Object.entries(m.mapping||{})){if(input[field]===undefined)continue;for(const [node,key]of targets){if(!g[node]?.inputs)throw Error('Invalid workflow mapping');g[node].inputs[key]=input[field];}}return g;}
}
