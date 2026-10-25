import {createProvider} from '@earendil-works/pi-ai';
import {stream,streamSimple} from '@earendil-works/pi-ai/api/openai-completions';

export function validateCustomProvider(input){
 const name=String(input.name||'').trim(),model=String(input.model||'').trim();
 if(!name||name.length>80||!model||model.length>160)throw Error('请填写服务名称和模型名称 / Service and model names are required');
 const url=new URL(String(input.baseURL||'').trim());
 const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw Error('远程接口请使用 HTTPS / Remote endpoints must use HTTPS');
 if(url.username||url.password||url.search||url.hash)throw Error('接口地址不能包含密钥或查询参数 / Keep credentials out of the endpoint URL');
 return {id:input.id,name,model,baseURL:url.href.replace(/\/+$/,''),local};
}
export function customProvider(config){
 if(!/^custom-[a-f0-9-]{36}$/.test(config.id||''))throw Error('Invalid custom provider identity');
 config=validateCustomProvider(config);
 const model={id:config.model,name:config.model,type:'chat',provider:config.id,api:'openai-completions',baseUrl:config.baseURL,reasoning:false,input:['text'],contextWindow:64000,maxTokens:8192,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}};
 return createProvider({id:config.id,name:config.name,baseUrl:config.baseURL,models:[model],api:{stream,streamSimple},auth:{apiKey:{name:'API key',login:async interaction=>({type:'api_key',key:await interaction.prompt({type:'secret',message:'API 密钥'})}),check:async({credential})=>credential?.key?{type:'api_key',source:'stored credential'}:undefined,resolve:async({credential})=>credential?.key?{auth:{apiKey:credential.key},source:'stored credential'}:undefined}}});
}
