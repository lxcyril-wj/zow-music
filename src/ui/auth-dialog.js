// The browser callback and manual fallback race. Only the active prompt may close
// this dialog; a late completion must never submit or cancel another dialog.
export class AuthDialog {
 constructor({dialog,title,body,ok,cancel,answer,english,cancelFlow}){Object.assign(this,{dialog,title,body,ok,cancel,answer,english,cancelFlow});this.current=null;}
 show(event){
  if(this.current)this.close(this.current.id);
  const {id,provider,request}=event,en=this.english(),doc=this.dialog.ownerDocument;
  const make=(tag,text)=>{const e=doc.createElement(tag);if(text)e.textContent=text;return e;};
  const pending={id,provider,oldOK:this.ok.textContent,oldCancel:this.cancel.textContent};this.current=pending;
  this.dialog.onclose=null;this.ok.disabled=false;this.dialog.returnValue='';this.body.replaceChildren();
  this.cancel.textContent=en?'Cancel sign-in':'取消登录';
  let input;
  if(request.type==='device_code'){
   this.title.textContent=en?'Authorize in your browser':'请在浏览器完成授权';this.body.append(make('p',en?'Enter this code on the authorization page that was opened. This window closes automatically when connected.':'请在已打开的授权页面输入下方验证码，连接成功后这里会自动关闭。'));const code=make('code',event.code);code.className='auth-device-code';this.body.append(code);this.ok.hidden=true;
  }else if(request.type==='manual_code'){
   this.title.textContent=en?'Complete sign-in in your browser':'请在浏览器完成登录';
   this.body.append(make('p',en?'This window closes automatically when the account is connected.':'账号连接完成后，这个窗口会自动关闭，无需填写或保存。'));
   const details=make('details');details.className='auth-fallback';details.append(make('summary',en?'Browser did not return?':'浏览器没有自动返回？'));
   details.append(make('p',en?'Only if automatic return fails, paste the complete redirect URL below.':'只有无法自动返回时，才需要在这里粘贴浏览器最后的完整回调地址。'));
   input=make('input');input.id='auth-manual-input';input.autocomplete='off';input.setAttribute('aria-label',en?'Final redirect URL':'完整回调地址');details.append(input);this.body.append(details);
   this.ok.textContent=en?'Continue connecting':'继续连接';this.ok.hidden=true;
   details.ontoggle=()=>{if(this.current===pending)this.ok.hidden=!details.open;};
  }else{
   this.title.textContent=request.type==='select'?(en?'Choose a sign-in method':'选择登录方式'):request.message;
   input=make(request.type==='select'?'select':'input');if(request.type==='secret')input.type='password';
   for(const option of request.options||[]){const o=make('option',option.label);o.value=option.id;input.append(o);}this.body.append(input);
   this.ok.textContent=en?'Continue':'继续';this.ok.hidden=false;
  }
  this.ok.onclick=e=>{if(request.type==='manual_code'&&!input.value.trim()){e.preventDefault();input.focus();}};
  pending.onClose=()=>{if(this.current!==pending)return;const value=this.dialog.returnValue==='ok'?input?.value:null;this.reset(pending);if(request.type==='device_code')this.cancelFlow?.();else this.answer(id,value);};
  this.dialog.addEventListener('close',pending.onClose);this.dialog.showModal();
 }
 reset(pending){this.dialog.removeEventListener('close',pending.onClose);this.ok.onclick=null;this.ok.hidden=false;this.ok.textContent=pending.oldOK;this.cancel.textContent=pending.oldCancel;this.current=null;}
 close(id){const pending=this.current;if(!pending||pending.id!==id)return;this.reset(pending);if(this.dialog.open)this.dialog.close('auth-finished');}
 finish(provider){if(this.current&&(!provider||this.current.provider===provider))this.close(this.current.id);}
}
