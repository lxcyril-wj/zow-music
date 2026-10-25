const {contextBridge,ipcRenderer}=require('electron');
const channels=['snapshot','import','playlist','favorite','remove','lyrics','saveLyrics','configure','storage','clean','jobs','pause','retry','cancel','generate','modules','comfyStatus','chooseRuntime','chooseWorkers','chat','aiProviders','aiLogin','aiKey','aiLogout','authAnswer','exportPlaylist','importPlaylist','openData','installModule'];
const api={};for(const name of channels)api[name]=(...args)=>ipcRenderer.invoke('zow:'+name,...args);
for(const name of ['installStatus','installPackage','enhance','capabilities','accountStatus','chatHistory','conversations','createConversation','selectConversation','renameConversation','saveDraft','deleteConversation','chatState','chatOptions','configureChat','answerQuestion','stopChat','addCustomProvider','cancelSignIn','openOfficialSite','radioModelOptions','configureRadioModel','radioState','radioStart','radioUpdate','radioStop','radioProgress'])api[name]=(...args)=>ipcRenderer.invoke('zow:'+name,...args);
api.onInstaller=fn=>{const handler=(_,v)=>fn(v);ipcRenderer.on('zow:installer',handler);return ()=>ipcRenderer.removeListener('zow:installer',handler);};
api.onChange=fn=>{const handler=()=>fn();ipcRenderer.on('zow:changed',handler);return ()=>ipcRenderer.removeListener('zow:changed',handler);};
api.onAI=fn=>{const handler=(_,v)=>fn(v);ipcRenderer.on('zow:ai',handler);return ()=>ipcRenderer.removeListener('zow:ai',handler);};
api.media=(id,kind='audio')=>'zow-media://library/'+encodeURIComponent(id)+'/'+kind;
contextBridge.exposeInMainWorld('zow',api);
