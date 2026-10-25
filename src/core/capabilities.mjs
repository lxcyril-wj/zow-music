import fs from 'node:fs';
import path from 'node:path';
import {readJSON} from './store.mjs';

const MUSIC={standard:'yue2_3b_int8_convrot.safetensors',high:'yue2_3b_bf16.safetensors'};
const COVER={standard:'moss_image_sft_int8_convrot.safetensors',high:'moss_image_sft_bf16.safetensors'};
const exists=file=>typeof file==='string'&&fs.existsSync(file)&&fs.statSync(file).isFile()&&fs.statSync(file).size>0;
const folder=(dir,files)=>!!dir&&files.every(file=>exists(path.join(dir,file)));
export function asrVariant(settings){return settings.workers?.whisperVariant||(settings.workers?.whisperModel?'large-v3':'small');}
export function capabilityStatus(store){
 const runtime=readJSON(path.join(store.root,'runtime/runtime.json'),{});
 const ready=exists(runtime.python)&&exists(runtime.comfy?path.join(runtime.comfy,'main.py'):'');
 const base=runtime.comfy?path.join(runtime.comfy,'models'):null;
 const selected=store.settings.modules||{};
 const musicVariant=selected.music==='yue2-bf16'?'high':'standard';
 const coverVariant=selected.cover==='moss-bf16'?'high':'standard';
 const workers=store.settings.workers||{};
 const musicReady=ready&&folder(base?path.join(base,'checkpoints'):null,[MUSIC[musicVariant]]);
 const coverReady=ready&&folder(base?path.join(base,'diffusion_models'):null,[COVER[coverVariant]])&&folder(base?path.join(base,'text_encoders'):null,['qwen3.5_9b_w4a8_gptq.safetensors'])&&folder(base?path.join(base,'vae'):null,['flux2-vae_small.safetensors']);
 const whisperReady=ready&&exists(workers.python)&&folder(workers.whisperModel,['config.json','model.bin','tokenizer.json']);
 const alignReady=ready&&exists(workers.qwenPython)&&folder(workers.qwenModel,['config.json','model.safetensors']);
 return {modules:[{id:'music',ready:!!musicReady,variant:musicVariant},{id:'cover',ready:!!coverReady,variant:coverVariant},{id:'timing',ready:!!(whisperReady&&alignReady),variant:asrVariant(store.settings)}],advanced:{music:musicVariant,cover:coverVariant,asr:asrVariant(store.settings)},runtimeReady:!!ready};
}

export function installationPlan(kind,settings){
 switch(kind){
  case 'music': return {files:[settings.modules?.music==='yue2-bf16'?'music-bf16':'music-int8'],select:null};
  case 'cover': return {files:[settings.modules?.cover==='moss-bf16'?'cover-bf16':'cover-int8'],select:null};
  case 'timing': return {files:[asrVariant(settings)==='small'?'whisper-small':'whisper','qwen'],select:null};
  case 'music-standard':return {files:['music-int8'],select:{music:'yue2-int8'}};
  case 'music-high':return {files:['music-bf16'],select:{music:'yue2-bf16'}};
  case 'cover-standard':return {files:['cover-int8'],select:{cover:'moss-int8'}};
  case 'cover-high':return {files:['cover-bf16'],select:{cover:'moss-bf16'}};
  case 'asr-small':return {files:['whisper-small'],select:null};
  case 'asr-large-v3':return {files:['whisper'],select:null};
  default:return null;
 }
}
