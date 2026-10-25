import {getSupportedThinkingLevels} from '@earendil-works/pi-ai';
export async function modelOptions(models,config={},remembered={}){
 const providers=[];for(const provider of models.getProviders()){let available=[];try{available=await models.getAvailable(provider.id);}catch{}if(available.length)providers.push({id:provider.id,name:provider.name,models:available.map(m=>({id:m.id,name:m.name,reasoning:!!m.reasoning,efforts:getSupportedThinkingLevels(m)}))});}
 const provider=providers.find(p=>p.id===config.provider),model=provider?.models.find(m=>m.id===config.model)||provider?.models[0];return {providers,selected:{provider:config.provider,model:model?.id||'',effort:config.effort||'auto'},remembered};
}
export async function validateModel(models,config){
 const available=await models.getAvailable(config.provider),model=available.find(m=>m.id===config.model);if(!model)throw Error('请先连接该模型服务 / Connect this model service first');const effort=config.effort||'auto';if(effort!=='auto'&&!getSupportedThinkingLevels(model).includes(effort))throw Error('这个模型不支持该思考强度 / Unsupported reasoning effort');return {provider:config.provider,model:model.id,effort};
}
export function rememberModel(store,config){store.configure({ai:{...store.settings.ai,...config},lastModel:{...config},modelChoices:{...store.settings.modelChoices,[config.provider]:{...config}}});}
