import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {commands} from '../src/catalog.mjs';
import {prepareInstrumentation,restoreInstrumentation} from '../src/play-instrumentation.mjs';
import {runPlay} from '../src/play.mjs';
import {preparePlayMaterial} from '../src/play-material.mjs';
const {Runtime,humanActionCatalog}=createRequire(import.meta.url)('../editor-plugin/runtime.cjs');
const game="let game2DDidRunInit = false;\n    onEvent(event: any) {\n            this.activeScene.update(Date.now(), dt * 1000);\n        this.emit('RecordStart', null);\n        this.emit('RecordEnd', null);\n";
const detector="import {Game2D} from './Game2D';\nconst pitch=sharedPitchHandle?.getResult() ?? -1;\nconst volume=sharedVolumeHandle?.getResult() ?? -1;";
const keyword="import {Game2D} from './Game2D';\n    private targetKeywords: string[] = [];\n        this.subscribeRuntimeListeners();\n        this.unsubscribeRuntimeListeners();";
async function temp(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiangsu-96-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}

test('音频运行库兼容旧名、新名和混合工程；结构失败全批零写入，成功后逐文件恢复',async t=>{
 const root=await temp(t);await fs.mkdir(path.join(root,'Assets'));
 const sources={'Game2D.ts':game,'AgentAudioDetector.ts':detector,'AudioDetector.ts':detector,'AgentAudioKeyword.ts':keyword,'KeywordDetector.ts':keyword};
 for(const [name,text]of Object.entries(sources))await fs.writeFile(path.join(root,'Assets',name),text);
 const c={projectPath:root,prepare:async()=>{}},state={id:'mixed'};
 await fs.writeFile(path.join(root,'Assets/KeywordDetector.ts'),'unsupported');
 await assert.rejects(()=>prepareInstrumentation(state,c,async()=>{}),/NOT_SUPPORTED/);
 assert.equal(await fs.readFile(path.join(root,'Assets/Game2D.ts'),'utf8'),game);
 await fs.writeFile(path.join(root,'Assets/KeywordDetector.ts'),keyword);
 assert.deepEqual(await prepareInstrumentation(state,c,async()=>{}),{state:true,audioDetector:true,keyword:true});
 assert.equal(state.instrumentation.length,5);
 for(const n of ['AudioDetector.ts','AgentAudioDetector.ts'])assert.match(await fs.readFile(path.join(root,'Assets',n),'utf8'),/mcpAudioValue\('pitchHz'\)/);
 await restoreInstrumentation(state,c);
 for(const [name,text]of Object.entries(sources))assert.equal(await fs.readFile(path.join(root,'Assets',name),'utf8'),text);
 for(const old of ['AgentAudioDetector.ts','AgentAudioKeyword.ts'])await fs.unlink(path.join(root,'Assets',old));
 assert.deepEqual(await prepareInstrumentation({id:'new-only'},c,async()=>{}),{state:true,audioDetector:true,keyword:true});
});

async function makeRuntime(t,editorVersion){
 const root=await temp(t),project=path.join(root,'project'),preview=path.join(root,'preview');
 await fs.mkdir(project);await fs.mkdir(preview);await fs.writeFile(path.join(project,'effect.dyehpj'),'{}');
 await fs.writeFile(path.join(preview,'action.mp4'),'fixture');
 const manifest=path.join(preview,'PreviewResources.json');
 await fs.writeFile(manifest,JSON.stringify({defaultVideoInputModels:[{name:'legacy_open_mouth||女',type:'preview_face',resourceUrl:'action.mp4'}]}));
 const config={editorVersion,stateRoot:path.join(root,'sessions'),allowedRoots:[project],catalogPath:path.join(root,'commands.json'),previewCatalogs:[{manifest,baseRoot:preview}]};
 await fs.writeFile(config.catalogPath,JSON.stringify(commands));
 const calls=[];let failSwitch=false,failRestore=false;
 const runtime=new Runtime(config,{getProject:()=>({path:project}),execute:async r=>{calls.push(r);if(r.commandType==='switchHumanAction'&&failSwitch)throw Error('switch failed');if(r.commandType==='restoreHumanActionSession'&&failRestore)throw Error('restore failed');return {success:true};}});
 runtime.start();t.after(()=>runtime.stop());
 const call=(command,params={})=>runtime.execute({id:'fixture',sessionId:runtime.session,projectPath:project,command,params,expiresAt:Date.now()+30000});
 return {root,project,preview,config,calls,runtime,call,setFailure:(s,r)=>{failSwitch=s;failRestore=r;}};
}
test('9.4/9.5 保持 actionId 单参数调用，不引入动作会话或素材路径前置条件',async t=>{
 for(const version of ['9.4.0','9.4.1','9.5.2']){
  const {call,calls}=await makeRuntime(t,version);
  await call('switchHumanAction',{actionId:'existing-id'});
  assert.deepEqual(calls.at(-1).paramKeys,['actionId']);assert.deepEqual(calls.at(-1).params,{actionId:'existing-id'});
  await call('getHumanActions');assert.equal(calls.at(-1).commandType,'getHumanActions');
  await assert.rejects(()=>call('switchHumanAction',{materialRef:'new.mp4',inputType:'preview_face'}),/REQUIRES_9_6/);
  assert.equal(calls.length,2);
 }
});
test('9.6 将旧动作 ID 映射到官方素材，支持工程内素材，恢复失败保留身份供重试',async t=>{
 const x=await makeRuntime(t,'9.6.0'),{call,calls,project,preview,runtime}=x;
 assert.equal(humanActionCatalog(x.config)[0].id,'legacy_open_mouth');
 await call('switchHumanAction',{actionId:'legacy_open_mouth'});
 assert.deepEqual(calls.map(c=>c.commandType),['beginHumanActionSession','switchHumanAction']);
 assert.deepEqual(calls[1].paramKeys,['sessionId','actionId','filePath','inputType']);
 assert.equal(calls[1].params.filePath,path.join(preview,'action.mp4'));
 assert.equal(calls[1].params.inputType,'preview_face');
 await assert.rejects(()=>call('beginHumanActionSession',{sessionId:'different'}),/SESSION_ACTIVE/);
 x.setFailure(false,true);await assert.rejects(()=>call('restoreHumanActionSession'),/restore failed/);
 assert.ok(await fs.stat(path.join(runtime.dir,'human-action.json')));
 x.setFailure(false,false);await call('restoreHumanActionSession');
 await assert.rejects(()=>fs.access(path.join(runtime.dir,'human-action.json')),/ENOENT/);
 calls.length=0;await assert.rejects(()=>call('switchHumanAction',{materialRef:path.join(preview,'action.mp4'),inputType:'preview_hand'}),/边界/);assert.equal(calls.length,0);
 await fs.writeFile(path.join(project,'custom.mp4'),'fixture');
 await call('switchHumanAction',{materialRef:'custom.mp4',inputType:'preview_hand'});
 assert.equal(calls.at(-1).params.filePath,path.join(project,'custom.mp4'));
 await call('restoreHumanActionSession');
 x.setFailure(true,false);calls.length=0;await assert.rejects(()=>call('switchHumanAction',{actionId:'legacy_open_mouth'}),/switch failed/);
 assert.deepEqual(calls.map(c=>c.commandType),['beginHumanActionSession','switchHumanAction','restoreHumanActionSession']);
});
test('9.6 试玩动作失败立即恢复；恢复失败可在 finish 重试，错误批次不先执行触摸',async t=>{
 const root=await temp(t),dir=path.join(root,'session');await fs.mkdir(dir);await fs.writeFile(path.join(root,'clip.mp4'),'fixture');
 const file=path.join(dir,'play-state.json');await fs.writeFile(file,JSON.stringify({id:'play96',active:true,sessionId:'session',projectPath:root,step:0,recordingBegun:false}));
 const calls=[];let failRestore=true;
 const c={editorVersion:'9.6.0',stateRoot:root,sessionId:'session',projectPath:root,validate:()=>{},call:async(name,p)=>{calls.push({name,p});if(name==='switchHumanAction')throw Error('switch failure');if(name==='restoreHumanActionSession'&&failRestore)throw Error('restore failure');return {success:true};}};
 await assert.rejects(()=>runPlay('playStep',{actions:[{commandType:'touch',params:{x:0.5,y:0.5},waitAfterMs:10},{commandType:'switch_human_action',params:{materialRef:'../outside.mp4',inputType:'preview_face'},waitAfterMs:10}]},c),/边界/);
 assert.equal(calls.length,0);
 const result=await runPlay('playStep',{actions:[{commandType:'switch_human_action',params:{materialRef:'clip.mp4',inputType:'preview_face'},waitAfterMs:20}]},c);
 assert.equal(result.success,false);assert.match(result.error,/restore failure/);
 assert.deepEqual(calls.map(c=>c.name),['beginHumanActionSession','switchHumanAction','restoreHumanActionSession','pausePreview']);
 assert.equal(JSON.parse(await fs.readFile(file)).humanActionSessionRequested,true);
 failRestore=false;assert.equal((await runPlay('playLifecycle',{action:'finish'},c)).success,true);
 assert.equal(JSON.parse(await fs.readFile(file)).active,false);
 assert.equal(JSON.parse(await fs.readFile(file)).humanActionSessionRequested,false);
});
test('动作素材准备限制在工程内，校验失败不落盘，不覆盖原素材',async t=>{
 const root=await temp(t),data=Buffer.from('0000ftypisom0000');await fs.writeFile(path.join(root,'clip.mp4'),data);
 let prepared=0;const c={projectPath:root,prepare:async()=>{prepared++;}};
 await assert.rejects(()=>preparePlayMaterial({sourcePath:'clip.mp4',sha256:'0'.repeat(64)},c),/CHECKSUM_MISMATCH/);assert.equal(prepared,0);
 await assert.rejects(()=>preparePlayMaterial({sourcePath:'../outside.mp4'},c),/边界/);
 await assert.rejects(()=>preparePlayMaterial({url:'http://example.com/clip.mp4'},c),/URL_INVALID/);
 const result=await preparePlayMaterial({sourcePath:'clip.mp4'},c);
 assert.deepEqual(await fs.readFile(result.materialRef),data);assert.equal(prepared,1);assert.notEqual(result.materialRef,path.join(root,'clip.mp4'));
});
test('HTTPS 素材下载校验与重定向限制；失败不触发工程写入',async t=>{
 const root=await temp(t),data=Buffer.from('0000ftypisom0000');let prepared=0,calls=0;
 const c={projectPath:root,prepare:async()=>{prepared++;}};
 const originalFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=originalFetch;});
 globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'http://example.test/video.mp4'}});};
 await assert.rejects(()=>preparePlayMaterial({url:'https://example.test/video.mp4'},c),/URL_INVALID/);assert.equal(calls,1);assert.equal(prepared,0);
 globalThis.fetch=async()=>new Response(data,{status:200});
 await assert.rejects(()=>preparePlayMaterial({url:'https://example.test/video.mp4',sha256:'0'.repeat(64)},c),/CHECKSUM_MISMATCH/);assert.equal(prepared,0);
 const result=await preparePlayMaterial({url:'https://example.test/video.mp4'},c);assert.deepEqual(await fs.readFile(result.materialRef),data);assert.equal(prepared,1);
});
