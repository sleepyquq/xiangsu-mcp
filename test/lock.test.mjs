import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {setTimeout as sleep} from 'node:timers/promises';
import {withSessionLock} from '../src/lock.mjs';
test('并发上层批次不能交错，失败后锁可继续使用',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiangsu-lock-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const events=[];
 await Promise.all([1,2].map(n=>withSessionLock(root,async()=>{events.push(`start${n}`);await sleep(30);events.push(`end${n}`);})));assert.match(events.join(','),/^(start1,end1,start2,end2|start2,end2,start1,end1)$/);
 await assert.rejects(()=>withSessionLock(root,async()=>{throw Error('test');}),/test/);await withSessionLock(root,async()=>{});
});
