import fs from 'node:fs/promises';
import path from 'node:path';
import {checkedPath,writeAtomic,hash} from './files.mjs';

const marker='// <xiangsu-mcp-play>';
const replace=(source,anchor,value)=>{
 if(source.split(anchor).length!==2)throw Error('PLAY_RUNTIME_NOT_SUPPORTED: '+anchor.slice(0,90));
 return source.replace(anchor,value);
};
const bridge=id=>`${marker}
const mcpPlayId=${JSON.stringify(id)};
let mcpPlaying=false, mcpSeq=0, mcpRun='',mcpLastReady=0;
let mcpAudio:any=null, mcpKeywordId='';
const mcpKeywordListeners:Array<(event:any)=>void>=[];
export function mcpSubscribeKeyword(fn:(event:any)=>void):()=>void {
 mcpKeywordListeners.push(fn);return ()=>{const i=mcpKeywordListeners.indexOf(fn);if(i>=0)mcpKeywordListeners.splice(i,1);};
}
export function mcpAudioValue(key:string):number {
 if(mcpAudio&&mcpAudio.expiresAtMs<=Date.now())mcpAudio=null;
 return mcpAudio?.input?.[key]??-1;
}
function mcpAudioEvent(event:any):string|null {
 const arg=(i:number)=>event?.args?.get?.(i)??event?.args?.[i];
 if(arg(0)!==0x4155||arg(1)!==0x4155)return null;
 try {const msg=JSON.parse(arg(3));mcpAudio=msg.action==='set'&&msg.expiresAtMs>Date.now()?msg:null;
  // 本桥接的输入从渲染线程实际收到时计时，避免短脉冲在消息队列里过期。
  if(mcpAudio&&typeof msg.id==='string'&&msg.id.startsWith(mcpPlayId+':')){
   const duration=Number(msg.id.split(':')[1]);if(duration>=1&&duration<=30000)mcpAudio.expiresAtMs=Date.now()+duration;
  }
  if(mcpAudio?.input?.keywordEvent&&mcpKeywordId!==msg.id){mcpKeywordId=msg.id;for(const fn of mcpKeywordListeners.slice())fn(msg.input.keywordEvent);}
  return mcpAudio?.id??null;
 }catch{mcpAudio=null;return null;}
}
// 有限深度序列化运行中的对象；循环和截断明确标记，不使用设计记录。
function mcpSnapshot(v:any,seen:any[]=[],depth=0):any {
 if(v===null||['string','number','boolean'].indexOf(typeof v)>=0)return v;
 if(typeof v!=='object')return undefined;
 if(seen.indexOf(v)>=0)return {__circular:true};
 if(depth>6)return {__truncated:true};
 seen.push(v);let out:any;
 if(Array.isArray(v))out=v.slice(0,100).map(x=>mcpSnapshot(x,seen,depth+1));
 else{out={};for(const k of Object.keys(v).slice(0,150)){
  if(k.startsWith('__')||['sys','game','scene','_transform','_sceneObject','_rtti','_typedRtti','events'].indexOf(k)>=0)continue;
  try {const x=mcpSnapshot(v[k],seen,depth+1);if(x!==undefined)out[k]=x;}catch{out[k]={__readError:true};}
 }}seen.pop();return out;
}
function mcpSend(game:any,event:string,extra:any={}):void {
 if(!mcpPlaying){if(event!=='ready'||Date.now()-mcpLastReady<250)return;mcpLastReady=Date.now();}
 try{const scene=game.getSceneObject()?.scene;
  scene?.postMessage(35025,1,++mcpSeq,JSON.stringify({type:'play-runtime-state',evalId:mcpPlayId,runId:mcpRun,seq:mcpSeq,event,time:Date.now(),extra,game:mcpSnapshot(game)}));
 }catch{}
}
// </xiangsu-mcp-play>
`;

export function instrumentGame(source,id){
 if(source.includes(marker)||source.includes('// <play-render-msg>'))throw Error('PLAY_RUNTIME_ALREADY_PATCHED');
 source=replace(source,'let game2DDidRunInit = false;',bridge(id)+'\nlet game2DDidRunInit = false;');
 source=replace(source,'    onEvent(event: any) {','    onEvent(event: any) {\n        const mcpInputId=mcpAudioEvent(event);if(mcpInputId)mcpSend(this,"audioInput",{inputId:mcpInputId});');
 source=replace(source,'            this.activeScene.update(Date.now(), dt * 1000);','            this.activeScene.update(Date.now(), dt * 1000);\n            mcpSend(this, mcpPlaying?"update":"ready", {dt});');
 source=replace(source,"        this.emit('RecordStart', null);","        mcpPlaying=true;mcpSeq=0;mcpRun=mcpPlayId+'_'+Date.now();\n        this.emit('RecordStart', null);\n        mcpSend(this.scene.game, 'RecordStart');");
 return replace(source,"        this.emit('RecordEnd', null);","        this.emit('RecordEnd', null);\n        mcpSend(this.scene.game, 'RecordEnd');mcpPlaying=false;");
}
function instrumentDetector(source){
 source=replace(source,"import {Game2D} from './Game2D';","import {Game2D,mcpAudioValue} from './Game2D';");
 const pitch=/sharedPitchHandle\?\.getResult\(\) \?\? -1/g,volume=/sharedVolumeHandle\?\.getResult\(\) \?\? -1/g;
 if((source.match(pitch)??[]).length!==1||(source.match(volume)??[]).length!==1)throw Error('PLAY_AUDIO_RUNTIME_NOT_SUPPORTED');
 return source.replace(pitch,"mcpAudioValue('pitchHz')").replace(volume,"mcpAudioValue('volume')");
}
function instrumentKeyword(source){
 source=replace(source,"import {Game2D} from './Game2D';","import {Game2D,mcpSubscribeKeyword} from './Game2D';");
 source=replace(source,'    private targetKeywords: string[] = [];',`    private targetKeywords: string[] = [];
    private mcpUnsubscribe:(()=>void)|undefined;
    private mcpKeyword=(event:any):void=>{if(!this.enabled)return;if(event.type==='hit')emitKeywordListeners(this.hitListeners,event.keywords);else emitKeywordMissListeners(this.missListeners);};`);
 source=replace(source,'        this.subscribeRuntimeListeners();','        this.mcpUnsubscribe=mcpSubscribeKeyword(this.mcpKeyword);');
 return replace(source,'        this.unsubscribeRuntimeListeners();','        this.mcpUnsubscribe?.();this.mcpUnsubscribe=undefined;');
}

export async function prepareInstrumentation(state,c,save){
 const jobs=[];
 for(const [name,transform]of [['Game2D.ts',s=>instrumentGame(s,state.id)],['AgentAudioDetector.ts',instrumentDetector],['AgentAudioKeyword.ts',instrumentKeyword]]){
  const file=checkedPath('Assets/'+name,c.projectPath,true);
  let source;try{source=await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT'&&name!=='Game2D.ts')continue;throw e;}
  const patched=transform(source),backup=checkedPath(`.codex/backups/play-${state.id}/${name}`,c.projectPath,true);
  jobs.push({name,file,source,patched,backup,originalHash:hash(source),patchedHash:hash(patched)});
 }
 await c.prepare();
 for(const j of jobs){await fs.mkdir(path.dirname(j.backup),{recursive:true});await fs.writeFile(j.backup,j.source,{flag:'wx'});}
 // 写入前持久化恢复清单；进程中断后 finish 仍能安全恢复。
 state.instrumentation=jobs.map(({name,backup,originalHash,patchedHash})=>({name,backup,originalHash,patchedHash}));await save();
 for(const j of jobs){if(hash(await fs.readFile(j.file))!==j.originalHash)throw Error('PLAY_RUNTIME_CHANGED: '+j.name);await writeAtomic(j.file,j.patched);}
 return {state:true,audioDetector:jobs.some(j=>j.name==='AgentAudioDetector.ts'),keyword:jobs.some(j=>j.name==='AgentAudioKeyword.ts')};
}
export async function restoreInstrumentation(state,c){
 for(const j of state.instrumentation??[]){
  const file=checkedPath('Assets/'+j.name,c.projectPath),current=hash(await fs.readFile(file));
  if(current===j.originalHash)continue;
  if(current!==j.patchedHash)throw Error('PLAY_RESTORE_CONFLICT: '+j.name+' 在试玩期间被修改；保留修改和备份');
  const backup=await fs.readFile(checkedPath(j.backup,c.projectPath));
  if(hash(backup)!==j.originalHash)throw Error('PLAY_BACKUP_CHANGED: '+j.name);
  await writeAtomic(file,backup);
 }
}
