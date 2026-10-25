import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawn}from 'node:child_process';import {within,writeJSON,readJSON}from './store.mjs';
import {capabilityStatus,installationPlan} from './capabilities.mjs';
import {reconcileRuntime} from './runtime-state.mjs';
import {fileURLToPath} from 'node:url';
const COMMIT='e087d8f6cb7c6cdb11b59dc7c9bf17c79f8d877d';
const REPOS={'whisper-small':{repo:'Systran/faster-whisper-small',revision:'536b0662742c02347bc0e980a01041f333bce120'},yue:{repo:'Comfy-Org/YuE2',revision:'2f76ca75e6ee094169de899cc7fc99d6887e2196'},moss:{repo:'Comfy-Org/MOSS-Image',revision:'24147db865fcdc207270f844777587223fed8d6e'},whisper:{repo:'Systran/faster-whisper-large-v3',revision:'edaa852ec7e145841d8ffdb056a99866b5f0a478'},qwen:{repo:'Qwen/Qwen3-ForcedAligner-0.6B',revision:'c7cbfc2048c462b0d63a45797104fc9db3ad62b7'}};
export class Installer {
 constructor(store,emit){this.store=store;this.emit=emit;this.state={busy:false,step:'',progress:0,error:null};this.root=path.join(store.root,'runtime');fs.mkdirSync(this.root,{recursive:true});}
 status(){return this.state;}
 progress(step,progress=0){Object.assign(this.state,{step,progress});this.emit();}
 async run(kind){
  if(this.state.busy)throw Error('已有模块正在安装，请稍后再试 / A module is already being installed');
  this.state={busy:true,kind,step:'',progress:0,error:null};this.emit();
  try{
   reconcileRuntime(this.store);const plan=installationPlan(kind,this.store.settings);
   if(plan){
    if(!capabilityStatus(this.store).runtimeReady)await this.runtime();
    for(const item of plan.files)await this.models(item);
    if(plan.select)this.store.configure({modules:{...this.store.settings.modules,...plan.select}});
   }else if(kind==='recommended'){await this.runtime();for(const item of ['int8','whisper-small','qwen'])await this.models(item);}
   else if(kind==='runtime')await this.runtime();
   else if(['int8','bf16','whisper','whisper-small','qwen'].includes(kind))await this.models(kind);
   else throw Error('Unknown install package');
   this.progress('安装完成 / Installed',100);
  }catch(e){this.state.error=e.message;throw e;}
  finally{this.state.busy=false;this.emit();}
 }
 async download(url,target,sha){
  within(this.store.root,target);fs.mkdirSync(path.dirname(target),{recursive:true});
  if(fs.existsSync(target)){if(!sha||await this.hash(target)===sha)return target;throw Error('Existing model preserved: checksum mismatch');}
  const part=target+'.part';const progress=setInterval(()=>{if(fs.existsSync(part))this.progress(path.basename(target)+' · '+(fs.statSync(part).size/1048576).toFixed(1)+' MB');},1000);
  try{await this.command('curl.exe',['--noproxy','*','--fail','--location','--silent','--show-error','--retry','2','--connect-timeout','20','--speed-time','45','--speed-limit','1024','--continue-at','-','--output',part,url]);}finally{clearInterval(progress);}
  if(sha&&await this.hash(part)!==sha)throw Error('Downloaded file checksum mismatch: '+path.basename(target));
  fs.renameSync(part,target);return target;
 }
 async hash(file){return new Promise((resolve,reject)=>{const h=crypto.createHash('sha256');fs.createReadStream(file).on('data',x=>h.update(x)).on('end',()=>resolve(h.digest('hex'))).on('error',reject);});}
 async command(exe,args,env={}){this.progress(path.basename(exe)+' '+args.slice(0,3).join(' '));return new Promise((resolve,reject)=>{const log=fs.openSync(path.join(this.root,'install.log'),'a');const child=spawn(exe,args,{cwd:this.root,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'*',UV_CACHE_DIR:path.join(this.root,'uv-cache'),UV_PYTHON_INSTALL_DIR:path.join(this.root,'python'),UV_PYTHON_BIN_DIR:path.join(this.root,'bin'),UV_NO_PROGRESS:'1',PYTHONUTF8:'1',...env}});this.child=child;child.on('error',e=>{this.child=null;fs.closeSync(log);reject(e);});child.on('exit',code=>{this.child=null;fs.closeSync(log);code===0?resolve():reject(Error('安装步骤失败，请查看 runtime/install.log / Install failed: '+code));});});}
 async expand(zip,dest){within(this.store.root,dest);fs.mkdirSync(dest,{recursive:true});const quote=s=>"'"+s.replaceAll("'","''")+"'";await this.command('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(dest)} -Force`]);}
 async runtime(){
   const uvDir=path.join(this.root,'uv'),uv=path.join(uvDir,'uv-0.13.5.data/scripts/uv.exe');if(!fs.existsSync(uv)){const url='https://files.pythonhosted.org/packages/32/ea/771744a784b16aa21d195cb5d5d5a2878d72fa00fc26f11ea3f9646994fe/uv-0.13.5-py3-none-win_amd64.whl';const checksum='1fb29fc46ba12033e2ef95a95ac79d649e71bbb1358419bbbcbd19d86026ef2f';const zip=await this.download(url,path.join(this.root,'downloads/uv-pypi.zip'),checksum);await this.expand(zip,uvDir);}
   const archive=await this.download('https://codeload.github.com/Comfy-Org/ComfyUI/zip/'+COMMIT,path.join(this.root,'downloads/comfy-'+COMMIT+'.zip'));const source=path.join(this.root,'ComfyUI-'+COMMIT);if(!fs.existsSync(path.join(source,'main.py')))await this.expand(archive,this.root);
   await this.command(uv,['python','install','3.12']);const venv=path.join(this.root,'venv'),python=path.join(venv,'Scripts/python.exe');if(!fs.existsSync(python))await this.command(uv,['venv',venv,'--python','3.12','--managed-python','--relocatable']);
   await this.command(uv,['pip','install','--python',python,'torch==2.9.1','torchvision==0.24.1','torchaudio==2.9.1','--index-url','https://download.pytorch.org/whl/cu130']);
   await this.command(uv,['pip','install','--python',python,'-r',path.join(source,'requirements.txt'),'faster-whisper','transformers==4.57.6','accelerate==1.12.0','librosa','soundfile','soynlp','sox']);
   await this.command(uv,['pip','install','--python',python,'--no-deps','qwen-asr==0.0.6']);
   const gpuProbe=path.join(this.root,'gpu-probe.py');fs.writeFileSync(gpuProbe,"import torch,json\nfrom pathlib import Path\nPath('gpu-profile.json').write_text(json.dumps({'cuda':torch.version.cuda,'capability':list(torch.cuda.get_device_capability(0)) if torch.cuda.is_available() else []}))\n");await this.command(python,[gpuProbe]);
   const gpu=readJSON(path.join(this.root,'gpu-profile.json'),{}),assets=fileURLToPath(new URL('../../assets/runtime/',import.meta.url)),kernel=readJSON(path.join(assets,'kernels.json'),{});let fastProfile=false;
   if(process.platform==='win32'&&JSON.stringify(gpu.capability)===JSON.stringify(kernel.capability)){
    const wheel=path.join(this.root,'optimized-wheels',kernel.file);fs.mkdirSync(path.dirname(wheel),{recursive:true});if(!fs.existsSync(wheel))fs.writeFileSync(wheel,fs.readFileSync(path.join(assets,kernel.file)));
    if(await this.hash(wheel)!==kernel.sha256)throw Error('Optimized kernel checksum mismatch');
    await this.command(uv,['pip','install','--python',python,'--no-deps',wheel]);fastProfile=true;
   }
   const probe=path.join(this.root,'probe.py');fs.writeFileSync(probe,'import torch, faster_whisper\nprint(torch.__version__)\n');await this.command(python,[probe]);
   writeJSON(path.join(this.root,'runtime.json'),{comfy:source,python,commit:COMMIT,dataRoot:this.store.root,relocatable:true,fastProfile});this.store.configure({comfy:{url:'http://127.0.0.1:18745',managed:true,python,main:path.join(source,'main.py'),fastProfile},workers:{...this.store.settings.workers,python,qwenPython:python}});
 }
 stop(){this.child?.kill();}
 async models(kind){const runtime=readJSON(path.join(this.root,'runtime.json'),{});if(!runtime.comfy)throw Error('请先安装专用运行包 / Install the runtime first');
   const groups=kind.startsWith('music-')?['yue']:kind.startsWith('cover-')?['moss']:kind==='int8'||kind==='bf16'?['yue','moss']:[kind];const high=kind.includes('bf16');for(const group of groups){const {repo,revision}=REPOS[group];const response=await fetch('https://huggingface.co/api/models/'+repo+'/revision/'+revision+'?blobs=true');if(!response.ok)throw Error('Model catalog unavailable');const info=await response.json();let entries=info.siblings.filter(e=>!e.rfilename.startsWith('.')&&!/README|LICENSE|\.md$/.test(e.rfilename));if(group==='yue')entries=entries.filter(e=>e.rfilename==='checkpoints/yue2_3b_'+(high?'bf16':'int8_convrot')+'.safetensors');if(group==='moss')entries=entries.filter(e=>['diffusion_models/moss_image_sft_'+(high?'bf16':'int8_convrot')+'.safetensors','text_encoders/qwen3.5_9b_w4a8_gptq.safetensors','vae/flux2-vae_small.safetensors'].includes(e.rfilename));if(!entries.length)throw Error('Empty model catalog');const base=['yue','moss'].includes(group)?path.join(runtime.comfy,'models'):path.join(this.store.root,'models',group);for(const entry of entries){const target=within(base,path.join(base,entry.rfilename));await this.download('https://huggingface.co/'+repo+'/resolve/'+revision+'/'+entry.rfilename,target,entry.lfs?.sha256);}if(group==='whisper'||group==='whisper-small')this.store.configure({workers:{...this.store.settings.workers,whisperModel:base,whisperVariant:group==='whisper-small'?'small':'large-v3'}});if(group==='qwen')this.store.configure({workers:{...this.store.settings.workers,qwenModel:base}});writeJSON(path.join(this.root,'components.json'),{version:1,workers:this.store.settings.workers});}
 }
}
