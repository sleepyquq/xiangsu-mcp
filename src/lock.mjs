import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
// 同一编辑窗口跨 MCP 客户端串行执行上层批次，避免场景读改写和试玩步骤交错。
export async function withSessionLock(sessionDir,task,{signal,timeoutMs=60000}={}){
 const lock=path.join(sessionDir,'operation.lock'),deadline=Date.now()+timeoutMs;
 while(true){
  if(signal?.aborted||Date.now()>deadline)throw Error('OPERATION_LOCK_TIMEOUT: 尚未开始操作');
  try{await fs.mkdir(lock);await fs.writeFile(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid}));break;}
  catch(e){
   if(e.code!=='EEXIST')throw e;
   try{
    const owner=JSON.parse(await fs.readFile(path.join(lock,'owner.json'),'utf8'));
    try{process.kill(owner.pid,0);}catch(dead){if(dead.code==='ESRCH'){await fs.unlink(path.join(lock,'owner.json'));await fs.rmdir(lock);continue;}}
   }catch(err){if(!['ENOENT','EEXIST'].includes(err.code))throw err;}
   await sleep(100);
  }
 }
 try{return await task();}finally{await fs.unlink(path.join(lock,'owner.json'));await fs.rmdir(lock);}
}
