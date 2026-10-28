import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {checkedPath} from './files.mjs';
import {withSessionLock} from './lock.mjs';
import {version} from './version.mjs';

export const officialCatalog=JSON.parse(await fs.readFile(new URL('../catalog.official.json',import.meta.url),'utf8'));
export const officialTools=officialCatalog.tools;
export const officialNames=new Set(officialTools.map(tool=>tool.name));
const managers=new Set(['health','list_instances','report_install']);

export const publishH5Tool={
 name:'publish_h5_artifact',
 description:'将工程内最终 H5 ZIP 交给像塑自带的 ArtifactStore 发布脚本，返回 import_h5_render_bundle 所需的完整句柄；不生成视频、不导入工程。',
 inputSchema:{type:'object',properties:{instance_id:{type:'string'},zip_path:{type:'string',description:'已核对工程内最终 ZIP 的相对路径。'},request_id:{type:'string',pattern:'^[A-Za-z0-9._-]{1,64}$'},artifact_id:{type:'string',pattern:'^[A-Za-z0-9._-]{1,128}$'}},required:['instance_id','zip_path','request_id','artifact_id'],additionalProperties:false},
 annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
};

// 解析工具明确返回的对象；不从任意文本或缓存推断工程身份。
export function toolObject(result){
 if(result.structuredContent)return result.structuredContent;
 for(const block of result.content??[])if(block.type==='text'){
  try{const value=JSON.parse(block.text);if(value&&typeof value==='object')return value;}catch{}
 }
 throw Error('OFFICIAL_RESULT_INVALID: 官方工具没有返回可识别的结构化结果');
}

export class OfficialGateway {
 constructor(config){
  this.config=config;
  this.url=new URL(process.env.XIANGSU_OFFICIAL_MCP_URL??config.officialMcpUrl??'http://127.0.0.1:17320/mcp');
  // 这是本机像塑适配器，不把文件路径、工程数据或凭据转给远程 MCP。
  if(!['http:','https:'].includes(this.url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(this.url.hostname)||this.url.username||this.url.password)throw Error('OFFICIAL_MCP_URL_INVALID: 官方 MCP 地址必须是本机 HTTP/HTTPS 地址，不含凭据');
 }
 async allowedProject(projectPath,allowMissing=false){
  for(const root of this.config.allowedRoots??[]){
   try{return checkedPath(projectPath,root,allowMissing);}catch{}
  }
  throw Error('OFFICIAL_PROJECT_OUTSIDE_ROOTS: 工程不在允许的工作区内');
 }
 async checkContext(result,instanceId){
  const context=toolObject(result).context;
  if(context?.identity?.instance_id!==instanceId||!context.identity.project_path)throw Error('OFFICIAL_PROJECT_UNAVAILABLE: 当前实例未打开工程或身份不匹配');
  return context;
 }
 async call(name,args,{signal,onprogress}={}){
  if(!officialNames.has(name)&&name!==publishH5Tool.name)throw Error('未知官方 MCP 工具');
  // 不在启动、工具发现或旧功能调用时连接 Gateway；官方服务离线不影响原插件。
  const client=new Client({name:'xiangsu-editor-mcp',version});
  const timeout=this.config.officialTimeoutMs??180000;
  let phase='connect';
  try{
   await client.connect(new StreamableHTTPClientTransport(this.url),{signal,timeout:10000});
   const invoke=(tool,params,progress)=>client.callTool({name:tool,arguments:params},undefined,{signal,timeout:Math.max(timeout,Number(params.timeout_ms)||0)+10000,onprogress:progress});
   phase='call';
   if(managers.has(name))return await invoke(name,args,onprogress);
   // 发现/状态查询必须保留“未打开工程”的原生语义，不能以编辑前置条件挡住它们。
   if(name==='get_project_context'||name==='project_status')return await invoke(name,args,onprogress);
   const dir=path.join(this.config.stateRoot,'official',encodeURIComponent(args.instance_id));
   await fs.mkdir(dir,{recursive:true});
   return await withSessionLock(dir,async()=>{
    // 在获得执行权后核对工程，不能使用排队之前的过时工程身份。
    const contextResult=await invoke('get_project_context',{instance_id:args.instance_id});
    if(contextResult.isError)return contextResult;
    const context=await this.checkContext(contextResult,args.instance_id);
    // 新建项目默认在像塑临时目录。显式另存到允许目录时只检查目标，
    // 其他工程操作仍限制在允许目录；不扩大工作区或卡住首次保存。
    if(name==='save_project'&&args.path)await this.allowedProject(path.resolve(context.identity.project_path,args.path),true);
    else await this.allowedProject(context.identity.project_path);
    if(args.project_persistent_id&&args.project_persistent_id!==context.identity.project_id)throw Error('OFFICIAL_PROJECT_MISMATCH: 稳定工程 ID 与当前实例不一致');
    if(name==='run_otsc_check'&&args.project_path&&await fs.realpath(args.project_path)!==await fs.realpath(context.identity.project_path))throw Error('OFFICIAL_PROJECT_MISMATCH: 编译目标与当前实例不一致');
    if(name===publishH5Tool.name)return this.publishH5(args,context,signal);
    // 完整传回 content、图像/音频/资源、structuredContent、isError 和扩展元数据。
    return invoke(name,args,onprogress);
   },{signal,timeoutMs:timeout});
  }catch(error){
   if(phase==='connect')throw Error('OFFICIAL_MCP_UNAVAILABLE: 请启动像塑并启用官方 MCP；检查 '+this.url.href+'。原插件工具仍可独立使用。原因：'+error.message,{cause:error});
   if(error.code===-32001||signal?.aborted)throw Error('OFFICIAL_CALL_INCOMPLETE: 请求超时或取消，实际执行结果未确认。写入/生成请求不得自动重放；先查询当前状态。',{cause:error});
   throw error;
  }finally{await client.close();}
 }
 async publishH5(args,context,signal){
  const project=context.identity.project_path;
  if(path.isAbsolute(args.zip_path)||!args.zip_path.toLowerCase().endsWith('.zip'))throw Error('H5_ZIP_PATH_INVALID: 请提供当前工程内最终 ZIP 的相对路径');
  const zip=checkedPath(args.zip_path,project);
  const script=checkedPath('workflow/H5ImportWorkflow/scripts/publish-h5-artifact.cjs',this.config.officialSkillsRoot);
  // ArtifactStore 明确要求最终 ZIP 完整字节的摘要；只在这个完整性合同处计算。
  const hash=createHash('sha256');
  for await(const bytes of createReadStream(zip,{signal}))hash.update(bytes);
  const digest=hash.digest('hex');
  const relativeZip=path.relative(project,zip).split(path.sep).join('/');
  const {stdout}=await promisify(execFile)(process.execPath,[script,'--project-root','.','--project-id',context.identity.project_id,'--request-id',args.request_id,'--artifact-id',args.artifact_id,'--expected-digest',digest,'--zip',relativeZip],{cwd:project,windowsHide:true,signal,timeout:120000,maxBuffer:1024*1024});
  return {content:[{type:'text',text:stdout.trim()}]};
 }
}
