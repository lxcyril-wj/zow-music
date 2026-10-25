import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Store} from '../src/core/store.mjs';
import {MusicAI} from '../src/core/ai.mjs';
fs.mkdirSync(path.resolve('output/v7'),{recursive:true});
const fixture=()=>{const root=fs.mkdtempSync(path.resolve('output/v7/oauth-')),events=[];const storage={isEncryptionAvailable:()=>true,encryptString:x=>Buffer.from(x),decryptString:x=>x.toString()};const ai=new MusicAI(new Store(root),{},storage,event=>events.push(event),()=>{});return {ai,events};};

test('automatic browser completion dismisses the manual fallback and clears listeners',async()=>{
 const {ai,events}=fixture(),login=new AbortController(),manual=new AbortController();
 const pending=ai.requestAuthInput('openai',{type:'manual_code',signal:manual.signal},login);
 const rejection=assert.rejects(pending,/no longer needed/);manual.abort();await rejection;
 assert.equal(ai.pending.size,0);assert.equal(events.filter(x=>x.type==='auth_prompt_closed').length,1);
 login.abort();assert.equal(events.filter(x=>x.type==='auth_prompt_closed').length,1);
});

test('a late close of an old prompt cannot cancel a new sign-in',async()=>{
 const {ai,events}=fixture(),first=new AbortController(),controller=new AbortController();
 const a=ai.requestAuthInput('openai',{type:'manual_code',signal:first.signal},controller);const oldId=events.at(-1).id;
 const rejected=assert.rejects(a);first.abort();await rejected;
 const nextController=new AbortController();ai.authController=nextController;
 const next=ai.requestAuthInput('openai',{type:'manual_code'},nextController);const nextId=events.at(-1).id;
 ai.answer(oldId,null);assert.equal(nextController.signal.aborted,false);
 ai.answer(nextId,'manual-input');assert.equal(await next,'manual-input');assert.equal(ai.pending.size,0);
});

test('login completes only after credential persistence and emits a connected event',async()=>{
 const {ai,events}=fixture();ai.models.login=async(provider,type,interaction)=>{
  const manual=new AbortController();const fallback=interaction.prompt({type:'manual_code',signal:manual.signal});fallback.catch(()=>{});
  manual.abort();await ai.modify(provider,async()=>({type:'oauth',access:'fixture-access',refresh:'fixture-refresh',expires:Date.now()+60000}));
 };
 await ai.login('openai');assert.equal((await ai.read('openai')).type,'oauth');
 assert.ok(events.find(e=>e.type==='auth_complete'));assert.equal(ai.pending.size,0);assert.equal(ai.authController,null);
});

test('cancelling a live prompt aborts its login without deleting saved credentials',async()=>{
 const {ai,events}=fixture();await ai.key('openai','previous-fixture');const controller=new AbortController();ai.authController=controller;
 const prompt=ai.requestAuthInput('openai',{type:'manual_code'},controller);const id=events.at(-1).id;
 const rejection=assert.rejects(prompt);ai.answer(id,null);await rejection;
 assert.equal(controller.signal.aborted,true);assert.equal((await ai.read('openai')).key,'previous-fixture');
});
