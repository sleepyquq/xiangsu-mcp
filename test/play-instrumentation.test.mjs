import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import ts from 'typescript';
import {instrumentGame,prepareInstrumentation,restoreInstrumentation} from '../src/play-instrumentation.mjs';
const source=`let game2DDidRunInit = false;
    onEvent(event: any) {
            this.activeScene.update(Date.now(), dt * 1000);
        this.emit('RecordStart', null);
        this.emit('RecordEnd', null);
`;
test('试玩注入预检、持久化恢复清单以及用户修改保护',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'play-instrumentation-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'Assets'));const file=path.join(root,'Assets/Game2D.ts');await fs.writeFile(file,source);
 const state={id:'test-play'},c={projectPath:root,prepare:async()=>{}};let saved=false;
 await prepareInstrumentation(state,c,async()=>{assert.equal(await fs.readFile(file,'utf8'),source);saved=true;});
 assert.equal(saved,true);assert.match(await fs.readFile(file,'utf8'),/mcpSend/);
 await fs.appendFile(file,'\n// 用户新改动');await assert.rejects(()=>restoreInstrumentation(state,c),/RESTORE_CONFLICT/);
 assert.match(await fs.readFile(file,'utf8'),/用户新改动/);
 await fs.writeFile(file,instrumentGame(source,state.id));await restoreInstrumentation(state,c);
 assert.equal(await fs.readFile(file,'utf8'),source);
 await restoreInstrumentation(state,c);
 assert.throws(()=>instrumentGame(source.replace('onEvent','changedEvent'),'new'),/NOT_SUPPORTED/);
 assert.throws(()=>instrumentGame(instrumentGame(source,'first'),'second'),/ALREADY_PATCHED/);
});

test('模拟输入按渲染接收时间计时，关键词去重并可清空',()=>{
 const bridge=instrumentGame(source,'fixture').split('let game2DDidRunInit = false;')[0];
 const js=ts.transpileModule(bridge,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 let now=1000;const context={exports:{},Date:{now:()=>now}};
 vm.runInNewContext(js+'\nexports.receive=mcpAudioEvent;',context);
 const api=context.exports;let hits=0;api.mcpSubscribeKeyword(()=>hits++);
 const send=message=>api.receive({args:[0x4155,0x4155,0,JSON.stringify(message)]});
 const msg={action:'set',id:'fixture:500:unique',expiresAtMs:30000,input:{pitchHz:440,volume:0,keywordEvent:{type:'hit',keywords:['测试']}}};
 assert.equal(send(msg),msg.id);send(msg);assert.equal(hits,1);
 now=1499;assert.equal(api.mcpAudioValue('pitchHz'),440);assert.equal(api.mcpAudioValue('volume'),0);
 now=1500;assert.equal(api.mcpAudioValue('pitchHz'),-1);
 now=1600;send({...msg,id:'fixture:500:next'});assert.equal(api.mcpAudioValue('pitchHz'),440);
 send({action:'clear'});assert.equal(api.mcpAudioValue('pitchHz'),-1);
 send({...msg,expiresAtMs:1500});assert.equal(api.mcpAudioValue('pitchHz'),-1);
});
