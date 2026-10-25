import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Store,writeJSON} from '../src/core/store.mjs';
import {capabilityStatus,installationPlan} from '../src/core/capabilities.mjs';
import {Installer} from '../src/core/installer.mjs';

fs.mkdirSync(path.resolve('output/v6'),{recursive:true});
const fixture=()=>{const root=fs.mkdtempSync(path.resolve('output/v6/capability-'));return new Store(root);};
const touch=file=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');};
test('module status checks actual required files without loading models',()=>{
 const store=fixture();assert.ok(capabilityStatus(store).modules.every(m=>!m.ready));
 const comfy=path.join(store.root,'runtime/engine'),python=path.join(store.root,'runtime/python.exe');touch(python);touch(path.join(comfy,'main.py'));writeJSON(path.join(store.root,'runtime/runtime.json'),{python,comfy});
 assert.ok(capabilityStatus(store).modules.every(m=>!m.ready));
 touch(path.join(comfy,'models/checkpoints/yue2_3b_int8_convrot.safetensors'));
 assert.equal(capabilityStatus(store).modules.find(m=>m.id==='music').ready,true);
 assert.equal(capabilityStatus(store).modules.find(m=>m.id==='cover').ready,false);
});
test('one module install includes runtime automatically and downloads only that capability',async()=>{
 const store=fixture(),calls=[],installer=new Installer(store,()=>{});
 installer.runtime=async()=>calls.push('runtime');installer.models=async kind=>calls.push(kind);
 await installer.run('music');assert.deepEqual(calls,['runtime','music-int8']);
 assert.deepEqual(installationPlan('timing',store.settings).files,['whisper-small','qwen']);
 assert.deepEqual(installationPlan('cover-high',store.settings).files,['cover-bf16']);
});
test('advanced quality switches only after a successful install',async()=>{
 const store=fixture(),installer=new Installer(store,()=>{});installer.runtime=async()=>{};
 installer.models=async()=>{throw Error('download interrupted');};
 await assert.rejects(()=>installer.run('music-high'));assert.equal(store.settings.modules.music,'yue2-int8');
 installer.models=async()=>{};await installer.run('music-high');assert.equal(store.settings.modules.music,'yue2-bf16');
});
