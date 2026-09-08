'use strict';
// 编辑器端只执行已登记命令；会话隔离、工程绑定、备份和超时检查在此再次执行。
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const Ajv=require('ajv');
const runtimeHash=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const inside=(p,r)=>{const rel=path.relative(r,p);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
function canonical(p){return fs.realpathSync.native(path.resolve(p));}
function checkedPath(value,root,allowMissing=false){
 const full=path.resolve(root,value);let existing=full;
 while(!fs.existsSync(existing)){const parent=path.dirname(existing);if(parent===existing)throw Error('路径无有效父目录');existing=parent;}
 if(!inside(full,root)||!inside(canonical(existing),canonical(root)))throw Error('路径超出工程边界');
 if(!allowMissing&&!fs.existsSync(full))throw Error('路径不存在');
 return full;
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
   const sharp=require('sharp'),bytes=Buffer.from(data.base64,'base64'),meta=await sharp(bytes).metadata();
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
module.exports={Runtime,inside,checkedPath,backupProject};
