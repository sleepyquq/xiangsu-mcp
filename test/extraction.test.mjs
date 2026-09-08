import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
test('提取兼容压缩和 9.4 排版，解析工具之前定义的 schema 且仅写指定候选',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiangsu-extract-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const script=fileURLToPath(new URL('../scripts/extract-catalog.mjs',import.meta.url));
 const pretty='var inputSchema = z.object({count:z.number().int().nonnegative().optional()});\nclass Tool { name = "sceneSpec"; description = "读取"; schema = inputSchema; }\nvar EHCommandRegisterList = [\n{commandType: "getScene" /* getScene */, description: "读取", params:z.object({})}\n];';
 const legacy='var inputSchema=z.object({count:z.number().int().nonnegative().optional()});var commands=[{commandType:"getScene",description:"读取",params:z.object({})}];class Tool{name="sceneSpec";description="读取";schema=inputSchema;}';
 for(const [i,source]of [legacy,pretty].entries()){
  const input=path.join(root,`source-${i}.txt`),output=path.join(root,`candidate-${i}.json`);await fs.writeFile(input,source);
  await promisify(execFile)(process.execPath,[script,input,output]);
  const result=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(result.commands.length,1);assert.equal(result.topTools.length,1);assert.equal(result.topTools[0].inputSchema.properties.count.minimum,0);assert.deepEqual(result.topTools[0].inputSchema.required,[]);
 }
});
