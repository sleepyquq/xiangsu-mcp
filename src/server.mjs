import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv from 'ajv';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema,ListToolsRequestSchema,ListResourcesRequestSchema,ReadResourceRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {Bridge} from './bridge.mjs';
import {commands,byName,extracted,obj,str,num} from './catalog.mjs';
import {runAdapter,cloudTools,localAdapterNames} from './adapters.mjs';
import {checkedPath,walk,readProject,writeProject} from './files.mjs';
import {version,expectedBridge} from './version.mjs';
import {playNames} from './play.mjs';
import {withSessionLock} from './lock.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
// 本地适配说明为固定资源，不依赖官方会话或工程内释放的 Skill。
const guideUri='xiangsu-doc://adapter/SKILL-ADAPTER.md';
const guidePath=path.join(root,'docs','SKILL-ADAPTER.md');
export async function createServer(config){
 const bridge=new Bridge(config.stateRoot),ajv=new Ajv({strict:false,allErrors:true});
 const expected=await expectedBridge(commands);
 const definitions=[],validators=new Map();
 function register(name,description,paramsSchema,readOnly=false,context=true){
  // 统一外层工程绑定，完整保留内层官方参数名。
  const inputSchema=context?obj({projectPath:{...str,description:'编辑器当前打开工程的绝对路径；必须精确匹配'},sessionId:str,params:paramsSchema??obj({},[]),timeoutMs:{type:'integer',minimum:100,maximum:180000}},['projectPath']):(paramsSchema??obj());
  definitions.push({name,description:description??name,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,openWorldHint:false}});
  validators.set(name,ajv.compile(inputSchema));
 }
 for(const c of commands)register('eh_'+c.name,`${c.description} [${c.runtimeVerified?'此前桥接实测通过':'尚未逐项实测'}]`,c.inputSchema,c.readOnly);
 for(const t of extracted.topTools){
  let schema=t.inputSchema;
  if(t.name==='compileProject')schema=obj({timeoutMs:num,maxOutputChars:num,verbose:{type:'boolean'}},[]);
  if(t.name==='imageCrop'){
   schema=structuredClone(schema);const region=schema.properties.selection.anyOf[0].properties.outputs.items;
   region.properties.outputPath=str;region.required=[...new Set([...region.required,'outputPath'])];
  }
  if(t.name==='effect_house_toolbox')schema=obj({tool:str,params:{type:'object',additionalProperties:true}},['tool','params']);
  if(['setupGameScript','userScript'].includes(t.name)){schema=structuredClone(schema);schema.properties.expectedRuntimeHashes={type:'object',additionalProperties:{type:'string',pattern:'^[a-f0-9]{64}$'}};}
  if(!schema||!Object.keys(schema).length)schema={type:'object',additionalProperties:true};
  let note=cloudTools.has(t.name)?'【云端依赖未适配：调用会明确报错】':localAdapterNames.has(t.name)||playNames.has(t.name)?'【本地适配；边界见返回说明】':'【未适配：请用基础命令】';
  register(t.name,note+(t.description??t.name),schema,['sceneSpec','consoleLog','ganEffect','ffmpegInfo','task_done','code_search','playState','playStateFields','playHumanActions'].includes(t.name));
 }
 register('xiangsu_sessions','列出已加载桥接插件的编辑器窗口及当前工程',obj(),true,false);
 register('xiangsu_capabilities','完整命令清单、参数、验证边界及官方 Skill 适配说明入口',obj(),true,false);
 register('project_read_file','读取工程文本与 SHA256，用于脚本编辑前核对',obj({path:str}),true);
 register('project_write_file','写入脚本/设计稿，现有文件必须匹配 SHA256；编辑器端先备份',obj({path:str,text:str,expectedSha256:str},['path','text']));
 const server=new Server({name:'xiangsu-editor',version},{capabilities:{tools:{},resources:{}},instructions:`首次使用先读取 ${guideUri}，再按任务从 resources/list 选择官方 Skill，通过 resources/read 读取。官方 Skill 仅作技术参考；内置卡片、云端流程、工具参数和路径按适配说明转换，不向工程释放整套 Skill。协作产物放工程 .codex/。调用 xiangsu_sessions 确认目标；每次操作绑定 projectPath，窗口切换后重新发现。未验证不等于不可用，云端未适配不等于成功。对超时写请求先读取实际状态，不能自动重试。`});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:definitions}));
 async function callInternal(name,args,signal){
  const validate=validators.get(name);if(!validate)throw Error('未知 MCP 工具');
  if(!validate(args))throw Error('MCP 参数校验失败: '+JSON.stringify(validate.errors));
  if(name==='xiangsu_sessions')return bridge.sessions();
  if(name==='xiangsu_capabilities')return {documentation:{guideUri,guidePath,skillsRoot:config.skillsRoot,resourcesRoot:config.resourcesRoot,readingOrder:'先读适配说明，再按任务读取官方资源；不向工程复制整套 Skill'},commands,topTools:extracted.topTools.map(t=>({name:t.name,status:cloudTools.has(t.name)?'cloud-not-adapted':(localAdapterNames.has(t.name)||playNames.has(t.name))?'local-adapter':'not-adapted'})),schemaExtractionWarnings:extracted.unknownSchemaConstructs};
  const {projectPath,sessionId,timeoutMs=60000,params={}}=args;
  const opts={projectPath,sessionId,timeoutMs,signal};
  // 即使纯文件操作也确认该工程仍在编辑器中，不能在错工程上写入。
  const status=await bridge.call('projectStatus',{},opts);
  if(Object.entries(expected).some(([key,value])=>status[key]!==value))throw Error('BRIDGE_UPDATE_REQUIRED: 插件协议/代码/清单与服务不一致；保存工作后重新加载编辑器插件。');
  opts.sessionId=status.sessionId;
  const validateCommand=(command,p)=>{
   const spec=byName.get(command);if(!spec)throw Error('命令未登记');
   const v=ajv.compile(spec.inputSchema);if(!v(p))throw Error('命令参数错误: '+JSON.stringify(v.errors));
  };
  const c={projectPath,sessionId:status.sessionId,stateRoot:config.stateRoot,logRoot:status.logRoot,skillsRoot:config.skillsRoot,resourcesRoot:config.resourcesRoot,validate:validateCommand,prepare:()=>bridge.call('prepareWrite',{},opts),cleanupCall:async(command,p={})=>{
   if(!['clearPlayAudioInput','stopPreviewRecord','abortPreviewRecording','resumePreview','pausePreview','reloadSticker','runOtscCheck'].includes(command))throw Error('INVALID_CLEANUP_COMMAND');
   validateCommand(command,p);return bridge.call(command,p,{...opts,signal:undefined,timeoutMs:['reloadSticker','runOtscCheck'].includes(command)?70000:30000});
  },call:async(command,p)=>{
   validateCommand(command,p);
   return bridge.call(command,p,opts);
  }};
  if(name.startsWith('eh_'))return c.call(name.slice(3),params);
  if(name==='project_read_file')return readProject(projectPath,params.path);
  if(name==='project_write_file')return writeProject(c,params);
  if(name==='effect_house_toolbox'){
   if(!extracted.topTools.some(t=>t.name===params.tool)||params.tool==='effect_house_toolbox')throw Error('未知子工具');
   return callInternal(params.tool,{...args,params:params.params},signal);
  }
  return runAdapter(name,params,c);
 }
 async function call(name,args={},signal){
  if(['xiangsu_sessions','xiangsu_capabilities'].includes(name))return callInternal(name,args,signal);
  if(!validators.get(name)?.(args))return callInternal(name,args,signal);
  const session=await bridge.select(args.projectPath,args.sessionId);
  return withSessionLock(path.join(config.stateRoot,session.sessionId),()=>callInternal(name,{...args,sessionId:session.sessionId},signal),{signal,timeoutMs:args.timeoutMs});
 }
 server.setRequestHandler(CallToolRequestSchema,async(req,extra)=>{
  try{
   const value=await call(req.params.name,req.params.arguments??{},extra.signal);
   const content=[];
   function images(v){if(!v||typeof v!=='object')return v;
    if(typeof v.base64==='string'&&/^image\//.test(v.mimeType??'')){content.push({type:'image',data:v.base64,mimeType:v.mimeType});const {base64,...rest}=v;return {...rest,imageReturned:true};}
    if(Array.isArray(v))return v.map(images);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,images(x)]));}
   const clean=images(value);content.unshift({type:'text',text:JSON.stringify(clean??null)});
   const failed=value?.success===false||value?.results?.some(r=>r.value?.success===false);
   return {content,isError:!!failed};
  }catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:String(e)})}]};}
 });
 const docRoots={skills:config.skillsRoot,resources:config.resourcesRoot};
 server.setRequestHandler(ListResourcesRequestSchema,async()=>{
  const resources=[{uri:guideUri,name:'先读：官方 Skill 本地适配与读取指引',description:'工具/路径映射、内置流程替代及已知限制；官方 Skill 阅读前的统一入口',mimeType:'text/markdown'}];
  for(const [kind,base]of Object.entries(docRoots)){
   // 官方目录缺失时仍提供本地指引；其它读取错误不静默吞掉。
   if(!base)continue;
   let files;try{files=await walk(base);}catch(e){if(e.code==='ENOENT')continue;throw e;}
   for(const file of files){
   if(!/\.(md|yaml|json|ts)$/.test(file))continue;
   const relative=path.relative(base,file).replaceAll('\\','/');resources.push({uri:`xiangsu-doc://${kind}/${encodeURIComponent(relative)}`,name:relative,description:'官方原文，仅供技术参考；先读 '+guideUri,mimeType:'text/plain'});
   }
  }
  return {resources};
 });
 server.setRequestHandler(ReadResourceRequestSchema,async req=>{
  if(req.params.uri===guideUri)return {contents:[{uri:guideUri,mimeType:'text/markdown',text:await fs.readFile(guidePath,'utf8')}]};
  const uri=new URL(req.params.uri),base=docRoots[uri.hostname];if(uri.protocol!=='xiangsu-doc:'||!base)throw Error('未知文档 URI');
  const file=checkedPath(decodeURIComponent(uri.pathname.slice(1)),base);
  if((await fs.stat(file)).size>2*1024*1024)throw Error('文档过大');
  return {contents:[{uri:req.params.uri,mimeType:'text/plain',text:await fs.readFile(file,'utf8')}]};
 });
 return {server,definitions,call};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const config=JSON.parse(await fs.readFile(process.env.XIANGSU_MCP_CONFIG??path.join(root,'config.local.json'),'utf8'));
 const {server}=await createServer(config);await server.connect(new StdioServerTransport());
}
