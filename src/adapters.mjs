import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import sharp from 'sharp';
import {walk,checkedPath,writeAtomic} from './files.mjs';
import {previewNames} from './catalog.mjs';
import {codeSearch} from './code-search.mjs';
import {sceneOps,sceneSpec} from './scene.mjs';
import {setupScript} from './scripts.mjs';
import {runPlay,playNames} from './play.mjs';
export const cloudTools=new Set(['audioEffectWorkflow','audioEffectWorkflowBatch','awaitAudioGeneration','awaitImageGeneration','seedreamEffectWorkflow','seedreamEffectWorkflowBatch','generateSettingReferenceImage']);
export const localAdapterNames=new Set(['setupGameScript','sceneOps','sceneSpec','userScript','compileProject','previewTool','consoleLog','ganEffect','materialAsset','builtinResource','ffmpegInfo','imageCrop','imageCompress','svgConvert','task_done','code_search','effect_house_toolbox']);
async function imageTool(name,p,c){
 if(p.inferencePath||p.assetType)throw Error('尚未适配官方设计稿尺寸推断/HUD 归一化；请显式提供尺寸');
 const source=checkedPath(p.inputPath??p.sourcePath??p.svgPath,c.projectPath);
 if(name==='svgConvert'&&p.animation)throw Error('SVG 动画时间线尚未适配；静态 SVG 可转换');
 if(name==='svgConvert'){
  const text=await fs.readFile(source,'utf8');if(/<!ENTITY|<script|(?:href|src)\s*=\s*["']\s*(?:https?:|file:|\/\/)/i.test(text))throw Error('SVG 只能使用本地内嵌资源');
 }
 const image=sharp(source),meta=await image.metadata();
 if(p.expectedSourceSize&&(p.expectedSourceSize.width!==meta.width||p.expectedSourceSize.height!==meta.height))throw Error('源图尺寸不匹配');
 const jobs=[];
 if(name==='imageCrop'){
  const s=p.selection;
  if(s.type==='regions')for(const r of s.outputs){if(!r.outputPath)throw Error('每个裁剪区域必须指定 outputPath');jobs.push({...r});}
  else {
   const r=s.sourceRect??{left:0,top:0,width:meta.width,height:meta.height};
   const gw=s.gapX??0,gh=s.gapY??0,w=r.width-gw*(s.columns-1),h=r.height-gh*(s.rows-1);
   if(w<=0||h<=0)throw Error('网格间隔超出源图');
   if((s.remainderPolicy??'error')==='error'&&(w%s.columns||h%s.rows))throw Error('网格尺寸不能整除');
   for(const o of s.outputs){if(o.row<0||o.row>=s.rows||o.column<0||o.column>=s.columns)throw Error('网格下标越界');const l=Math.floor(o.column*w/s.columns),t=Math.floor(o.row*h/s.rows);jobs.push({left:r.left+l+o.column*gw,top:r.top+t+o.row*gh,width:Math.floor((o.column+1)*w/s.columns)-l,height:Math.floor((o.row+1)*h/s.rows)-t,outputPath:o.outputPath});}
  }
 }else jobs.push({outputPath:p.outputPath});
 // 先校验全部目的地，防止处理一半才发现覆盖冲突。
 for(const job of jobs){job.dest=checkedPath(job.outputPath,c.projectPath,true);if(job.dest===source)throw Error('输出不能覆盖源图');if(name==='imageCrop'&&!p.overwrite){try{await fs.access(job.dest);throw Error('输出已存在');}catch(e){if(e.code!=='ENOENT')throw e;}}}
 await c.prepare();const results=[];
 for(const job of jobs){
  let pipe=sharp(source);
  if(name==='imageCrop')pipe=pipe.extract({left:job.left,top:job.top,width:job.width,height:job.height});
  if(name==='imageCompress'){
   if(p.chromaKeyColor){
    if(!/^#[a-f0-9]{6}$/i.test(p.chromaKeyColor))throw Error('chromaKeyColor 需要 #RRGGBB');
    const {data,info}=await pipe.ensureAlpha().raw().toBuffer({resolveWithObject:true});const rgb=[1,3,5].map(i=>parseInt(p.chromaKeyColor.slice(i,i+2),16));
    for(let i=0;i<data.length;i+=4)if(rgb.every((v,k)=>Math.abs(data[i+k]-v)<=12))data[i+3]=0;
    pipe=sharp(data,{raw:info});
   }
   if(p.maxWidth||p.maxHeight)pipe=pipe.resize({width:p.maxWidth,height:p.maxHeight,fit:p.preserveAspectRatio===false?'fill':'inside',withoutEnlargement:true});
  }
  const buffer=await (p.format==='webp'?pipe.webp({quality:85}):pipe.png()).toBuffer();await writeAtomic(job.dest,buffer);
  results.push({path:job.outputPath,bytes:buffer.length,...(p.maxBytes&&buffer.length>p.maxBytes?{warning:'BEST_EFFORT_SIZE_LIMIT_EXCEEDED'}:{})});
 }
 const sync=await c.call('ensureImageAssetsReady',{assetPaths:results.map(r=>r.path)});
 return {outputs:results,sync,adapterNotes:'本地确定性处理；不包含官方设计稿推断和生成任务状态。'};
}
export async function runAdapter(name,p,c){
 if(playNames.has(name))return runPlay(name,p,c);
 if(name==='code_search')return codeSearch(p,c);
 if(cloudTools.has(name))throw Error('OFFICIAL_CLOUD_BACKEND_NOT_ADAPTED: 此工具依赖官方生成服务和任务上下文；本地 MCP 不会假装生成成功或挪用账号令牌。');
 if(name==='userScript'||name==='setupGameScript')return setupScript(p,c,name==='userScript');
 if(['imageCrop','imageCompress','svgConvert'].includes(name))return imageTool(name,p,c);
 if(name==='compileProject')return c.call('runOtscCheck',{options:{timeoutMs:p.timeoutMs??60000,maxOutputChars:p.maxOutputChars??20000}});
 if(name==='consoleLog')return c.call('getConsoleLogs',p);
 if(name==='ffmpegInfo')return c.call('getFfmpegPath',{});
 if(name==='task_done')return {summary:p.summary,reported:true};
 if(name==='ganEffect'){
  const r=await c.call('getGanCatalog',{}),items=r.items??r.result?.items??[];
  return {items:p.query?items.filter(i=>JSON.stringify(i).toLowerCase().includes(p.query.toLowerCase())):items,total:items.length};
 }
 if(name==='materialAsset')return c.call(({create:'createMaterialAsset',edit:'editMaterialAsset',read:'readMaterialAsset',get_compile_status:'getMaterialCompileStatus'})[p.operation],p);
 if(name==='builtinResource'){
  if(p.operation==='add_builtin_resource')return c.call('addBuiltinResource',{resource_type:p.resource_type,...(p.name?{name:p.name}:{})});
  if(p.operation==='set_resource_properties')return c.call('setResourceProperties',{guid:p.guid,properties:p.properties});
  const root=path.join(c.resourcesRoot,'Asset/schemas'),files=(await walk(root)).filter(f=>f.endsWith('.json'));
  const entries=[];for(const file of files){const data=JSON.parse(await fs.readFile(file,'utf8'));for(const [key,value]of Object.entries(data))if(!p.query||JSON.stringify({key,value}).toLowerCase().includes(p.query.toLowerCase()))entries.push({file:path.basename(file),key,value});}
  return {matches:entries.slice(0,p.limit??10),total:entries.length,adapterNotes:'原始模式搜索；保留文件来源，不模拟官方覆盖层合并。'};
 }
 if(name==='sceneSpec')return sceneSpec(c);
 if(name==='sceneOps')return sceneOps(p,c);
 if(name==='previewTool'){
  const results=[];
  for(const cmd of p.commands){const command=previewNames[cmd.commandType];if(!command)throw Error('未知预览命令');const value=await c.call(command,cmd.params??{});results.push({command:cmd.commandType,value});if(value?.success===false)break;}
  return {results};
 }
 throw Error('尚未适配此上层工具；请用对应 eh_ 基础命令或本地文件工具。');
}
