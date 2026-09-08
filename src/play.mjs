import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {checkedPath,writeAtomic} from './files.mjs';
import {previewNames} from './catalog.mjs';
import {prepareInstrumentation,restoreInstrumentation} from './play-instrumentation.mjs';

export const playNames=new Set(['playLifecycle','playStep','playScreenshot','playState','playStateFields','playHumanActions']);
const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const ok=result=>{if(!result||result.success===false)throw Error('PLAY_COMMAND_FAILED: '+JSON.stringify(result));return result;};

export function queryFrames(frames,p){
 if(!frames.length)throw Error('PLAY_LOG_EMPTY: 尚无运行时帧');
 const paths=new Set();
 function visit(value,prefix){
  paths.add(prefix);
  if(value&&typeof value==='object'&&!Array.isArray(value))for(const [key,child]of Object.entries(value))visit(child,prefix?prefix+'.'+key:key);
 }
 for(const key of ['seq','event','time','extra','game','activeScene'])if(Object.hasOwn(frames.at(-1),key))visit(frames.at(-1)[key],key);
 if(!p)return {success:true,fieldNames:[...paths].sort()};
 const names=p.target.fieldNames;
 for(const name of names)if(!paths.has(name))throw Error('PLAY_FIELD_UNKNOWN: '+name+'；先调用 playStateFields');
 let selected=frames;
 if(p.range.type==='lastFrames')selected=frames.slice(-Math.min(1000,p.range.frameCount));
 else{
  let end=frames.length-1;while(end>=0&&frames[end].extra?.dt===0)end--;
  let start=end;while(start>=0&&frames[start].extra?.dt!==0)start--;
  selected=frames.slice(Math.max(0,start+1));
 }
 const get=(o,name)=>{for(const key of name.split('.')){if(!o||!Object.hasOwn(o,key))return {__missing:true};o=o[key];}return o;};
 return {success:true,frameCount:selected.length,frames:selected.map(f=>({seq:f.seq,time:f.time,values:Object.fromEntries(names.map(n=>[n,get(f,n)]))}))};
}

async function logFiles(c){
 const roots=[path.join(c.stateRoot,c.sessionId,'playthrough'),path.join(c.projectPath,'.codex/artifacts/playthrough/runtime'),...(c.logRoot?[path.join(c.logRoot,'agentPlaythrough')]:[])];
 const files=[];
 for(const root of roots){
  let entries;try{entries=await fs.readdir(root,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')continue;throw e;}
  for(const e of entries){if(!e.isFile()||!e.name.endsWith('.ndjson'))continue;
   const file=checkedPath(e.name,root),stat=await fs.stat(file);
   files.push({file,stat});
  }
 }
 return files;
}
async function runtimeFrames(state,c){
 let candidates=(await logFiles(c)).filter(({file,stat})=>stat.mtimeMs>=state.startedAt&&stat.size>(state.logOffsets?.[file]??0)&&(!state.logFile||state.logFile===file)).map(x=>x.file);
 // 官方转发器也可能同时写同一条消息；优先使用按会话和试玩 ID 隔离的桥接日志。
 const dedicated=path.join(c.stateRoot,c.sessionId,'playthrough',state.id+'.ndjson');
 if(candidates.includes(dedicated))candidates=[dedicated];
 if(candidates.length!==1)throw Error(candidates.length?'PLAY_LOG_AMBIGUOUS: 多份运行日志，无法确认当前试玩':'PLAY_LOG_NOT_READY: 当前试玩没有运行时日志；不能以静态场景替代');
 const file=candidates[0],stat=await fs.stat(file),handle=await fs.open(file,'r');
 let text;
 try{const available=stat.size-(state.logOffsets?.[file]??0),length=Math.min(available,4*1024*1024),buffer=Buffer.alloc(length);await handle.read(buffer,0,length,stat.size-length);text=buffer.toString('utf8');if(length<available)text=text.slice(text.indexOf('\n')+1);}finally{await handle.close();}
 // 写入中的末行先不读；不把半条 JSON 误判为运行错误。
 text=text.slice(0,text.lastIndexOf('\n')+1);
 const frames=text.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)).filter(frame=>frame.evalId===state.id&&frame.event!=='ready'&&(!state.previousRunId||frame.runId!==state.previousRunId));
 if(!frames.length)throw Error('PLAY_LOG_NOT_READY: 运行脚本尚未上报录制帧');
 const runIds=new Set(frames.map(f=>f.runId).filter(Boolean));
 if(runIds.size>1)throw Error('PLAY_RUN_MIXED');
 if(state.runId&&runIds.size&&![...runIds].includes(state.runId))throw Error('PLAY_RUN_CHANGED');
 state.logFile=file;state.runId=[...runIds][0]??state.runId;
 return {frames,source:file};
}

async function awaitRuntimeReady(state,c,invoke){
 const file=path.join(c.stateRoot,c.sessionId,'playthrough',state.id+'.ndjson'),deadline=Date.now()+20000;
 while(true){
  let ready=false;
  try{
   const bytes=await fs.readFile(file),text=bytes.subarray(state.logOffsets?.[file]??0).toString('utf8');
   ready=text.split('\n').some(line=>{try{const frame=JSON.parse(line);return frame.evalId===state.id&&frame.event==='ready';}catch{return false;}});
  }catch(e){if(e.code!=='ENOENT')throw e;}
  if(ready)return;
  if(Date.now()>deadline)throw Error('PLAY_RUNTIME_NOT_READY: 预览中没有已启动的 Game2D 入口');
  await invoke('wait',{ms:200});
 }
}

export async function runPlay(name,p,c){
 const dir=path.join(c.stateRoot,c.sessionId),statePath=path.join(dir,'play-state.json');
 const invoke=async(command,params={})=>ok(await c.call(command,params));
 const cleanup=async(command,params={})=>ok(await (c.cleanupCall??c.call)(command,params));
 if(name==='playHumanActions')return invoke('getHumanActions');
 let state;try{state=await readJSON(statePath);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(state&&(state.projectPath!==c.projectPath||state.sessionId!==c.sessionId))throw Error('PLAY_PROJECT_CHANGED');
 const save=()=>writeAtomic(statePath,JSON.stringify(state,null,2));
 if(name==='playLifecycle'&&p.action==='start'){
  if(state?.active)throw Error('PLAY_ALREADY_ACTIVE: 先 finish 当前试玩');
  const id=crypto.randomUUID(),videoPath=checkedPath(`.codex/artifacts/playthrough/${id}.mp4`,c.projectPath,true);
  const logOffsets=Object.fromEntries((await logFiles(c)).map(({file,stat})=>[file,stat.size]));
  state={active:true,id,projectPath:c.projectPath,sessionId:c.sessionId,startedAt:Date.now(),logOffsets,videoPath,step:0,recordingBegun:false};
  await save();
  try{
   state.runtimeCapabilities=await prepareInstrumentation(state,c,save);
   await invoke('runOtscCheck',{options:{timeoutMs:60000,maxOutputChars:12000}});
   await invoke('reloadSticker');state.recordingBegun=true;await save();await invoke('beginPreviewRecording',{filePath:videoPath,playId:state.id});await invoke('resumePreview');
   await awaitRuntimeReady(state,c,invoke);
   await invoke('startPreviewRecord');await invoke('wait',{ms:400});await invoke('pausePreview');
  }catch(error){
   const errors=[];
   for(const command of ['clearPlayAudioInput','stopPreviewRecord','abortPreviewRecording','resumePreview'])try{await cleanup(command);}catch(e){errors.push(String(e));}
   try{await restoreInstrumentation(state,c);if(state.instrumentation?.length){await cleanup('runOtscCheck',{options:{timeoutMs:60000,maxOutputChars:12000}});await cleanup('reloadSticker');}}catch(e){errors.push(String(e));}
   state.active=errors.length>0;state.cleanupErrors=errors;await save();throw Error(String(error)+'；清理：'+JSON.stringify(errors));
  }
  let runtimeLogReady=false;try{const {frames}=await runtimeFrames(state,c);state.pauseSeq=frames.at(-1)?.seq;runtimeLogReady=true;}catch{}
  await save();return {success:true,...state,runtimeLogReady};
 }
 if(!state?.active)throw Error('PLAY_NOT_ACTIVE: 先调用 playLifecycle start');
 if(name==='playState'||name==='playStateFields'){
  const {frames,source}=await runtimeFrames(state,c);await save();
  const selected=name==='playState'&&p.range.type==='sinceLastPause'&&state.previousPauseSeq!==undefined?frames.filter(f=>f.seq>state.previousPauseSeq):frames;
  const query=name==='playState'&&p.range.type==='sinceLastPause'&&state.previousPauseSeq!==undefined?{...p,range:{type:'lastFrames',frameCount:1000}}:p;
  return {...queryFrames(selected,name==='playState'?query:undefined),source,playId:state.id};
 }
 if(name==='playScreenshot'){
  const output=checkedPath(`.codex/artifacts/playthrough/${state.id}-step-${state.step}-${crypto.randomUUID()}.png`,c.projectPath,true);
  return {...await invoke('saveScreenshot',{scale:0.5,path:output}),playId:state.id,step:state.step};
 }
 if(name==='playStep'){
  // 整批先校验；错误参数不能让前面的动作先发生。
  if(!p.actions?.length||p.actions.length>100)throw Error('PLAY_ACTIONS_INVALID');
  for(const action of p.actions){
   if(!Number.isFinite(action.waitAfterMs)||action.waitAfterMs<1||action.waitAfterMs>30000)throw Error('PLAY_WAIT_INVALID');
   const command=action.commandType==='switch_human_action'?'switchHumanAction':action.commandType==='simulate_audio_input'?'setPlayAudioInput':previewNames[action.commandType];
   if(!command||!['touch','touch_down','touch_up','touch_move','drag','wait','switch_human_action','simulate_audio_input'].includes(action.commandType))throw Error('PLAY_ACTION_UNKNOWN');
   if(command==='setPlayAudioInput'&&state.runtimeCapabilities){
    if((action.params?.pitchHz!==undefined||action.params?.volume!==undefined)&&!state.runtimeCapabilities.audioDetector)throw Error('PLAY_AUDIO_DETECTOR_MISSING');
    if(action.params?.keywordEvent&&!state.runtimeCapabilities.keyword)throw Error('PLAY_KEYWORD_DETECTOR_MISSING');
   }
   const args=command==='setPlayAudioInput'?{id:'validate',input:action.params,durationMs:action.waitAfterMs}:action.params??(command==='wait'?{ms:0}:{});
   c.validate(command,args);
   if(command==='setPlayAudioInput'&&!Object.keys(action.params??{}).length)throw Error('PLAY_AUDIO_INPUT_EMPTY');
  }
  state.previousPauseSeq=state.pauseSeq;
  let completed=0,error,pauseError;
  try{
   for(const action of p.actions){
    // 原生命令在下一次 resume 时应用动作素材；顺序颠倒会让截图一直落后一段。
    if(action.commandType==='switch_human_action'){
     await invoke('switchHumanAction',action.params);await invoke('resumePreview');await invoke('wait',{ms:action.waitAfterMs});completed++;continue;
    }
    await invoke('resumePreview');
    if(action.commandType==='simulate_audio_input'){
     try{
      const acknowledged=state.runtimeCapabilities?.state,id=acknowledged?`${state.id}:${action.waitAfterMs}:${crypto.randomUUID()}`:crypto.randomUUID();
      await invoke('setPlayAudioInput',{id,input:action.params,durationMs:acknowledged?30000:action.waitAfterMs});
      if(acknowledged){
       const deadline=Date.now()+10000;
       while(true){
        const {frames}=await runtimeFrames(state,c);
        if(frames.some(f=>f.event==='audioInput'&&f.extra?.inputId===id))break;
        if(Date.now()>deadline)throw Error('PLAY_AUDIO_INPUT_NOT_ACKNOWLEDGED: 渲染线程未确认收到输入');
        await invoke('wait',{ms:100});
       }
      }
      await invoke('wait',{ms:action.waitAfterMs});
     }
     finally{await cleanup('clearPlayAudioInput');}
    }else{
     await invoke(action.commandType==='switch_human_action'?'switchHumanAction':previewNames[action.commandType],action.params??(action.commandType==='wait'?{ms:0}:{}));
     await invoke('wait',{ms:action.waitAfterMs});
    }
    completed++;
   }
  }catch(e){error=String(e);}
  finally{try{await cleanup('pausePreview');}catch(e){pauseError=String(e);}}
  try{state.pauseSeq=(await runtimeFrames(state,c)).frames.at(-1)?.seq;}catch{}
  state.step++;await save();return {success:!error&&!pauseError,completed,step:state.step,paused:!pauseError,error,pauseError,retrySafe:false};
 }
 if(name==='playLifecycle'){
  let result,error;const cleanupErrors=[];
  try{
   if(!state.recordingEnded&&state.recordingBegun!==false){await invoke('resumePreview');await invoke('wait',{ms:3000});}
   if(p.action==='restart'){
    state.logOffsets=Object.fromEntries((await logFiles(c)).map(({file,stat})=>[file,stat.size]));
    state.startedAt=Date.now();state.previousRunId=state.runId;delete state.logFile;delete state.runId;delete state.previousPauseSeq;delete state.pauseSeq;await save();await invoke('reloadSticker');
    await invoke('resumePreview');await awaitRuntimeReady(state,c,invoke);
    await invoke('startPreviewRecord');await invoke('wait',{ms:400});await invoke('pausePreview');state.pauseSeq=(await runtimeFrames(state,c)).frames.at(-1)?.seq;await save();return {success:true,...state};
   }
   if(!state.recordingEnded&&state.recordingBegun!==false){
    await invoke('stopPreviewRecord');result=await invoke('endPreviewRecording');
    state.recordingEnded=true;state.recording=result;await save();
   }else result=state.recording;
   if(state.recordingBegun!==false){const file=checkedPath(result?.path??state.videoPath,c.projectPath);if((await fs.stat(file)).size===0)throw Error('PLAY_VIDEO_EMPTY');result={...result,path:file};}
  }catch(e){error=String(e);}
  for(const command of ['clearPlayAudioInput','stopPreviewRecord',...(error?['abortPreviewRecording']:[]),'resumePreview'])try{await cleanup(command);}catch(e){cleanupErrors.push(String(e));}
  try{await restoreInstrumentation(state,c);await cleanup('runOtscCheck',{options:{timeoutMs:60000,maxOutputChars:12000}});await cleanup('reloadSticker');}catch(e){cleanupErrors.push(String(e));}
  state.active=cleanupErrors.length>0;state.cleanupErrors=cleanupErrors;await save();return {success:!error&&!cleanupErrors.length,recording:result,error,cleanupErrors,playId:state.id};
 }
 throw Error('PLAY_TOOL_UNKNOWN');
}
