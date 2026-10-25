export class ProviderPanel {
 constructor({api,language,navigate,notify,onChanged}){Object.assign(this,{api,language,navigate,notify,onChanged});this.providers=[];this.editorId=null;}
 get en(){return this.language()==='en';}
 node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
 button(text,action,cls='outline'){const b=this.node('button',cls,text);b.type='button';b.onclick=()=>Promise.resolve().then(action).catch(e=>this.notify(e.message));return b;}
 field(parent,label,type='text',value=''){const l=this.node('label','provider-field',label),input=this.node('input');input.type=type;input.value=value;input.autocomplete='off';l.append(input);parent.append(l);return input;}
 render(parent){this.root=this.node('section','card provider-panel');this.root.append(this.node('h3','',this.en?'Models & accounts':'模型与账号'));this.content=this.node('div');this.root.append(this.content);parent.append(this.root);this.reload().catch(e=>this.notify(e.message));}
 async reload(){[this.providers,this.snapshot]=await Promise.all([this.api.aiProviders(),this.api.snapshot()]);if(this.root?.isConnected)this.paint();}
 paint(){
  this.content.replaceChildren();const configured=this.providers.filter(p=>p.configured),active=this.snapshot.settings.ai?.provider;
  const list=this.node('div','configured-providers');list.id='configured-providers';
  if(!configured.length)list.append(this.node('p','note',this.en?'Connect a service to start chatting.':'连接一个服务后，就可以开始聊天创作。'));
  for(const p of configured){const row=this.node('div','configured-provider');row.dataset.providerId=p.id;const info=this.node('div');info.append(this.node('strong','',p.name),this.node('p','provider-state',`${this.en?'Configured':'已配置'} · ${p.authType==='oauth'?(this.en?'Account authorization':'账号授权'):(this.en?'API credentials':'API 配置')}${active===p.id?(this.en?' · In use':' · 正在使用'):''}`));const controls=this.node('div','provider-actions');if(active!==p.id)controls.append(this.button(this.en?'Use':'使用',()=>this.use(p)));controls.append(this.button(this.en?'Reconfigure':'重新配置',()=>{this.editorId=p.id;this.paint();}));row.append(info,controls);list.append(row);}
  this.content.append(list);const actions=this.node('div','provider-main-actions');actions.append(this.button(this.en?'+ Add a service':'＋ 添加模型服务',()=>this.pick(),'accent'),this.button(this.en?'Open AI music assistant →':'进入 AI 音乐助手 →',()=>this.navigate('studio')));this.content.append(actions);
  if(this.editorId){const p=this.providers.find(p=>p.id===this.editorId);if(p)this.renderEditor(p);}
 }
 pick(){
  const d=document.createElement('dialog');d.className='provider-picker';const title=this.node('div','provider-picker-head');title.append(this.node('h2','',this.en?'Add a model service':'添加模型服务'),this.button('×',()=>d.close()));d.append(title);const search=this.field(d,this.en?'Search services':'搜索服务','search');search.placeholder=this.en?'OpenAI, DeepSeek, Qwen, MiniMax…':'OpenAI、DeepSeek、通义、智谱、MiniMax…';
  const grid=this.node('div','provider-catalog');const aliases={qwen:'通义 千问',zai:'智谱',moonshot:'月之暗面 Kimi',minimax:'海螺',google:'谷歌 Gemini',anthropic:'Claude'};
  const draw=()=>{grid.replaceChildren();const query=search.value.trim().toLowerCase();for(const p of this.providers){const extra=Object.entries(aliases).filter(([key])=>p.id.includes(key)).map(([,value])=>value).join(' ');if(query&&!`${p.name} ${p.id} ${extra}`.toLowerCase().includes(query))continue;const card=this.button('',()=>{this.editorId=p.id;d.close();this.paint();},'provider-choice');card.dataset.providerId=p.id;card.append(this.node('strong','',p.name),this.node('small','',p.configured?(this.en?'Configured · reconfigure':'已配置 · 可重新配置'):[p.oauth?(this.en?'Account sign-in':'账号授权'):null,p.apiKey?'API':null].filter(Boolean).join(' / ')));grid.append(card);}if(!grid.children.length)grid.append(this.node('p','note',this.en?'No matching service.':'没有找到匹配的服务。'));};search.oninput=draw;d.append(grid,this.button(this.en?'+ Custom OpenAI-compatible endpoint':'＋ 自定义兼容接口',()=>{d.close();this.renderCustom(null);},'outline'));draw();document.body.append(d);d.onclose=()=>d.remove();d.showModal();search.focus();
 }
 renderEditor(provider){
  const area=this.node('div','provider-editor');const head=this.node('div','provider-picker-head');head.append(this.node('h3','',provider.name),this.button(this.en?'Close':'收起',()=>{this.editorId=null;this.paint();}));area.append(head,this.node('p','note',provider.configured?(this.en?'Your existing configuration is kept until a new sign-in completes.':'已有配置会保留，完成新的配置后才替换。'):(this.en?'Choose a supported sign-in method. Additional required fields are requested automatically.':'选择连接方式，必要的信息会由向导逐步提示。')));
  const methods=this.node('div','row');
  const configure=async type=>{await this.api.aiLogin(provider.id,type);await this.reload();const fresh=this.providers.find(p=>p.id===provider.id);await this.use(fresh);this.editorId=null;await this.reload();this.notify(this.en?'Service configured.':'服务已配置。');};
  if(provider.custom){methods.append(this.button(this.en?'Edit endpoint':'修改接口配置',()=>this.renderCustom(provider)));}
  else{if(provider.oauth)methods.append(this.button(provider.configured?(this.en?'Authorize again':'重新授权'):(this.en?'Sign in with account':'账号授权登录'),()=>configure('oauth'),'accent'));if(provider.apiKey)methods.append(this.button(this.en?'Configure API':'配置 API',()=>configure('api_key')));}
  area.append(methods);this.content.append(area);area.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 async use(provider){
  const options=await this.api.chatOptions(),available=options.providers.find(p=>p.id===provider.id);if(!available?.models.length)throw Error(this.en?'This service needs reconnection.':'该服务需要重新连接，请点击重新配置。');
  const previous=this.snapshot.settings.ai,model=previous?.provider===provider.id?available.models.find(m=>m.id===previous.model)||available.models[0]:available.models[0];
  await this.api.configureChat({provider:provider.id,model:model.id,effort:previous?.provider===provider.id&&(previous.effort==='auto'||model.efforts?.includes(previous.effort))?previous.effort:'auto'});await this.onChanged?.();await this.reload();
 }
 renderCustom(provider){
  const old=this.content.querySelector('.custom-provider-editor');old?.remove();const c=this.node('div','provider-editor custom-provider-editor');c.append(this.node('h3','',this.en?'OpenAI-compatible endpoint':'自定义兼容接口'));const config=provider?.customConfig||{};
  const name=this.field(c,this.en?'Service name':'服务名称','text',config.name||''),url=this.field(c,this.en?'API base URL':'接口地址','text',config.baseURL||''),model=this.field(c,this.en?'Model name':'模型名称','text',config.model||''),key=this.field(c,this.en?'API key (optional for local services)':'API 密钥（本地服务可留空）','password');url.placeholder='https://example.com/v1';key.placeholder=provider?(this.en?'Leave blank to keep the saved key':'留空保留已保存的密钥'):'';
  c.append(this.button(this.en?'Save and use':'保存并使用',async()=>{const id=await this.api.addCustomProvider({id:provider?.id,name:name.value,baseURL:url.value,model:model.value},key.value);key.value='';this.editorId=null;await this.reload();await this.use(this.providers.find(p=>p.id===id));},'accent'));this.content.append(c);c.scrollIntoView({block:'nearest',behavior:'smooth'});name.focus();
 }
}
