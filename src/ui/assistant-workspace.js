const ACTIVE=new Set(['running','waiting_user']);
const LABELS={connecting:['正在连接模型','Connecting to model'],waiting_model:['等待模型响应','Waiting for model'],thinking:['正在思考','Thinking'],writing:['正在组织回复','Writing a reply'],preparing_tool:['正在准备调用工具','Preparing a tool'],submit_music:['提交歌曲生成任务','Submitting songs'],read_library:['读取曲库与偏好','Reading library and preferences'],read_news:['检索相关新闻','Looking up news'],refresh_asset:['提交更新任务','Submitting an update'],resume_task:['恢复后台任务','Resuming a task'],ask_user:['向你确认创作要求','Asking for your preference'],user_answer:['已收到你的回答','Your answer was received'],assistant_update:['助手进度说明','Progress update'],generation:['后台生成','Background generation'],music:['歌曲生成','Generating audio'],cover:['封面生成','Generating artwork'],timing:['歌词时间对齐','Aligning lyrics'],complete:['已完成','Completed'],failed:['未完成','Failed'],cancelled:['已停止','Stopped'],interrupted:['上次请求已中断','Previous request was interrupted'],queued:['等待执行','Queued']};
const EFFORT={auto:['自动','Auto'],off:['关闭','Off'],minimal:['极低','Minimal'],low:['低','Low'],medium:['中','Medium'],high:['高','High'],xhigh:['很高','Extra high'],max:['最高','Maximum']};

export class AssistantWorkspace {
 constructor({api,language,navigate,notify,library,jobs,play}){
  Object.assign(this,{api,language,navigate,notify,library,jobs,play});this.lines=[];this.runs=[];this.options=null;this.activeId=null;this.conversationId=null;this.sessions=[];
  this.busy=false;this.sending=false;this.draft='';this.liveText='';this.follow=true;this.traceOpen=new Map();this.answerPending=false;
  this.clock=setInterval(()=>this.paintStatus(),1000);
 }
 get en(){return this.language()==='en';}
 label(key){return LABELS[key]?.[this.en?1:0]||key;}
 effortLabel(key){return EFFORT[key]?.[this.en?1:0]||key;}
 element(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
 button(text,fn,cls=''){const node=this.element('button',cls,text);node.type='button';node.onclick=()=>Promise.resolve().then(fn).catch(error=>this.notify(error.message));return node;}
 get visible(){return !!this.root?.isConnected;}
 get run(){return this.awaitingRun?null:this.runs.find(r=>r.id===this.activeId)||this.runs.at(-1);}
 get question(){return this.run?.status==='waiting_user'?this.run.question:null;}
 async load(){
  const token=(this.loadToken||0)+1;this.loadToken=token;const catalog=await this.api.conversations(),id=catalog.activeId;
  const [state,lines,options]=await Promise.all([this.api.chatState(id),this.api.chatHistory(id),this.api.chatOptions(id)]);
  if(token!==this.loadToken)return;
  this.sessions=catalog.sessions;this.conversationId=id;this.draft=this.sessions.find(s=>s.id===id)?.draft||'';this.sending=false;this.awaitingRun=false;
  this.runs=state.runs;this.activeId=state.activeId;this.busy=state.busy;this.lines=lines;this.options=options;
  this.liveText=this.run&&ACTIVE.has(this.run.status)?this.run.liveText||'':'';this.loaded=true;
 }
 async reloadOptions(){this.options=await this.api.chatOptions(this.conversationId);if(this.visible)this.paintSelectors();}
 render(main){
  const focused=this.visible&&document.activeElement===this.input,selection=focused?this.input.selectionStart:null;
  const scrollTop=this.log?.scrollTop||0;this.main=main;this.renderedLanguage=this.language();
  this.root=this.element('section','assistant-shell');const top=this.element('div','assistant-top');
  this.sessionButton=this.button('',()=>this.showSessions(),'conversation-switch outline');this.sessionButton.id='conversation-switch';const create=this.button(this.en?'+ New creation':'＋ 新建创作',()=>this.changeConversation('create'),'outline');create.id='new-conversation';top.append(this.element('strong','',this.en?'AI music assistant':'AI 音乐助手'),this.sessionButton,create,this.button(this.en?'Accounts':'模型与账号',()=>this.navigate('settings'),'outline'));this.root.append(top);this.paintTop();
  this.status=this.element('div','assistant-live-status');this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');this.root.append(this.status);
  this.log=this.element('div','chat-log');this.log.setAttribute('role','log');this.log.onscroll=()=>{this.follow=this.log.scrollHeight-this.log.scrollTop-this.log.clientHeight<90;};this.root.append(this.log);
  const composer=this.element('div','chat-composer');this.input=this.element('textarea');this.input.id='chat-input';this.input.value=this.draft;
  this.input.setAttribute('aria-label',this.en?'Your music request':'输入歌曲要求');this.input.oninput=()=>{this.draft=this.input.value;this.api.saveDraft(this.conversationId,this.draft).catch(e=>this.notify(e.message));};
  this.input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();this.send().catch(error=>this.notify(error.message));}};composer.append(this.input);
  const bottom=this.element('div','composer-actions');this.selectors=this.element('div','chat-model-controls');bottom.append(this.selectors);
  const controls=this.element('div','reply-actions');this.stopButton=this.button(this.en?'Stop reply':'停止回复',()=>this.api.stopChat(this.conversationId),'outline');this.stopButton.id='chat-stop';
  this.sendButton=this.button(this.en?'Send':'发送',()=>this.send(),'accent');this.sendButton.id='chat-send';controls.append(this.stopButton,this.sendButton);bottom.append(controls);composer.append(bottom,this.element('p','composer-hint',this.en?'Enter to send · Shift + Enter for a new line. Stopping a reply keeps submitted background jobs running.':'Enter 发送 · Shift + Enter 换行。停止回复不会取消已提交的后台生成任务。'));this.root.append(composer);main.append(this.root);
  this.paintSelectors();this.paintLog();this.paintStatus();this.paintComposer();
  if(!this.follow)this.log.scrollTop=scrollTop;
  if(focused)queueMicrotask(()=>{this.input.focus();if(selection!==null)this.input.setSelectionRange(selection,selection);});
 }
 paintSelectors(){
  if(!this.visible)return;this.selectors.replaceChildren();const providers=this.options?.providers||[],selected=this.options?.selected||{};
  if(!providers.length){this.selectors.append(this.button(this.en?'Connect a model':'连接模型账号',()=>this.navigate('settings'),'outline'));return;}
  const provider=providers.find(p=>p.id===selected.provider)||providers[0],model=provider.models.find(m=>m.id===selected.model)||provider.models[0];
  const make=(id,label,items,value)=>{const box=this.element('label','chat-select-label');box.append(this.element('span','',label));const select=this.element('select');select.id=id;select.setAttribute('aria-label',label);for(const item of items){const option=this.element('option','',item.label);option.value=item.value;select.append(option);}select.value=value;select.disabled=this.busy||this.sending;box.append(select);this.selectors.append(box);return select;};
  const service=make('chat-provider',this.en?'Service':'服务',providers.map(p=>({value:p.id,label:p.name})),provider.id);
  const models=make('chat-model',this.en?'Model':'模型',provider.models.map(m=>({value:m.id,label:m.name||m.id})),model.id);
  const levels=model.efforts||['off'];const effort=levels.includes(selected.effort)||selected.effort==='auto'?selected.effort:'auto';
  const thinking=make('chat-effort',this.en?'Reasoning':'思考强度',(model.reasoning?['auto',...levels]:['off']).map(value=>({value,label:this.effortLabel(value)})),model.reasoning?effort||'auto':'off');
  if(!model.reasoning){thinking.disabled=true;thinking.title=this.en?'This model does not expose adjustable reasoning effort.':'这个模型不支持调整思考强度。';}
  const save=async config=>{const id=this.conversationId;const options=await this.api.configureChat(config,id);if(id===this.conversationId){this.options=options;this.paintSelectors();}};
  service.onchange=()=>{const p=providers.find(p=>p.id===service.value);save({provider:p.id,model:p.models.find(m=>m.id===this.options?.remembered?.[p.id]?.model)?.id||p.models[0].id,effort:this.options?.remembered?.[p.id]?.effort||'auto'}).catch(e=>{this.notify(e.message);this.paintSelectors();});};
  models.onchange=()=>{const m=provider.models.find(m=>m.id===models.value);const nextEffort=(m.efforts||[]).includes(thinking.value)?thinking.value:'auto';save({provider:provider.id,model:m.id,effort:nextEffort}).catch(e=>{this.notify(e.message);this.paintSelectors();});};
  thinking.onchange=()=>save({provider:provider.id,model:model.id,effort:thinking.value}).catch(e=>{this.notify(e.message);this.paintSelectors();});
 }
 paintComposer(){
  if(!this.visible)return;const question=this.question;this.input.placeholder=question?(this.en?'Type your answer, or choose an option above…':'输入你的回答，或点击上方选项…'):(this.en?'Describe the song you want…':'想要什么歌曲？在这里告诉我…');
  this.sendButton.textContent=question?(this.en?'Send answer':'发送回答'):this.busy||this.sending?(this.en?'Working…':'处理中…'):(this.en?'Send':'发送');
  this.sendButton.disabled=!!this.answerPending||((this.busy||this.sending)&&!question);this.stopButton.hidden=!(this.busy||this.sending);
  this.root.querySelectorAll('.chat-model-controls select').forEach(select=>{if(select.id==='chat-effort'&&select.title)return;select.disabled=this.busy||this.sending;});
 }
 elapsed(run){const background=run.steps.some(s=>s.type==='batch'&&['running','queued'].includes(s.status));const seconds=Math.max(0,Math.floor((((ACTIVE.has(run.status)||background)?Date.now():run.endedAt||Date.now())-run.startedAt)/1000));return seconds>=60?`${Math.floor(seconds/60)}m ${seconds%60}s`:`${seconds}s`;}
 paintStatus(){
  if(!this.visible)return;this.status.replaceChildren();const run=this.run;
  if(!run&&!this.sending){this.status.append(this.element('span','idle-status',this.en?'Ready when you are':'准备就绪，随时开始'));return;}
  const background=run?.steps.some(s=>s.type==='batch'&&['running','queued'].includes(s.status));const backgroundFailed=run?.steps.some(s=>s.type==='batch'&&s.status==='failed');const running=this.sending||run&&ACTIVE.has(run.status)||background,waiting=run?.status==='waiting_user';
  this.status.classList.toggle('is-running',!!running);this.status.classList.toggle('is-waiting',!!waiting);
  let label=this.en?'Connecting to model':'正在连接模型';
  if(run){if(waiting)label=this.en?'Waiting for your answer':'等待你的回答';else if(ACTIVE.has(run.status)){
   const current=[...run.steps].reverse().find(s=>s.type!=='batch'&&s.status==='running');label=current?this.label(current.key):this.label(run.phase||'waiting_model');
  }else if(background)label=this.en?'Reply complete · generation continues in background':'回复完成 · 正在后台生成';else if(backgroundFailed)label=this.en?'Background generation needs attention':'后台生成未完成';else label=this.label(run.status);}
  this.status.append(this.element('span','work-indicator',waiting?'?':running?'●':run?.status==='failed'?'!':'✓'),this.element('strong','',label));
  if(run)this.status.append(this.element('span','elapsed',this.elapsed(run)));
  for(const trace of this.root.querySelectorAll('.run-trace')){const item=this.runs.find(r=>r.id===trace.dataset.runId);if(item){trace.querySelector('.trace-current').textContent=this.progressLabel(item);trace.querySelector('.trace-total').textContent=`${item.steps.length} ${this.en?'steps':'步'} · ${this.elapsed(item)}`;}}
 }
 renderTrace(run){
  const details=this.element('details','run-trace');details.dataset.runId=run.id;details.open=this.traceOpen.get(run.id)??false;
  const summary=this.element('summary');summary.append(this.element('span','trace-current',this.progressLabel(run)),this.element('span','trace-total',`${run.steps.length} ${this.en?'steps':'步'} · ${this.elapsed(run)}`));details.append(summary);details.append(this.element('p','run-context',`${run.model||''} · ${this.en?'Reasoning':'思考强度'}：${this.effortLabel(run.effectiveEffort||run.effort||'auto')}`));
  details.ontoggle=()=>{if(details.isConnected)this.traceOpen.set(run.id,details.open);};
  const list=this.element('ol','trace-steps');
  for(const step of run.steps){const row=this.element('li','trace-step '+step.status);row.dataset.stepType=step.type;row.dataset.stepKey=step.key;row.dataset.status=step.status;
   const status=this.element('span','trace-symbol',['running','queued'].includes(step.status)?'●':step.status==='complete'?'✓':step.status==='failed'?'!':'–');
   const content=this.element('div');content.append(this.element('strong','',this.label(step.key)));
   if(step.type==='batch'){const field=step.phase==='music'?'audio':step.phase==='cover'?'covers':'timing';content.append(this.element('p','',`${this.label(step.phase||'music')} · ${step[field]||0}/${step.total||0} · ${this.label(step.status)}`));content.append(this.button(this.en?'View background tasks':'查看后台任务',()=>this.navigate('tasks'),'trace-link'));}
   else if(step.type==='message')content.append(this.element('p','',step.text));
   else if(step.type==='answer')content.append(this.element('p','',step.answer));
   if(step.error)content.append(this.element('p','error',step.error));row.append(status,content);list.append(row);
  }
  details.append(list);if(run.error)details.append(this.element('p','trace-error',run.error));return details;
 }
 paintLog(){
  if(!this.visible)return;this.log.replaceChildren();
  if(!this.lines.length&&!this.liveText&&!this.run){const welcome=this.element('div','assistant-welcome');welcome.append(this.element('span','assistant-spark','✧'),this.element('h2','',this.en?'Your next favorite starts here.':'想听的歌，从这里开始。'),this.element('p','muted',this.en?'A mood, an idea, or a story is enough.':'说说心情、喜欢的曲风，或者今天发生的故事。'));const examples=this.element('div','assistant-examples');for(const text of(this.en?['Make a light Chinese song for working.','Write an English song for a rainy night.','Make three songs inspired by today’s tech news.']:['帮我生成一首适合工作时听的轻快中文歌','写一首适合雨夜听的英文歌','结合今天的科技新闻，帮我创作三首歌']))examples.append(this.button(text,()=>{this.draft=text;this.input.value=text;this.input.focus();},'example-prompt'));welcome.append(examples);this.log.append(welcome);}
  for(const line of this.lines){const bubble=this.element('div','chat-message '+line.role);bubble.append(this.element('small','',line.role==='user'?(this.en?'You':'你'):'AI'),this.element('div','',line.text));this.log.append(bubble);}
  this.liveBubble=null;
  if(this.liveText){this.liveBubble=this.element('div','chat-message assistant streaming');this.liveBubble.append(this.element('small','','AI'),this.element('div','live-reply-text',this.liveText));this.log.append(this.liveBubble);}
  this.progressSlot=this.element('div','chat-progress-slot');this.log.append(this.progressSlot);this.paintProgress();this.scroll();
 }
 paintProgress(){
  if(!this.visible||!this.progressSlot)return;this.progressSlot.replaceChildren();const run=this.run;
  if(run){this.progressSlot.append(this.renderTrace(run));if(run.question){const question=run.question,card=this.element('section','question-card');card.dataset.questionId=question.id;card.append(this.element('p','eyebrow',this.en?'YOUR INPUT NEEDED':'需要你的回答'),this.element('h3','',question.question));const options=this.element('div','question-options');for(const value of question.options)options.append(this.button(value,()=>this.answer(value),'outline'));card.append(options,this.element('p','note',this.en?'Or type your own answer below.':'也可以在下方输入自己的回答。'));this.progressSlot.append(card);}}
  const previous=this.runs.filter(r=>r.id!==run?.id).slice(-5);
  if(previous.length){const history=this.element('details','previous-runs');history.append(this.element('summary','',this.en?'Previous work progress':'查看之前的处理过程'));for(const old of previous){history.append(this.element('p','previous-run-title',old.request.slice(0,100)),this.renderTrace(old));}this.progressSlot.append(history);}
  this.paintResults();
 }
 scroll(){if(this.visible&&this.follow)this.log.scrollTop=this.log.scrollHeight;}
 handle(event){
  if(event.type==='conversations_changed'){this.updateCatalog().catch(e=>this.notify(e.message));return true;}
  if(event.conversationId&&event.conversationId!==this.conversationId)return true;
  if(event.type==='chat_run'){
   const index=this.runs.findIndex(r=>r.id===event.run.id);if(index<0)this.runs.push(event.run);else this.runs[index]=event.run;
   const needsAnswer=event.run.question&&event.run.question.id!==this.lastQuestionId;
   if(ACTIVE.has(event.run.status)){this.activeId=event.run.id;this.awaitingRun=false;}if(needsAnswer){this.lastQuestionId=event.run.question.id;this.follow=true;}
   if(event.run.id===this.activeId){this.busy=ACTIVE.has(event.run.status);if(ACTIVE.has(event.run.status))this.liveText=event.run.liveText||this.liveText;}
   this.paintStatus();this.paintProgress();if(needsAnswer)this.scroll();this.paintComposer();return true;
  }
  if(event.type==='delta'){
   if(event.runId&&this.activeId&&event.runId!==this.activeId)return true;
   this.liveText+=event.text;
   if(this.visible){if(!this.liveBubble){this.liveBubble=this.element('div','chat-message assistant streaming');this.liveBubble.append(this.element('small','','AI'),this.element('div','live-reply-text'));this.log.insertBefore(this.liveBubble,this.progressSlot);}this.liveBubble.querySelector('.live-reply-text').textContent=this.liveText;this.scroll();}
   return true;
  }
  return false;
 }
 async answer(value){
  const question=this.question;if(!question||this.answerPending)return;this.answerPending=true;this.paintComposer();
  try{const id=this.conversationId;await this.api.answerQuestion(question.id,value,id);await this.api.saveDraft(id,'');if(id===this.conversationId){this.draft='';if(this.input)this.input.value='';}}
  finally{this.answerPending=false;this.paintComposer();}
 }
 async send(){
  if(!this.draft.trim())return;
  if(this.question)return this.answer(this.draft.trim());
  if(this.busy||this.sending)return;
  const id=this.conversationId,available=await this.api.chatOptions(id);if(!available.providers.some(p=>p.id===available.selected.provider)){this.notify(this.en?'Connect a model account first. Your draft is kept.':'请先连接模型账号，你输入的要求已保留。');this.navigate('settings');return;}if(id!==this.conversationId)return;
  const text=this.draft;this.draft='';this.input.value='';this.lines.push({role:'user',text});this.liveText='';this.sending=true;this.busy=true;this.awaitingRun=true;this.follow=true;
  this.paintLog();this.paintStatus();this.paintComposer();this.paintSelectors();
  try{await this.api.chat(text,id);}
  catch(error){this.notify((this.en?'Request failed: ':'请求未完成：')+error.message);}
  finally{if(id===this.conversationId){const draft=this.draft;await this.load();this.draft=draft;this.sending=false;this.awaitingRun=false;this.liveText='';this.paintLog();this.paintStatus();this.paintComposer();this.paintSelectors();this.paintTop();}}
 }
 progressLabel(run){
  if(run.question)return this.en?'Waiting for your answer':'等待你的回答';
  if(ACTIVE.has(run.status)){const current=[...run.steps].reverse().find(s=>s.type!=='batch'&&s.status==='running');return this.label(current?.key||run.phase||'waiting_model')+'…';}
  const batch=[...run.steps].reverse().find(s=>s.type==='batch'&&['running','queued'].includes(s.status));
  if(batch){const field=batch.phase==='music'?'audio':batch.phase==='cover'?'covers':'timing';return `${this.label(batch.phase||'music')} · ${batch[field]||0}/${batch.total||0} · ${batch.audio||0} ${this.en?'playable':'首可播放'}`;}
  return this.label(run.steps.some(s=>s.status==='failed')?'failed':run.status);
 }
 paintTop(){if(!this.sessionButton)return;const current=this.sessions.find(s=>s.id===this.conversationId);const other=this.sessions.filter(s=>s.id!==this.conversationId&&['running','generating','waiting_user'].includes(s.status)).length;this.sessionButton.textContent=(current?.name||(this.en?'New creation':'新建创作'))+' ▾'+(other?` · ${other} ${this.en?'active':'项进行中'}`:'');}
 async updateCatalog(){const token=(this.catalogToken||0)+1;this.catalogToken=token;const catalog=await this.api.conversations();if(token!==this.catalogToken)return;this.sessions=catalog.sessions;this.paintTop();}
 async changeConversation(action,id){if(this.switching)return;this.switching=true;try{await this.api.saveDraft(this.conversationId,this.draft);if(action==='create')await this.api.createConversation();else await this.api.selectConversation(id);this.follow=true;this.liveText='';await this.load();if(this.main?.isConnected){this.main.replaceChildren();this.render(this.main);}}finally{this.switching=false;}}
 resultTrackIds(){const ids=new Set(this.runs.flatMap(r=>r.steps.filter(s=>s.type==='batch').map(s=>s.batchId))),tracks=new Set(this.library().tracks.map(t=>t.id));return (this.jobs()?.batches||[]).filter(b=>ids.has(b.id)).flatMap(b=>b.songs.map(s=>s.trackId)).filter(id=>tracks.has(id));}
 dialog(title){this.dialogNode?.remove();const dialog=this.element('dialog','conversation-dialog');dialog.append(this.element('h2','',title));const body=this.element('div');dialog.append(body);const close=this.button(this.en?'Close':'关闭',()=>dialog.close(),'outline');dialog.append(close);dialog.addEventListener('close',()=>{dialog.remove();if(this.dialogNode===dialog)this.dialogNode=null;});document.body.append(dialog);this.dialogNode=dialog;dialog.showModal();return {dialog,body};}
 async showSessions(){await this.updateCatalog();const {dialog,body}=this.dialog(this.en?'Your creations':'我的创作');const search=this.element('input');search.type='search';search.placeholder=this.en?'Search creations':'搜索创作';search.setAttribute('aria-label',search.placeholder);const rows=this.element('div','conversation-list');body.append(search,rows);const draw=()=>{rows.replaceChildren();for(const item of this.sessions.filter(s=>s.name.toLowerCase().includes(search.value.toLowerCase()))){const row=this.element('div','conversation-row');row.dataset.conversationId=item.id;const open=this.button('',async()=>{dialog.close();await this.changeConversation('select',item.id);},'conversation-open');const status={waiting_user:this.en?'Needs your answer':'等待你的回答',running:this.en?'Replying':'正在回复',generating:this.en?'Generating':'后台生成中',failed:this.en?'Needs attention':'需要处理',ready:this.en?'Saved':'已保存'}[item.status];open.append(this.element('strong','',item.name),this.element('small','',`${status} · ${new Date(item.updatedAt).toLocaleString(this.en?'en-US':'zh-CN')}${item.audio?' · '+item.audio+(this.en?' songs':' 首歌曲'):''}`));if(item.id===this.conversationId)open.classList.add('selected');row.append(open,this.button(this.en?'Rename':'重命名',()=>this.renameDialog(item),'outline'),this.button(this.en?'Delete':'删除',()=>this.deleteDialog(item),'outline'));rows.append(row);}if(!rows.children.length)rows.append(this.element('p','note',this.en?'No matching creations.':'没有匹配的创作。'));};search.oninput=draw;draw();search.focus();}
 renameDialog(item){const {dialog,body}=this.dialog(this.en?'Rename creation':'重命名创作');const input=this.element('input');input.value=item.name;input.maxLength=120;input.setAttribute('aria-label',this.en?'Creation name':'创作名称');const save=async()=>{await this.api.renameConversation(item.id,input.value);dialog.close();await this.updateCatalog();};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();save().catch(x=>this.notify(x.message));}};body.append(input,this.button(this.en?'Save':'保存',save,'accent'));input.focus();input.select();}
 deleteDialog(item){const {dialog,body}=this.dialog(this.en?'Delete this creation?':'删除这个创作？');body.append(this.element('p','',item.name),this.element('p','note',this.en?'Removes this conversation. Songs, artwork, lyrics and playlists in your library are kept.':'删除聊天记录；曲库里的歌曲、封面、歌词和播放列表都会保留。'));const remove=async mode=>{await this.api.deleteConversation(item.id,mode);dialog.close();await this.load();if(this.main?.isConnected){this.main.replaceChildren();this.render(this.main);}};const active=item.busy||['generating','waiting_user'].includes(item.status);if(active){body.append(this.element('p','note',this.en?'A reply or generation is still running. Deleting stops its reply; choose what to do with submitted generation.':'这个创作仍在处理。删除会停止助手回复；已提交的歌曲生成可选择保留或停止后续步骤。'),this.button(this.en?'Delete · keep generation':'删除会话，保留后台生成',()=>remove('keep'),'outline'),this.button(this.en?'Delete · stop remaining generation':'删除会话，停止后续生成',()=>remove('stop'),'outline'));}else body.append(this.button(this.en?'Delete creation':'删除创作',()=>remove('keep'),'accent'));}
 paintResults(){
  if(!this.visible||!this.progressSlot||!this.library)return;const state=this.library(),batches=this.jobs()?.batches||[];const ids=new Set(this.runs.flatMap(r=>r.steps.filter(s=>s.type==='batch').map(s=>s.batchId)));const owned=batches.filter(b=>ids.has(b.id));if(!owned.length)return;
  const section=this.element('section','creation-results');section.dataset.conversationId=this.conversationId;const songs=owned.flatMap(b=>b.songs),ready=songs.filter(s=>s.trackId&&state.tracks.some(t=>t.id===s.trackId));section.append(this.element('h3','',`${this.en?'This creation':'本次创作'} · ${ready.length}/${songs.length} ${this.en?'playable':'首可播放'}`));
  const expanded=this.resultsExpanded===this.conversationId,shown=expanded?[...songs].reverse():songs.slice(-3).reverse();
  for(const song of shown){const track=state.tracks.find(t=>t.id===song.trackId);const row=this.element('div','creation-song');if(track){row.dataset.trackId=track.id;const image=this.element('img');image.src=track.cover?this.api.media(track.id,'cover')+'?v='+track.cover:'../../assets/icon.png';image.alt='';image.onerror=()=>image.remove();const meta=this.element('div','creation-song-meta');meta.append(this.element('strong','',track.title));const notes=[this.en?'In music library':'已加入音乐库'];if(!track.cover)notes.push(this.en?'Artwork pending':'封面待补全');notes.push(track.timingStatus==='aligned'||track.timingStatus==='manual'?(this.en?'Lyrics aligned':'歌词已校时'):(this.en?'Timing not calibrated':'时间轴未校准'));meta.append(this.element('small','',notes.join(' · ')));const play=this.button(this.en?'▶ Play':'▶ 播放',()=>this.play(track.id),'outline');play.dataset.playTrack=track.id;const like=this.button(track.favorite?'♥':'♡',()=>this.api.favorite(track.id),'result-heart');like.setAttribute('aria-label',(this.en?'Like ':'喜欢：')+track.title);like.setAttribute('aria-pressed',String(!!track.favorite));row.append(image,meta,play,like,this.button(this.en?'Add to playlist':'加入列表',()=>this.resultPlaylist(track),'outline'));}else row.append(this.element('div','creation-song-meta',song.title),this.element('small','muted',song.trackId?(this.en?'Removed from library':'已从曲库移除'):song.music?.status==='failed'?(this.en?'Audio failed':'歌曲生成未完成'):(this.en?'Generating / queued':'等待或正在生成')));section.append(row);}
  if(songs.length>3){const toggle=this.button(expanded?(this.en?'Show recent songs':'收起，只看最近歌曲'):(this.en?`Show all ${songs.length} songs`:`展开全部 ${songs.length} 首`),()=>{this.resultsExpanded=expanded?null:this.conversationId;this.paintProgress();},'trace-link');toggle.id='results-expand';section.append(toggle);}
  if(ready.length)section.append(this.button(this.en?'Play completed songs':'播放已完成歌曲',()=>this.play(ready[0].trackId),'outline'));section.append(this.button(this.en?'Open library':'查看音乐库',()=>this.navigate('all'),'trace-link'));this.progressSlot.append(section);
 }
 resultPlaylist(track){const lists=this.library().playlists;const {dialog,body}=this.dialog(this.en?'Add to playlist':'加入播放列表');if(!lists.length){body.append(this.element('p','note',this.en?'Create a playlist in the left sidebar first.':'请先在左侧新建一个播放列表。'));return;}const select=this.element('select');for(const list of lists){const option=this.element('option','',list.name);option.value=list.id;select.append(option);}body.append(select,this.button(this.en?'Add':'加入',async()=>{await this.api.playlist('add',{id:select.value,trackId:track.id});dialog.close();this.notify(this.en?'Added':'已加入播放列表');},'accent'));}
}
