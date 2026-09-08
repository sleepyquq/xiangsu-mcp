import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setupScript} from '../src/scripts.mjs';
test('升级运行时保留用户修改，资源绑定部分失败不能报成功',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiangsu-scripts-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const skills=path.join(root,'skills'),api=path.join(skills,'effect-abilities/game2d-engine/api'),project=path.join(root,'project');await fs.mkdir(api,{recursive:true});await fs.mkdir(path.join(project,'Assets'),{recursive:true});
 await fs.writeFile(path.join(api,'Game2D.ts'),'// 官方运行时一');await fs.writeFile(path.join(api,'ScriptTemplate.ts'),'class {{componentName}} {}');
 const c={projectPath:project,skillsRoot:skills,prepare:async()=>{},call:async()=>({success:true,applied:0})};
 const first=await setupScript({scriptName:'Probe'},c);assert.equal(first.created,true);
 await fs.writeFile(path.join(api,'Game2D.ts'),'// 官方运行时二');await setupScript({scriptName:'Probe'},c);
 assert.equal(await fs.readFile(path.join(project,'Assets/Game2D.ts'),'utf8'),'// 官方运行时二');
 await fs.writeFile(path.join(project,'Assets/Game2D.ts'),'// 用户定制');
 await assert.rejects(()=>setupScript({scriptName:'Probe'},c),/RUNTIME_MODIFIED/);
 assert.equal(await fs.readFile(path.join(project,'Assets/Game2D.ts'),'utf8'),'// 用户定制');
 await assert.rejects(()=>setupScript({action:'bindProperties',componentProperties:[{property:'texture',type:'Texture',guid:'t'}]},c,true),/PARTIAL/);
});
