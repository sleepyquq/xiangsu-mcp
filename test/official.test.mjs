import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {officialTools,publishH5Tool} from '../src/official.mjs';
import {createServer} from '../src/server.mjs';

async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiangsu-official-'));
 const project=path.join(root,'project');await fs.mkdir(project);
 const calls=[],context={identity:{instance_id:'1',project_id:'project-1',project_path:project}};
 const data={root,project,calls,context};
 const httpServer=http.createServer(async(req,res)=>{
  const server=new Server({name:'official-fixture',version:'1'},{capabilities:{tools:{}}});
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:officialTools}));
  server.setRequestHandler(CallToolRequestSchema,async request=>{
   calls.push(request.params);
   if(request.params.name==='get_project_context')return {content:[{type:'text',text:JSON.stringify({context})}]};
   return typeof data.reply==='function'?data.reply(request.params):data.reply??{content:[{type:'text',text:JSON.stringify({name:request.params.name,args:request.params.arguments})}]};
  });
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{void server.close();});
  await server.connect(transport);
  await transport.handleRequest(req,res);
 });
 await new Promise(resolve=>httpServer.listen(0,'127.0.0.1',resolve));
 data.config={stateRoot:path.join(root,'sessions'),allowedRoots:[project],officialMcpUrl:'http://127.0.0.1:'+httpServer.address().port+'/mcp'};
 t.after(async()=>{httpServer.closeAllConnections();await new Promise(resolve=>httpServer.close(resolve));await fs.rm(root,{recursive:true,force:true});});
 return data;
}

test('服务直接启动时同样拒绝旧版配置；未来版本无需官方在线即可启动',async t=>{
 const f=await fixture(t);
 await assert.rejects(()=>createServer({...f.config,editorVersion:'9.7.1'}),/VERSION_TOO_OLD/);
 const future=await createServer({...f.config,editorVersion:'10.0.0',officialMcpUrl:'http://127.0.0.1:1/mcp'});
 assert.ok(future.definitions.some(t=>t.name==='generate_image'));
});

// 为每个公开合同生成最小合法参数，实际内容由 fixture 接收，不访问云端或编辑器。
function sample(schema){
 if(schema.const!==undefined)return schema.const;
 if(schema.enum)return schema.enum[0];
 if(schema.oneOf||schema.anyOf)return sample((schema.oneOf??schema.anyOf)[0]);
 if(schema.type==='object')return Object.fromEntries((schema.required??[]).map(key=>[key,sample(schema.properties[key])]));
 if(schema.type==='array')return Array.from({length:schema.minItems??0},()=>sample(schema.items));
 if(schema.type==='boolean')return false;
 if(schema.type==='number'||schema.type==='integer')return schema.minimum??0;
 return 'fixture';
}

test('真实 stdio → HTTP MCP 链路完整接入官方 38 个合同，不依赖插件；原参数保持',async t=>{
 const f=await fixture(t);
 const configPath=path.join(f.root,'config.json');await fs.writeFile(configPath,JSON.stringify(f.config));
 const client=new Client({name:'stdio-regression',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.mjs',import.meta.url))],env:{...process.env,XIANGSU_MCP_CONFIG:configPath},stderr:'pipe'});
 t.after(()=>client.close());await client.connect(transport);
 const tools=(await client.listTools()).tools;
 for(const native of officialTools){
  const registered=tools.find(tool=>tool.name===native.name);
  assert.deepEqual(registered.inputSchema,native.inputSchema,native.name+' 参数结构不可改写');
  const args=sample(native.inputSchema);
  if('instance_id' in args)args.instance_id='1';
  if('project_persistent_id' in args)args.project_persistent_id='project-1';
  const result=await client.callTool({name:native.name,arguments:args});
  assert.ok(!result.isError,native.name+': '+JSON.stringify(result));
  assert.equal(f.calls.at(-1).name,native.name);
  assert.deepEqual(f.calls.at(-1).arguments,args,native.name+' 不得丢弃参数');
 }
 assert.equal(officialTools.length,38);
 assert.ok(tools.some(tool=>tool.name===publishH5Tool.name));
 assert.equal(new Set(tools.map(tool=>tool.name)).size,tools.length);
});

test('保留原始图像/音频/资源、结构化结果与失败状态；错误输入和错工程不进入写入',async t=>{
 const f=await fixture(t),{call}=await createServer(f.config);
 f.reply={content:[{type:'text',text:'失败详情'},{type:'image',data:'aGVsbG8=',mimeType:'image/png'},{type:'audio',data:'aGVsbG8=',mimeType:'audio/wav'},{type:'resource_link',uri:'file:///fixture.png',name:'fixture'}],structuredContent:{success:false,request_id:'keep-me'},isError:true,_meta:{trace:'keep-me'}};
 assert.deepEqual(await call('capture_preview',{instance_id:'1'}),f.reply);
 const patch={...sample(officialTools.find(t=>t.name==='apply_workflow_patch').inputSchema),instance_id:'1',project_persistent_id:'wrong'};
 await assert.rejects(()=>call('apply_workflow_patch',patch),/PROJECT_MISMATCH/);
 assert.ok(!f.calls.some(c=>c.name==='apply_workflow_patch'));
 await assert.rejects(()=>call('save_project',{instance_id:'1',path:path.join(f.root,'outside')}),/OUTSIDE_ROOTS/);
 await assert.rejects(()=>call('generate_image',{instance_id:'1',prompt:'missing name'}),/参数校验/);
 assert.ok(!f.calls.some(c=>c.name==='save_project'||c.name==='generate_image'));
 f.context.identity.instance_id='wrong';
 await assert.rejects(()=>call('get_scene',{instance_id:'1'}),/PROJECT_UNAVAILABLE/);
 f.context.identity.instance_id='1';f.context.identity.project_path=f.root;
 await assert.rejects(()=>call('get_scene',{instance_id:'1'}),/OUTSIDE_ROOTS/);
});

test('官方离线不影响旧通道发现；不自动重放写入或上报安装',async t=>{
 const f=await fixture(t),{call}=await createServer(f.config);
 f.reply={content:[{type:'text',text:'执行结果未知'}],isError:true};
 await call('edit_by_dsl',{instance_id:'1',commands:[{command_type:'fixture',params:{}}]});
 assert.equal(f.calls.filter(c=>c.name==='edit_by_dsl').length,1);
 assert.equal(f.calls.filter(c=>c.name==='report_install').length,0);
 const unavailable=await createServer({...f.config,officialMcpUrl:'http://127.0.0.1:1/mcp'});
 assert.deepEqual(await unavailable.call('xiangsu_sessions',{}),[]);
 const capabilities=await unavailable.call('xiangsu_capabilities',{});
 assert.equal(capabilities.official.requiresLegacyPlugin,false);
 await assert.rejects(()=>unavailable.call('health',{}),/OFFICIAL_MCP_UNAVAILABLE/);
});

test('未加载工程时仍可发现状态；临时新工程可首次保存到允许目录，不能在临时目录编辑',async t=>{
 const f=await fixture(t),{call}=await createServer(f.config);
 f.context.identity.project_path='';
 assert.deepEqual(JSON.parse((await call('get_project_context',{instance_id:'1'})).content[0].text).context,f.context);
 await call('project_status',{instance_id:'1'});
 assert.equal(f.calls.at(-1).name,'project_status');
 f.context.identity.project_path=f.root;
 await assert.rejects(()=>call('get_scene',{instance_id:'1'}),/OUTSIDE_ROOTS/);
 await call('save_project',{instance_id:'1',path:path.join(f.project,'first-save')});
 assert.equal(f.calls.at(-1).name,'save_project');
});

test('H5 发布复用安装目录的受管脚本，工程路径和完整句柄保持',async t=>{
 const f=await fixture(t);
 f.config.officialSkillsRoot=path.join(f.root,'skills');
 const script=path.join(f.config.officialSkillsRoot,'workflow/H5ImportWorkflow/scripts/publish-h5-artifact.cjs');
 await fs.mkdir(path.dirname(script),{recursive:true});
 await fs.writeFile(script,"const v=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>i%2?a:[...a,[v,all[i+1]]],[])); if(v['--project-root']!=='.'||v['--zip'].includes('\\\\'))throw Error('必须在工程根目录使用 . 和规范化的相对 ZIP 路径'); console.log(JSON.stringify({request_id:v['--request-id'],artifact_id:v['--artifact-id'],expected_digest:v['--expected-digest'],project_id:v['--project-id'],cwd:process.cwd(),zip:v['--zip']}));");
 await fs.writeFile(path.join(f.project,'effect.zip'),'ZIP fixture');
 const {call}=await createServer(f.config);
 const result=await call('publish_h5_artifact',{instance_id:'1',zip_path:'effect.zip',request_id:'request-1',artifact_id:'artifact-1'});
 const handle=JSON.parse(result.content[0].text);
 assert.equal(handle.request_id,'request-1');assert.equal(handle.artifact_id,'artifact-1');
 assert.equal(handle.project_id,'project-1');assert.equal(handle.cwd,f.project);assert.equal(handle.zip,'effect.zip');assert.match(handle.expected_digest,/^[a-f0-9]{64}$/);
 await assert.rejects(()=>call('publish_h5_artifact',{instance_id:'1',zip_path:'../outside.zip',request_id:'r',artifact_id:'a'}),/边界/);
});

test('已派发写入被取消时保留结果未知语义，不自动发起第二次写入',async t=>{
 const f=await fixture(t),{call}=await createServer(f.config),controller=new AbortController();
 let markDispatched;
 const dispatched=new Promise(resolve=>{markDispatched=resolve;});
 f.reply=async request=>{markDispatched();await new Promise(resolve=>setTimeout(resolve,100));return {content:[{type:'text',text:'completed'}]};};
 const pending=call('edit_by_dsl',{instance_id:'1',commands:[{command_type:'fixture',params:{}}]},controller.signal);
 await dispatched;controller.abort();
 await assert.rejects(()=>pending,/OFFICIAL_CALL_INCOMPLETE/);
 assert.equal(f.calls.filter(c=>c.name==='edit_by_dsl').length,1);
});
