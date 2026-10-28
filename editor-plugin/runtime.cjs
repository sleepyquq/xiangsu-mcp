'use strict';
// 编辑器端只执行已登记命令；会话隔离、工程绑定、备份和超时检查在此再次执行。
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const Ajv=require('ajv');
const {execFile}=require('child_process');
const {promisify}=require('util');
const runtimeHash=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const inside=(p,r)=>{const rel=path.relative(r,p);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
// 只读取 PNG/JPEG 头部尺寸；编辑器内置 Node 与用户 Node 的原生模块 ABI 不一定一致，不能在此加载 sharp。
function imageSize(b){
 if(b.length>=24&&b.readUInt32BE(0)===0x89504e47&&b.toString('latin1',12,16)==='IHDR')return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
 if(b.length>=4&&b[0]===0xff&&b[1]===0xd8){
  for(let i=2;i+9<b.length;){
   if(b[i]!==0xff){i++;continue;}
   const m=b[i+1];if(m===0xff){i++;continue;}
   if(m===0xd8||m===0x01||(m>=0xd0&&m<=0xd7)){i+=2;continue;}
   if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m))return {width:b.readUInt16BE(i+7),height:b.readUInt16BE(i+5)};
   i+=2+b.readUInt16BE(i+2);
  }
 }
 throw Error('SCREENSHOT_IMAGE_INVALID: 无法识别截图尺寸（仅支持 PNG/JPEG）');
}
function canonical(p){return fs.realpathSync.native(path.resolve(p));}
function checkedPath(value,root,allowMissing=false){
 const full=path.resolve(root,value);let existing=full;
 while(!fs.existsSync(existing)){const parent=path.dirname(existing);if(parent===existing)throw Error('路径无有效父目录');existing=parent;}
 if(!inside(full,root)||!inside(canonical(existing),canonical(root)))throw Error('路径超出工程边界');
 if(!allowMissing&&!fs.existsSync(full))throw Error('路径不存在');
 return full;
}
function usesMaterialActions(version){
 const [major,minor]=String(version??'').split('.').map(Number);
 return major>9||(major===9&&minor>=6);
}
// 从当前安装包和像塑已下载的官方预览目录读取，不内置旧版本素材地址。
function humanActionCatalog(config){
 const categories={preview_face:'face',preview_hand:'hand',preview_fullbody:'fullbody',preview_twoperson:'twoperson'},actions=new Map();
 for(const {manifest,baseRoot} of config.previewCatalogs??[]){
  let data;try{data=JSON.parse(fs.readFileSync(manifest,'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  for(const item of data.defaultVideoInputModels??[]){
   if(!categories[item.type]||typeof item.name!=='string'||typeof item.resourceUrl!=='string')continue;
   const id=item.name.split('||')[0];if(actions.has(id))continue;
   let file;try{file=checkedPath(path.resolve(baseRoot,item.resourceUrl),path.dirname(manifest));}catch(e){if(e.message==='路径不存在')continue;throw e;}
   if(!/\.(mp4|mov)$/i.test(file)||!fs.statSync(file).isFile())continue;
   actions.set(id,{id,category:categories[item.type],inputType:item.type,filePath:file});
  }
 }
 return [...actions.values()];
}
function resolveHumanAction(config,params,root){
 if(params.materialRef){
  const filePath=checkedPath(params.materialRef,root);
  if(!/\.(mp4|mov)$/i.test(filePath)||!fs.statSync(filePath).isFile())throw Error('PLAY_MATERIAL_INVALID: 需要工程内 MP4/MOV 文件');
  return {filePath,inputType:params.inputType};
 }
 const action=humanActionCatalog(config).find(a=>a.id===params.actionId);
 if(!action)throw Error('PLAY_ACTION_UNAVAILABLE: '+params.actionId+'；先调用 playHumanActions 查询本机可用素材');
 return action;
}
function backupProject(root,session){
 const dest=checkedPath(path.join('.codex','backups',session),root,true);
 if(fs.existsSync(path.join(dest,'complete.json')))return dest;
 fs.mkdirSync(dest,{recursive:true});
 function copy(src,out){
  for(const e of fs.readdirSync(src,{withFileTypes:true})){
   if(['.codex','.agents','Agent_cowork','Library','.git','.agent','node_modules'].includes(e.name))continue;
   if(e.isSymbolicLink())continue;
   const a=path.join(src,e.name),b=path.join(out,e.name);
   if(e.isDirectory()){fs.mkdirSync(b,{recursive:true});copy(a,b);}else if(e.isFile())fs.copyFileSync(a,b);
  }
 }
 copy(root,dest);fs.writeFileSync(path.join(dest,'complete.json'),JSON.stringify({project:root,time:new Date().toISOString()}));return dest;
}
class Runtime {
 constructor(config,host){this.config=config;this.host=host;this.session=`${process.pid}-${crypto.randomUUID()}`;this.busy=false;this.closed=false;this.validators=new Map();this.startedAt=Date.now();}
 start(){
  this.dir=path.join(this.config.stateRoot,this.session);fs.mkdirSync(this.dir,{recursive:true});
  this.catalog=JSON.parse(fs.readFileSync(this.config.catalogPath,'utf8'));
  this.catalogHash=crypto.createHash('sha256').update(JSON.stringify(this.catalog)).digest('hex');
  const ajv=new Ajv({strict:false,allErrors:true});
  for(const c of this.catalog){this.validators.set(c.name,ajv.compile(c.inputSchema));}
  this.advertise();this.heartbeat=setInterval(()=>this.advertise(),1000);this.timer=setInterval(()=>this.tick(),150);
  const events=globalThis.orion?.['@orion/Business/Event/BusinessEventManager']?.BusinessEventManager?.TypeGuard();
  if(events){
   this.playListener=(id,_a,_b,payload)=>{
    if(Number(id)!==35025||!this.capture||this.host.getProject()?.path!==this.capture.projectPath)return;
    try{
     const frame=typeof payload==='string'?JSON.parse(payload):payload;
     if(frame?.type!=='play-runtime-state'||frame.evalId!==this.capture.id)return;
     const line=JSON.stringify(frame)+'\n';if(Buffer.byteLength(line)>4*1024*1024)throw Error('PLAY_FRAME_TOO_LARGE');
     const folder=path.join(this.dir,'playthrough');fs.mkdirSync(folder,{recursive:true});
     const file=path.join(folder,this.capture.id+'.ndjson');
     if(fs.existsSync(file)&&fs.statSync(file).size>64*1024*1024)throw Error('PLAY_LOG_LIMIT');
     fs.appendFileSync(file,line);
    }catch(e){console.error('[XiangsuMCP play]',String(e));}
   };
   events.on('PreviewRenderMsg',this.playListener);this.playEvents=events;
  }
 }
 status(){const p=this.host.getProject();return {sessionId:this.session,pid:process.pid,startedAt:this.startedAt,heartbeat:Date.now(),projectPath:p?.path||null,ready:!!p?.path,bridgeVersion:'0.2.0',protocolVersion:2,runtimeHash,catalogHash:this.catalogHash,editorVersion:this.config.editorVersion??null,logRoot:process.argv.find(a=>a.startsWith('--logPath='))?.slice(10)??null,busy:this.busy};}
 advertise(){try{const tmp=path.join(this.dir,'session.tmp');fs.writeFileSync(tmp,JSON.stringify(this.status()));fs.renameSync(tmp,path.join(this.dir,'session.json'));}catch(e){console.error('[XiangsuMCP]',String(e));}}
 async humanAction(request,params,root){
  const stateFile=path.join(this.dir,'human-action.json');
  let state;try{state=JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(state&&state.projectPath!==root)throw Error('PLAY_ACTION_PROJECT_CHANGED: 先返回原工程恢复预览输入');
  const id=params.sessionId??this.session;
  if(state&&state.id!==id)throw Error('PLAY_ACTION_SESSION_ACTIVE: 先恢复已有动作会话 '+state.id);
  const send=async(commandType,p,keys)=>{
   const result=await this.host.execute({requestID:request.id,commandType,params:p,paramKeys:keys});
   if(!result||result.success===false)throw Error('PLAY_ACTION_COMMAND_FAILED: '+JSON.stringify(result));
   return result;
  };
  const begin=async()=>{
   if(state?.begun)return {success:true,reused:true,sessionId:id};
   if(state)throw Error('PLAY_ACTION_BEGIN_INCOMPLETE: 先调用 restoreHumanActionSession');
   // 先保存恢复身份；即使官方命令执行后抛错，也能重试恢复而非覆盖原输入快照。
   state={id,projectPath:root,begun:false};fs.writeFileSync(stateFile,JSON.stringify(state));
   const result=await send('beginHumanActionSession',{sessionId:id},['sessionId']);
   state.begun=true;fs.writeFileSync(stateFile,JSON.stringify(state));return result;
  };
  const restore=async()=>{
   if(!state)return {success:true,restored:false};
   const result=await send('restoreHumanActionSession',{sessionId:id},['sessionId']);
   fs.unlinkSync(stateFile);state=null;return result;
  };
  if(request.command==='beginHumanActionSession')return begin();
  if(request.command==='restoreHumanActionSession')return restore();
  // 路径和动作 ID 在 begin 之前检查，错误输入不得更改预览。
  const action=resolveHumanAction(this.config,params,root),autoBegin=!state;
  try{
   await begin();
   return await send('switchHumanAction',{sessionId:id,actionId:action.filePath,filePath:action.filePath,inputType:action.inputType},['sessionId','actionId','filePath','inputType']);
  }catch(error){
   if(autoBegin)try{await restore();}catch(cleanupError){throw Error(String(error)+'；动作恢复失败：'+String(cleanupError));}
   throw error;
  }
 }
 async execute(request){
  if(request.sessionId!==this.session)throw Error('会话已失效');
  if(!Number.isFinite(request.expiresAt)||request.expiresAt<Date.now())throw Error('请求已过期');
  const root=this.host.getProject()?.path;
  if(!root || !request.projectPath || canonical(root)!==canonical(request.projectPath))throw Error('工程不匹配或尚未加载');
  if(!this.config.allowedRoots.some(r=>inside(canonical(root),canonical(r))))throw Error('工程不在允许的工作区内');
  if(request.command==='projectStatus')return this.status();
  if(request.command==='prepareWrite')return {backupPath:backupProject(root,this.session)};
  const spec=this.catalog.find(c=>c.name===request.command);
  if(!spec||spec.schemaStatus==='unresolved')throw Error('命令未适配或参数尚未确认');
  const params=request.params||{};
  for(const [key,schema]of Object.entries(spec.inputSchema.properties||{}))if(params[key]===undefined&&schema.default!==undefined)params[key]=schema.default;
  const valid=this.validators.get(spec.name);
  if(!valid(params))throw Error('参数校验失败: '+JSON.stringify(valid.errors));
  if(['getHumanActions','switchHumanAction','beginHumanActionSession','restoreHumanActionSession'].includes(spec.name)){
   if(usesMaterialActions(this.config.editorVersion)){
    if(spec.name==='getHumanActions'){
     const actions=[];
     for(const action of humanActionCatalog(this.config)){
      const {stdout}=await promisify(execFile)(this.config.ffprobePath,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',action.filePath],{windowsHide:true,timeout:10000});
      const durationMs=Number(stdout.trim())*1000;if(!Number.isFinite(durationMs)||durationMs<=0)throw Error('PLAY_MATERIAL_DURATION_INVALID: '+action.id);
      const {filePath,...info}=action;actions.push({...info,durationMs,recommendedWaitMs:Math.min(5000,Math.max(1,Math.round(durationMs*0.9)))});
     }
     return {actions};
    }
    return this.humanAction(request,params,root);
   }
   if(spec.name!=='getHumanActions'&&(spec.name!=='switchHumanAction'||params.materialRef||params.sessionId))throw Error('PLAY_MATERIAL_REQUIRES_9_6: 旧版请使用 actionId');
  }
  if(params.projectPath && canonical(params.projectPath)!==canonical(root))throw Error('命令工程路径不匹配');
  // 路径型命令不得读写到选定工程之外；导入素材也先放到工程中。
  for(const key of ['path','filePath','assetPath','gitRepoPath'])if(typeof params[key]==='string')params[key]=checkedPath(params[key],root,true);
  if(params.paths)params.paths=params.paths.map(p=>checkedPath(p,root));
  if(params.assetPaths)params.assetPaths=params.assetPaths.map(p=>checkedPath(p,root));
  if(spec.name==='runOtscCheck')params.projectPath=root;
  if(spec.name==='ensureImageAssetsReady')params.projectPath=root;
  if(['createProjectSnapshot','restoreProjectSnapshot'].includes(spec.name))params.projectPath=root;
  if(spec.name==='saveScreenshot'&&params.scale===undefined)params.scale=0.5;
  if(spec.name==='beginPreviewRecording'){
   params.projectPath=root;fs.mkdirSync(path.dirname(params.filePath),{recursive:true});
   if(params.playId)this.capture={id:params.playId,projectPath:root};
  }
  if(spec.name==='recordPreviewVideo'){
   params.path=checkedPath(params.path??`.codex/artifacts/recordings/${Date.now()}.mp4`,root,true);
   fs.mkdirSync(path.dirname(params.path),{recursive:true});
  }
  if(!spec.readOnly)backupProject(root,this.session);
  // 同一进程中先校验再发起调用，不能按 JSON 键枚举顺序推断参数位置。
  const ordered={};for(const key of spec.parameterOrder)ordered[key]=params[key];
  const result=await this.host.execute({requestID:request.id,commandType:spec.name,params:ordered,paramKeys:spec.parameterOrder});
  if(spec.name==='saveScreenshot'&&params.path&&result?.success!==false){
   const data=result?.base64?result:result?.result;
   if(!data?.base64||!/^image\//.test(data.mimeType??''))throw Error('SCREENSHOT_IMAGE_MISSING: 未返回可落盘图像');
   const bytes=Buffer.from(data.base64,'base64'),meta=imageSize(bytes);
   fs.mkdirSync(path.dirname(params.path),{recursive:true});
   const tmp=params.path+'.mcp-'+crypto.randomUUID();fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,params.path);
   return {...result,path:params.path,saved:true,width:meta.width,height:meta.height,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  }
  return result;
 }
 async tick(){
  if(this.busy||this.closed)return;this.busy=true;
  try{
   const requests=fs.readdirSync(this.dir).filter(n=>/^req-[a-f0-9-]+\.json$/.test(n));
   for(const file of requests){
    const id=file.slice(4,-5),done=path.join(this.dir,`res-${id}.json`);if(fs.existsSync(done))continue;
    let result;
    try{
     const request=JSON.parse(fs.readFileSync(path.join(this.dir,file),'utf8'));
     if(request.id!==id)throw Error('请求 ID 不匹配');
     if(fs.existsSync(path.join(this.dir,`cancel-${id}`)))throw Error('请求已取消');
     fs.writeFileSync(path.join(this.dir,`started-${id}`),String(Date.now()));
     const value=await this.execute(request);result={ok:true,value};
    }catch(error){result={ok:false,error:{code:'EDITOR_COMMAND_FAILED',message:String(error)}};}
    fs.writeFileSync(done+'.tmp',JSON.stringify(result));fs.renameSync(done+'.tmp',done);
   }
  }catch(e){console.error('[XiangsuMCP]',String(e));}
  finally{this.busy=false;this.cleanup();}
 }
 cleanup(){
  // 只回收已完成并保留至少一小时的请求；进行中的请求和取消标记保留。
  if(Date.now()-(this.lastCleanup??0)<60000)return;this.lastCleanup=Date.now();
  try{for(const file of fs.readdirSync(this.dir)){
   const m=file.match(/^res-([a-f0-9-]+)\.json$/);if(!m||Date.now()-fs.statSync(path.join(this.dir,file)).mtimeMs<3600000)continue;
   for(const name of [`req-${m[1]}.json`,`started-${m[1]}`,`cancel-${m[1]}`,file])try{fs.unlinkSync(path.join(this.dir,name));}catch(e){if(e.code!=='ENOENT')throw e;}
  }}catch(e){console.error('[XiangsuMCP cleanup]',String(e));}
 }
 stop(){this.closed=true;clearInterval(this.timer);clearInterval(this.heartbeat);if(this.playListener)this.playEvents?.off?.('PreviewRenderMsg',this.playListener);try{fs.unlinkSync(path.join(this.dir,'session.json'));}catch{}}
}
module.exports={imageSize,Runtime,inside,checkedPath,backupProject,usesMaterialActions,humanActionCatalog,resolveHumanAction};
