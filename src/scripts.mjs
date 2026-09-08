import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import {walk,checkedPath,writeAtomic,hash} from './files.mjs';
import {sceneSpec} from './scene.mjs';

export async function setupScript(p,c,legacy=false){
 const action=legacy?(p.action??'init'):'init',name=p.scriptName??'GameManager';
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw Error('INVALID_SCRIPT_NAME');
 const bindings=p.resourceBindings??p.componentProperties??[];
 let targetId=p.targetId;
 if(targetId){
  const {objects}=await sceneSpec(c),matches=objects.filter(o=>o.target==='object'&&(o.guid===targetId||o.id===targetId));
  if(matches.length!==1)throw Error('SCRIPT_TARGET_NOT_UNIQUE: '+targetId);
  targetId=matches[0].id;
  // 官方入口只按名称查找；即使用户传 GUID，重名也不能静默绑定到另一对象。
  if(objects.filter(o=>o.target==='object'&&o.id===targetId).length!==1)throw Error('SCRIPT_TARGET_NAME_AMBIGUOUS: '+targetId);
 }
 const bind=async()=>{
  const result=await c.call('attachUserScript',{scriptName:name,...(targetId?{targetId}:{}),...(bindings.length?{componentProperties:bindings}:{})});
  if(result?.success!==true)throw Error('SCRIPT_ATTACH_FAILED: '+JSON.stringify(result));
  if(bindings.length&&result.applied!==bindings.length)throw Error('SCRIPT_BINDINGS_PARTIAL: '+JSON.stringify(result));
  return result;
 };
 if(action==='bindProperties'){
  if(!bindings.length)throw Error('bindProperties 需要资源绑定');
  return {success:true,attached:await bind()};
 }
 const root=path.join(c.skillsRoot,'effect-abilities'),abilities=new Map();
 for(const file of (await walk(root)).filter(f=>path.basename(f)==='SKILL.md')){
  const content=await fs.readFile(file,'utf8'),fm=content.match(/^---\r?\n([\s\S]*?)\r?\n---/);if(!fm)continue;
  const meta=YAML.parse(fm[1]);
  for(const [api,names]of Object.entries(meta.api??{}))for(const ability of names){
   const files=abilities.get(ability)??[];files.push(checkedPath(api.replace(/\.d\.ts$/,'.ts'),path.dirname(file)));abilities.set(ability,files);
  }
 }
 const selected=p.abilities??[];
 if(action==='ensureDeps'&&!selected.length)throw Error('ensureDeps 需要能力名称');
 const base=path.join(root,'game2d-engine/api'),copies=new Map([['Game2D.ts',path.join(base,'Game2D.ts')]]);
 for(const ability of selected){
  if(!abilities.has(ability))throw Error('ABILITY_UNAVAILABLE: '+ability+'；可用：'+[...abilities.keys()].join('、'));
  for(const file of abilities.get(ability)){
   const key=path.basename(file);if(copies.has(key)&&copies.get(key)!==file)throw Error('RUNTIME_NAME_CONFLICT: '+key);copies.set(key,file);
   const alias=file.replace(/\.ts$/,'.symbol-alias.json');try{await fs.access(alias);copies.set(path.basename(alias),alias);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
 }
 const manifestPath=checkedPath('.codex/runtime-dependencies.json',c.projectPath,true);
 let manifest={files:{}};try{manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const jobs=[];
 // 全量预检，任何用户改动冲突都在复制第一个文件之前报告。
 for(const [name,source]of copies){
  const data=await fs.readFile(source),sha256=hash(data),dest=checkedPath('Assets/'+name,c.projectPath,true);
  let previous;try{previous=hash(await fs.readFile(dest));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(previous&&previous!==sha256&&previous!==manifest.files?.[name]?.sha256&&previous!==p.expectedRuntimeHashes?.[name])throw Error('RUNTIME_MODIFIED: '+name+'；保留用户修改。显式升级需传读回的 expectedRuntimeHashes');
  jobs.push({name,source,data,sha256,dest,previous});
 }
 await c.prepare();
 for(const job of jobs){
  let current;try{current=hash(await fs.readFile(job.dest));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(current!==job.previous)throw Error('RUNTIME_CHANGED_DURING_SETUP: '+job.name);
  if(current!==job.sha256)await writeAtomic(job.dest,job.data);
  manifest.files[job.name]={sha256:job.sha256,source:job.source};
 }
 await writeAtomic(manifestPath,JSON.stringify(manifest,null,2));
 let created=false;
 if(action==='init'){
  const dest=checkedPath(`Assets/${name}.ts`,c.projectPath,true);
  const template=(await fs.readFile(path.join(base,'ScriptTemplate.ts'),'utf8')).replaceAll('{{componentName}}',name);
  try{await fs.writeFile(dest,template,{flag:'wx'});created=true;}catch(e){if(e.code!=='EEXIST')throw e;}
 }
 return {success:true,scriptName:name,created,copiedRuntimeFiles:jobs.map(j=>j.name),attached:action==='init'?await bind():null};
}
