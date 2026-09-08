import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
export class Bridge {
 constructor(stateRoot){this.stateRoot=stateRoot;}
 async sessions(maxAgeMs=120000){
  let dirs;try{dirs=await fs.readdir(this.stateRoot);}catch{return [];}
  const result=[];
  await Promise.all(dirs.map(async name=>{
   if(!/^\d+-[a-f0-9-]+$/.test(name))return;
   try{const s=JSON.parse(await fs.readFile(path.join(this.stateRoot,name,'session.json'),'utf8'));
    if(s.sessionId===name&&Date.now()-s.heartbeat<maxAgeMs){try{process.kill(s.pid,0);result.push({...s,heartbeatAgeMs:Date.now()-s.heartbeat});}catch{}}
   }catch{}
  }));
  return result;
 }
 async select(projectPath,sessionId){
  const real=(await fs.realpath(projectPath)).toLowerCase();
  const found=[];
  // 已绑定会话可跨过后台节流/编译；每次调用仍等待活主机响应并核对工程，绝不以缓存状态判成功。
  for(const s of await this.sessions(sessionId?120000:6000)){
   if(!s.projectPath||(sessionId&&s.sessionId!==sessionId))continue;
   try{if((await fs.realpath(s.projectPath)).toLowerCase()===real)found.push(s);}catch{}
  }
  if(found.length!==1)throw Error(found.length?'多个窗口打开了同一工程，请指定 sessionId':'没有匹配工程的桥接窗口；请打开工程并加载插件');
  return found[0];
 }
 async call(command,params,{projectPath,sessionId,timeoutMs=60000,signal}={}){
  if(signal?.aborted)throw Error('REQUEST_CANCELLED: 请求尚未投递');
  const session=await this.select(projectPath,sessionId);
  const id=crypto.randomUUID(),dir=path.join(this.stateRoot,session.sessionId),expiresAt=Date.now()+timeoutMs;
  const request={id,sessionId:session.sessionId,projectPath,command,params,expiresAt};
  const file=path.join(dir,`req-${id}.json`);await fs.writeFile(file+'.tmp',JSON.stringify(request));await fs.rename(file+'.tmp',file);
  while(true){
   try{const result=JSON.parse(await fs.readFile(path.join(dir,`res-${id}.json`),'utf8'));
    if(!result.ok){const error=new Error(result.error.message);error.code=result.error.code;error.requestId=id;throw error;}return result.value;
   }catch(e){if(e.code!=='ENOENT')throw e;}
   if(Date.now()>expiresAt||signal?.aborted){
    await fs.writeFile(path.join(dir,`cancel-${id}`),'');
    let started=false;try{await fs.access(path.join(dir,`started-${id}`));started=true;}catch{}
    throw Error(`请求超时/取消；${started?'可能已执行，不可盲目重试，请先读回状态':'已标记取消'}。requestId=${id}`);
   }
   await sleep(100);
  }
 }
}
