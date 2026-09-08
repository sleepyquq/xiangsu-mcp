import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Bridge} from '../src/bridge.mjs';

test('后台心跳延迟只允许显式绑定，过期会话仍拒绝',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiangsu-session-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const sessionId=process.pid+'-abcdef',dir=path.join(root,sessionId);await fs.mkdir(dir);
 const session={sessionId,pid:process.pid,projectPath:root,heartbeat:Date.now()-45000};
 const file=path.join(dir,'session.json');await fs.writeFile(file,JSON.stringify(session));
 const bridge=new Bridge(root),found=await bridge.sessions();
 assert.equal(found.length,1);assert.ok(found[0].heartbeatAgeMs>=45000);
 assert.equal((await bridge.select(root,sessionId)).sessionId,sessionId);
 await assert.rejects(()=>bridge.select(root),/没有匹配/);
 session.heartbeat=Date.now()-121000;await fs.writeFile(file,JSON.stringify(session));
 await assert.rejects(()=>bridge.select(root,sessionId),/没有匹配/);
});
