import fs from 'node:fs';
import path from 'node:path';
import {readJSON,writeJSON,uid,within} from './store.mjs';
import {ChatSession} from './chat-session.mjs';

// Each conversation owns its transcript, controller, question and model choice.
// Generation remains in the shared queue and the library owns the resulting files.
export class Conversations {
 constructor(host){
  this.host=host;this.indexFile=path.join(host.store.root,'chat-sessions.json');this.entries=new Map();
  this.db=readJSON(this.indexFile,{version:1,activeId:null,sessions:[]});
  if(!this.db.sessions.some(s=>!s.deletedAt)){const item=this.make('历史创作');item.legacy=true;this.db.sessions.push(item);this.db.activeId=item.id;}
  if(!this.db.sessions.some(s=>s.id===this.db.activeId&&!s.deletedAt))this.db.activeId=this.db.sessions.find(s=>!s.deletedAt).id;
  for(const item of this.db.sessions.filter(s=>!s.deletedAt))this.open(item);
  this.persist();host.queue.on?.('change',()=>{for(const entry of this.entries.values())entry.session.syncBatches();this.changed();});
 }
 make(name=''){return {id:uid(),name:name||'新建创作',createdAt:Date.now(),updatedAt:Date.now(),draft:'',ai:null,autoName:!name};}
 persist(){writeJSON(this.indexFile,this.db);}
 changed(){this.host.emit({type:'conversations_changed'});}
 open(item){
  if(this.entries.has(item.id))return this.entries.get(item.id);
  if(!/^[a-f0-9-]{36}$/.test(item.id))throw Error('Invalid conversation ID');
  const directory=item.legacy?this.host.store.root:path.join(this.host.store.root,'chat-sessions',item.id);
  if(!item.legacy)within(this.host.store.root,directory);
  fs.mkdirSync(directory,{recursive:true});
  const fork=Object.create(this.host);Object.defineProperties(fork,{messages:{value:readJSON(path.join(directory,'conversation.json'),[]),writable:true},busy:{value:false,writable:true},controller:{value:null,writable:true}});
  fork.emit=event=>{this.host.emit({...event,conversationId:item.id});if(event.type==='chat_run'){item.updatedAt=Date.now();this.persist();this.changed();}};
  fork.conversationId=item.id;fork.chatConfig=()=>item.ai||this.host.store.settings.ai;
  fork.configureAI=config=>{item.ai={...config};this.persist();if(this.db.activeId===item.id)this.host.store.configure({ai:config});};
  fork.session=new ChatSession(fork,{directory,subscribe:false});const entry={item,fork,session:fork.session};this.entries.set(item.id,entry);return entry;
 }
 entry(id=this.db.activeId){const item=this.db.sessions.find(s=>s.id===id&&!s.deletedAt);if(!item)throw Error('创作不存在 / Conversation missing');return this.open(item);}
 get current(){return this.entry();}
 get file(){return this.current.session.file;}get runs(){return this.current.session.runs;}get question(){return this.current.session.question;}get active(){return this.current.session.active;}
 snapshot(id){return {...this.entry(id).session.snapshot(),conversationId:id||this.db.activeId};}
 history(id){return this.entry(id).fork.messages.filter(m=>['user','assistant'].includes(m.role)).map(m=>({role:m.role,text:typeof m.content==='string'?m.content:m.content.filter(c=>c.type==='text').map(c=>c.text).join('\n')})).filter(m=>m.text);}
 list(){return {activeId:this.db.activeId,sessions:this.db.sessions.filter(s=>!s.deletedAt).map(item=>{const {session,fork}=this.entry(item.id),batches=this.batches(item.id),active=batches.filter(b=>['queued','running'].includes(b.status));return {...item,busy:fork.busy,waitingUser:!!session.question,status:session.question?'waiting_user':fork.busy?'running':active.length?'generating':(session.runs.at(-1)?.status==='failed'||batches.some(b=>b.status==='failed'))?'failed':'ready',audio:batches.reduce((n,b)=>n+b.songs.filter(s=>s.trackId).length,0)};}).sort((a,b)=>b.updatedAt-a.updatedAt)};}
 batches(id){const ids=new Set(this.entry(id).session.runs.flatMap(r=>r.steps.filter(s=>s.type==='batch').map(s=>s.batchId)));return (this.host.queue.state?.batches||[]).filter(b=>ids.has(b.id));}
 create(){if(!this.current.item.ai)this.current.item.ai=structuredClone(this.host.store.settings.ai);const item=this.make();item.ai=structuredClone(this.host.store.settings.lastModel||this.host.store.settings.ai||this.current.item.ai);this.db.sessions.push(item);this.db.activeId=item.id;this.open(item);this.persist();this.changed();return this.list();}
 select(id){const selected=this.entry(id);if(!this.current.item.ai)this.current.item.ai=structuredClone(this.host.store.settings.ai);this.db.activeId=id;if(selected.item.ai)this.host.store.configure({ai:selected.item.ai});this.persist();this.changed();return this.list();}
 rename(id,name){if(typeof name!=='string'||!name.trim()||name.length>120)throw Error('名称不能为空且不超过120字');const {item}=this.entry(id);item.name=name.trim();item.autoName=false;this.persist();this.changed();return this.list();}
 draft(id,value){if(typeof value!=='string'||value.length>20000)throw Error('Draft too long');this.entry(id).item.draft=value;this.persist();return true;}
 remove(id,mode='keep'){
  if(!['keep','stop'].includes(mode))throw Error('Invalid deletion choice');const entry=this.entry(id);entry.session.stop();
  if(mode==='stop')for(const batch of this.batches(id))if(['queued','running'].includes(batch.status))this.host.queue.cancel(batch.id);
  entry.item.deletedAt=Date.now();entry.item.draft='';this.entries.delete(id);
  if(this.db.activeId===id){const next=this.db.sessions.find(s=>!s.deletedAt);if(next)this.db.activeId=next.id;else{const item=this.make();this.db.sessions.push(item);this.db.activeId=item.id;this.open(item);}}
  this.persist();this.changed();return this.list();
 }
 options(id){return this.entry(id).session.options();}configure(config,id){return this.entry(id).session.configure(config);}
 answer(questionId,value,id){return this.entry(id).session.answer(questionId,value);}stop(id){return this.entry(id).session.stop();}
 askUser(input){return this.current.session.askUser(input);}
 async chat(text,id){const entry=this.entry(id);if(entry.item.autoName||entry.item.name==='历史创作'&&!entry.fork.messages.length){entry.item.name=String(text).replace(/\s+/g,' ').trim().slice(0,28);entry.item.autoName=false;}entry.item.draft='';this.persist();try{return await entry.session.chat(text);}finally{this.changed();}}
 abort(){for(const entry of this.entries.values())entry.session.stop();}
}
