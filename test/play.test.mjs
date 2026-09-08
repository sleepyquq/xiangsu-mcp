import test from 'node:test';
import assert from 'node:assert/strict';
import {queryFrames,runPlay} from '../src/play.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('运行字段与暂停边界查询，不用静态数据填补未知字段',()=>{
 const frames=[{seq:1,game:{score:0},extra:{dt:0}},{seq:2,game:{score:3},extra:{dt:16}},{seq:3,game:{score:5},extra:{dt:0}}];
 assert.ok(queryFrames(frames).fieldNames.includes('game.score'));
 const result=queryFrames(frames,{target:{fieldNames:['game.score']},range:{type:'sinceLastPause'}});
 assert.deepEqual(result.frames.map(f=>f.values['game.score']),[3,5]);
 assert.throws(()=>queryFrames(frames,{target:{fieldNames:['made.up']},range:{type:'lastFrames',frameCount:1}}),/UNKNOWN/);
});
test('试玩步骤失败仍清理音频并暂停，且不报告全部成功',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiangsu-play-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const dir=path.join(root,'session');await fs.mkdir(dir);await fs.writeFile(path.join(dir,'play-state.json'),JSON.stringify({active:true,sessionId:'session',projectPath:root,step:0}));
 const calls=[],c={stateRoot:root,sessionId:'session',projectPath:root,validate:()=>{},call:async name=>{calls.push(name);if(name==='wait')throw Error('fixture');return {success:true};}};
 const r=await runPlay('playStep',{actions:[{commandType:'simulate_audio_input',params:{volume:0.01},waitAfterMs:20}]},c);
 assert.equal(r.success,false);assert.deepEqual(calls,['resumePreview','setPlayAudioInput','wait','clearPlayAudioInput','pausePreview']);
 await assert.rejects(()=>runPlay('playStateFields',{},c),/LOG_NOT_READY/);
 calls.length=0;
 await runPlay('playStep',{actions:[{commandType:'switch_human_action',params:{actionId:'fixture'},waitAfterMs:20}]},c);
 assert.deepEqual(calls,['switchHumanAction','resumePreview','wait','pausePreview']);
});

test('试玩确认就绪、隔离重复日志、结束清理可重试且不重复结束录像',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiangsu-play-live-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'Assets'));
 const source="let game2DDidRunInit = false;\n    onEvent(event: any) {\n            this.activeScene.update(Date.now(), dt * 1000);\n        this.emit('RecordStart', null);\n        this.emit('RecordEnd', null);\n";
 await fs.writeFile(path.join(root,'Assets/Game2D.ts'),source);
 const dir=path.join(root,'session'),calls=[];let playId,file,failReload=false,runNumber=0;
 const c={stateRoot:root,sessionId:'session',projectPath:root,validate:()=>{},prepare:async()=>{},call:async(name,p={})=>{
  calls.push(name);
  if(name==='beginPreviewRecording'){
   playId=p.playId;file=path.join(dir,'playthrough',playId+'.ndjson');await fs.mkdir(path.dirname(file),{recursive:true});
   await fs.writeFile(file,JSON.stringify({evalId:playId,event:'ready'})+'\n');
   await fs.mkdir(path.dirname(p.filePath),{recursive:true});await fs.writeFile(p.filePath,'test-video');
  }
  if(name==='startPreviewRecord'){
   const text=JSON.stringify({evalId:playId,runId:'run'+(++runNumber),event:'update',seq:1,game:{score:5}})+'\n';await fs.appendFile(file,text);
   const legacy=path.join(root,'.codex/artifacts/playthrough/runtime');await fs.mkdir(legacy,{recursive:true});await fs.writeFile(path.join(legacy,'duplicate.ndjson'),text);
  }
  if(name==='reloadSticker'&&failReload)throw Error('fixture reload failed');
  if(name==='reloadSticker'&&file){
   // 重载窗口内旧渲染线程仍可能送来最后一帧，不能将它混入新一轮。
   await fs.appendFile(file,JSON.stringify({evalId:playId,runId:'run'+runNumber,event:'update',seq:2,game:{score:99}})+'\n'+JSON.stringify({evalId:playId,event:'ready'})+'\n');
  }
  return {success:true};
 }};
 const start=await runPlay('playLifecycle',{action:'start'},c);assert.equal(start.runtimeLogReady,true);
 assert.ok((await runPlay('playStateFields',{},c)).fieldNames.includes('game.score'));
 assert.equal((await runPlay('playLifecycle',{action:'restart'},c)).runId,'run2');
 const restarted=await runPlay('playState',{target:{type:'fields',fieldNames:['game.score']},range:{type:'lastFrames',frameCount:100}},c);
 assert.deepEqual(restarted.frames.map(f=>f.values['game.score']),[5]);
 failReload=true;const failed=await runPlay('playLifecycle',{action:'finish'},c);assert.equal(failed.success,false);
 assert.equal(await fs.readFile(path.join(root,'Assets/Game2D.ts'),'utf8'),source);
 failReload=false;assert.equal((await runPlay('playLifecycle',{action:'finish'},c)).success,true);
 assert.equal(calls.filter(n=>n==='endPreviewRecording').length,1);
});
