import {client,call,evidence,projectPath} from './blank-client.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const runtimeNames=['Game2D.ts','AgentAudioDetector.ts','AgentAudioKeyword.ts'];
const runtimeHashes=async()=>Promise.all(runtimeNames.map(async n=>createHash('sha256').update(await fs.readFile(path.join(projectPath,'Assets',n))).digest('hex')));
const originals=await runtimeHashes();
// 按实际运行库哈希选择独立审计的输入与期望值，未知曲线不得套用旧断言。
const volumeCases={
 '5bc2098d93d00366bd87cebb2ee1a13dff16c98edb90b1ba5717965ceec10dfc':{version:'9.4.0',input:0.001,expected:Math.pow(10/35,0.7)},
 '245ecbd4bba69ce2ff606b6b1bc4ba8a4e1cbd7abe866fbb0b48090b807c5698':{version:'9.4.1',input:0.1,expected:Math.pow(6/9,0.7)},
};
const volumeCase=volumeCases[originals[1]];
if(!volumeCase){await client.close();throw Error('音量运行库尚未审计，请核对换算曲线后添加测试样例');}
const report={startedAt:new Date().toISOString(),originalRuntimeHashes:originals,volumeCase,checkpoints:[]};
let started=false;
try{
 const result=await call('playLifecycle',{action:'start'});started=true;report.start=result;console.log(JSON.stringify(result));
 const fields=await call('playStateFields');console.log(fields.fieldNames.filter(k=>/pitch|volume|Bound|hits|misses|frames|touches/.test(k)));
 const sample=async()=>call('playState',{target:{type:'fields',fieldNames:['game.textureBound','game.materialBound','game.activeScene.frames','game.activeScene.pitch','game.activeScene.volume','game.activeScene.hits','game.activeScene.misses','game.activeScene.touches']},range:{type:'lastFrames',frameCount:1000}});
 const before=await sample();await fs.writeFile(path.join(evidence,'before.json'),JSON.stringify(before,null,2));
 await call('playStep',{actions:[{commandType:'touch',params:{x:0.5,y:0.5},waitAfterMs:150},{commandType:'simulate_audio_input',params:{pitchHz:220,volume:volumeCase.input,keywordEvent:{type:'hit',keywords:['测试']}},waitAfterMs:1000}]});
 const during=await sample();await fs.writeFile(path.join(evidence,'audio-hit.json'),JSON.stringify(during,null,2));
 assert.ok(during.frames.some(f=>f.values['game.activeScene.pitch']===220),'运行脚本未读到注入音高');
 assert.ok(during.frames.some(f=>f.values['game.activeScene.hits']>=1),'运行脚本未收到关键词');
 assert.ok(during.frames.some(f=>f.values['game.activeScene.volume']>0),'运行脚本未读到注入音量');
 const loud=during.frames.find(f=>f.values['game.activeScene.pitch']===220)?.values['game.activeScene.volume'];
 assert.ok(Math.abs(loud-volumeCase.expected)<0.001,'音量没有沿用该版本官方感知响度映射');
 assert.equal(Math.max(...during.frames.map(f=>f.values['game.activeScene.hits'])),1,'关键词命中重复触发');
 assert.ok(during.frames.some(f=>f.values['game.activeScene.touches']>=1),'运行脚本未收到触摸');
 assert.ok(during.frames.some(f=>f.values['game.textureBound']&&f.values['game.materialBound']),'运行脚本未获得资源');
 report.checkpoints.push({name:'audio-hit-touch-bindings',time:new Date().toISOString(),volume:loud});
 await call('playScreenshot');
 await call('playStep',{actions:[{commandType:'simulate_audio_input',params:{pitchHz:440,volume:0.0001,keywordEvent:{type:'miss'}},waitAfterMs:500}]});
 const changed=await sample();await fs.writeFile(path.join(evidence,'audio-miss.json'),JSON.stringify(changed,null,2));
 assert.ok(changed.frames.some(f=>f.values['game.activeScene.pitch']===440));assert.ok(changed.frames.some(f=>f.values['game.activeScene.misses']>=1));
 assert.equal(changed.frames.find(f=>f.values['game.activeScene.pitch']===440)?.values['game.activeScene.volume'],0);
 assert.equal(Math.max(...changed.frames.map(f=>f.values['game.activeScene.misses'])),1,'关键词未命中重复触发');
 await call('playStep',{actions:[{commandType:'wait',waitAfterMs:300}]});
 const cleared=await sample();assert.equal(cleared.frames.at(-1).values['game.activeScene.pitch'],-1);
 const interval=await call('playState',{target:{type:'fields',fieldNames:['game.activeScene.pitch']},range:{type:'sinceLastPause'}});
 assert.ok(interval.frames.every(f=>f.values['game.activeScene.pitch']===-1),'暂停边界混入了上轮音频');
 report.checkpoints.push({name:'audio-miss-clear-pause',time:new Date().toISOString()});
 await call('playStep',{actions:[{commandType:'switch_human_action',params:{actionId:'preview_single_open_mouth'},waitAfterMs:4500}]});await call('playScreenshot');
 await call('playStep',{actions:[{commandType:'switch_human_action',params:{actionId:'preview_hand_fist_dyeh'},waitAfterMs:4500}]});await call('playScreenshot');
 await call('playStep',{actions:[{commandType:'switch_human_action',params:{actionId:'preview_single_body_wave'},waitAfterMs:4500}]});await call('playScreenshot');
 await call('playLifecycle',{action:'restart'});
 const restarted=await sample();assert.equal(restarted.frames.at(-1).values['game.activeScene.hits'],0);
 report.finish=await call('playLifecycle',{action:'finish'});started=false;
 assert.deepEqual(await runtimeHashes(),originals,'试玩结束未恢复原运行库');
 report.success=true;report.finishedAt=new Date().toISOString();
 await fs.writeFile(path.join(evidence,'play-verified-'+result.id+'.json'),JSON.stringify(report,null,2));
 console.log('BLANK94 VERIFIED');
}finally{if(started)try{await call('playLifecycle',{action:'finish'});}catch(e){console.log('恢复失败',String(e));}await client.close();}
