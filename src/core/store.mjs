import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseLRC,parseSRT,sidecars} from './lyrics.mjs';
export function within(root, target) {
  const base=path.resolve(root), full=path.resolve(target), rel=path.relative(base,full);
  if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)) throw Error('Path outside managed directory');
  let p=full;
  while(p!==base){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Linked paths are not allowed');p=path.dirname(p);}
  return full;
}
export function readJSON(file, fallback){try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch(e){if(e.code==='ENOENT')return structuredClone(fallback);throw e;}}
export function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,file);}
export const uid=()=>crypto.randomUUID();
export class Store {
  constructor(root){this.root=path.resolve(root);fs.mkdirSync(root,{recursive:true});for(const d of ['library','cache/jobs','trash','credentials'])fs.mkdirSync(path.join(root,d),{recursive:true});this.file=path.join(root,'library.json');this.db=readJSON(this.file,{version:1,tracks:[],playlists:[],demoImported:false});this.settings=readJSON(path.join(root,'settings.json'),{language:'zh',theme:'dark',spectrum:true,volume:.75,comfy:{url:'http://127.0.0.1:30001',managed:false,python:'',main:''},modules:{music:'yue2-int8',cover:'moss-int8',asr:'whisper',align:'qwen-06b'},ai:{provider:'openai',model:''},workers:{}});}
  save(){writeJSON(this.file,this.db);}
  configure(update){this.settings={...this.settings,...update};writeJSON(path.join(this.root,'settings.json'),this.settings);return this.settings;}
  async importTrack(source,meta={}){
    const stat=fs.statSync(source);if(!stat.isFile())throw Error('Not a file');
    const ext=path.extname(source).toLowerCase();if(!['.mp3','.flac','.wav','.ogg','.m4a','.aac','.opus'].includes(ext))throw Error('Unsupported audio');
    const hash=await new Promise((resolve,reject)=>{const h=crypto.createHash('sha256');fs.createReadStream(source).on('data',x=>h.update(x)).on('end',()=>resolve(h.digest('hex'))).on('error',reject);});
    const found=this.db.tracks.find(t=>t.hash===hash);if(found)return found;
    let duration=meta.duration||0,artist=meta.artist||'',title=meta.title||path.basename(source,ext);
    try{const {parseFile}=await import('music-metadata');const info=await parseFile(source);duration=info.format.duration||duration;artist=artist||info.common.artist||'';if(!meta.title)title=info.common.title||title;}catch{}
    const id=meta.id||uid();if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Invalid ID');
    if(this.db.tracks.some(t=>t.id===id))throw Error('Track ID already exists');
    const dir=within(path.join(this.root,'library'),path.join(this.root,'library',id));fs.mkdirSync(dir);
    try{
      const audio=path.join(dir,'audio'+ext);fs.copyFileSync(source,audio,fs.constants.COPYFILE_EXCL);
      const lines=(meta.lyrics||'').split('\n').map(x=>x.trim()).filter(x=>x&&!x.startsWith('['));
      const timedLyrics=lines.map((text,i)=>({text,start:duration*i/lines.length,end:duration*(i+1)/lines.length}));
      const lyrics={lyrics:meta.lyrics||'',timedLyrics,unmatchedLyrics:[],status:'estimated',manual:false,revision:0};writeJSON(path.join(dir,'lyrics.json'),lyrics);
      const track={id,title,artist,duration,hash,audio:path.relative(this.root,audio),cover:null,lyricsFile:path.relative(this.root,path.join(dir,'lyrics.json')),createdAt:new Date().toISOString(),source:meta.source||'import',language:meta.language||'',coverStatus:'pending',timingStatus:'estimated',favorite:false};
      this.db.tracks.push(track);this.save();
      const stem=source.slice(0,-ext.length);for(const suffix of ['.lyrics.json','.lrc','.srt']){const f=stem+suffix;if(!fs.existsSync(f))continue;try{const raw=fs.readFileSync(f,'utf8').replace(/^\uFEFF/,'');const doc=suffix==='.lyrics.json'?JSON.parse(raw):suffix==='.lrc'?parseLRC(raw,duration):parseSRT(raw);this.updateLyrics(id,{...doc,status:'aligned'},{manual:true});break;}catch{}}
      for(const suffix of ['.cover.png','.cover.jpg','.png','.jpg']){if(fs.existsSync(stem+suffix)){this.setCover(id,stem+suffix);break;}}
      return track;
    }catch(e){fs.renameSync(dir,path.join(this.root,'trash',id+'-incomplete-'+Date.now()));throw e;}
  }
  track(id){const t=this.db.tracks.find(t=>t.id===id);if(!t)throw Error('Track not found');return t;}
  lyrics(id){return readJSON(within(this.root,path.join(this.root,this.track(id).lyricsFile)),{});}
  updateLyrics(id,doc,{manual=false,expectedRevision}={}){const t=this.track(id),old=this.lyrics(id);if(!manual&&(old.manual||(expectedRevision!==undefined&&old.revision!==expectedRevision)))return false;let last=-1;for(const cue of doc.timedLyrics||[]){if(!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.start<last||cue.end<=cue.start||cue.start<0||typeof cue.text!=='string')throw Error('Invalid lyric timeline');last=cue.end;}const next={...old,...doc,manual:manual||old.manual,revision:(old.revision||0)+1};writeJSON(path.join(this.root,t.lyricsFile),next);const exports=sidecars(next.timedLyrics||[]);for(const [ext,content] of Object.entries(exports))fs.writeFileSync(path.join(path.dirname(path.join(this.root,t.lyricsFile)),'lyrics.'+ext),content);t.timingStatus=manual?'manual':next.status||'aligned';this.save();return true;}
  setCover(id,source){const t=this.track(id),ext=path.extname(source).toLowerCase();if(!['.png','.jpg','.jpeg','.webp'].includes(ext))throw Error('Unsupported image');const dest=path.join(this.root,'library',id,'cover-'+Date.now()+ext);fs.copyFileSync(source,dest);t.cover=path.relative(this.root,dest);t.coverStatus='complete';this.save();}
  playlist(action,payload){let p=this.db.playlists.find(p=>p.id===payload.id);if(action==='create'){p={id:uid(),name:String(payload.name||'').trim().slice(0,120),trackIds:[]};if(!p.name)throw Error('Name required');this.db.playlists.push(p);}else{if(!p)throw Error('Playlist missing');if(action==='rename'){if(!String(payload.name||'').trim())throw Error('Name required');p.name=String(payload.name).trim().slice(0,120);}else if(action==='delete')this.db.playlists=this.db.playlists.filter(x=>x!==p);else if(action==='add'){this.track(payload.trackId);if(!p.trackIds.includes(payload.trackId))p.trackIds.push(payload.trackId);}else if(action==='addMany'){if(!Array.isArray(payload.trackIds)||payload.trackIds.length>2000)throw Error('Invalid song selection');const ids=[...new Set(payload.trackIds)];for(const id of ids)this.track(id);p.trackIds=[...new Set([...p.trackIds,...ids])];}else if(action==='remove')p.trackIds=p.trackIds.filter(id=>id!==payload.trackId);else if(action==='reorder'){if(payload.trackIds.length!==p.trackIds.length||new Set(payload.trackIds).size!==p.trackIds.length||payload.trackIds.some(id=>!p.trackIds.includes(id)))throw Error('Invalid order');p.trackIds=payload.trackIds;}else throw Error('Unknown action');}this.save();return p;}
  removeTrack(id){const t=this.track(id);const dir=within(path.join(this.root,'library'),path.join(this.root,'library',id));if(fs.existsSync(dir))fs.renameSync(dir,path.join(this.root,'trash',id+'-'+Date.now()));this.db.tracks=this.db.tracks.filter(x=>x!==t);for(const p of this.db.playlists)p.trackIds=p.trackIds.filter(x=>x!==id);this.save();}
  snapshot(){return {...this.db,settings:this.settings,tracks:this.db.tracks.map(t=>({...t,missing:!fs.existsSync(path.join(this.root,t.audio))}))};}
  storage(){const size=p=>{let n=0;for(const ent of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,ent.name);if(ent.isSymbolicLink())continue;n+=ent.isDirectory()?size(f):fs.statSync(f).size;}return n;};return {library:size(path.join(this.root,'library')),cache:size(path.join(this.root,'cache')),trash:size(path.join(this.root,'trash'))};}
  cleanCache(protectedIds=[]){const base=path.join(this.root,'cache/jobs');let count=0;const removed=[];for(const ent of fs.readdirSync(base,{withFileTypes:true})){if(protectedIds.includes(ent.name)||!ent.isDirectory()||ent.isSymbolicLink())continue;const target=within(base,path.join(base,ent.name));fs.rmSync(target,{recursive:true});removed.push(ent.name);count++;}const runtime=readJSON(path.join(this.root,'runtime/runtime.json'),{});if(runtime.comfy){const source=within(this.root,runtime.comfy),output=path.join(source,'output/zow');if(fs.existsSync(output)){for(const id of removed){if(!/^[a-zA-Z0-9_-]+$/.test(id))continue;const target=within(output,path.join(output,id));if(fs.existsSync(target)){if(fs.lstatSync(target).isSymbolicLink())continue;fs.rmSync(target,{recursive:true});}}}}return {removed:count};}
}
