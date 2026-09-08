import {effectWorkspace} from '../src/paths.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=effectWorkspace(),projectPath=path.join(root,'Agent_cowork/像塑Agent接口调查/test-stable'),evidence=path.join(projectPath,'.codex/artifacts/mcp-script-test');await fs.mkdir(evidence,{recursive:true});
const client=new Client({name:'xiangsu-script-test',version:'1.0.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.mjs',import.meta.url))],stderr:'pipe'}));
const outcomes=[];
async function call(name,params={},expectedError=false){const begin=Date.now(),r=await client.callTool({name,arguments:{projectPath,params}},undefined,{timeout:180000});await fs.writeFile(path.join(evidence,`${outcomes.length}-${name}.json`),JSON.stringify(r,null,2));outcomes.push({name,expectedError,success:!!r.isError===expectedError,durationMs:Date.now()-begin});if(!!r.isError!==expectedError)throw Error(JSON.stringify(r));return JSON.parse(r.content[0].text);}
let group,object;const guid=o=>o.guid?.data??o.guid;
try{
 group=guid(await call('eh_addRenderGroup',{name:'MCP脚本测试',type:'Utility'}));object=guid(await call('eh_addSceneObject',{parent:group,type:'Transform',name:'MCP脚本测试对象'}));
 const runtime=await call('project_read_file',{path:'Assets/Game2D.ts'});
 await call('setupGameScript',{scriptName:'XiangsuMCPProbe',targetId:object,abilities:[],expectedRuntimeHashes:{'Game2D.ts':runtime.sha256}});
 await call('compileProject');
 const p=await call('project_read_file',{path:'Assets/XiangsuMCPProbe.ts'});
 await fs.writeFile(path.join(evidence,'script-original.ts'),p.text);
 const bad=await call('project_write_file',{path:p.path,text:p.text+'\nconst mcpIntentionalError: number = "intentional type error";\n',expectedSha256:p.sha256});
 try{await call('compileProject',{},true);}finally{await call('project_write_file',{path:p.path,text:p.text,expectedSha256:bad.sha256});}
 await call('compileProject');
}catch(e){outcomes.push({name:'failure',success:false,error:String(e)});process.exitCode=1;}
finally{
 if(object)try{await call('eh_deleteSceneObject',{guid:object});}catch(e){outcomes.push({name:'cleanupObject',success:false,error:String(e)});}
 if(group)try{await call('eh_deleteRenderGroup',{guid:group});}catch(e){outcomes.push({name:'cleanupGroup',success:false,error:String(e)});}
 await fs.writeFile(path.join(evidence,'summary.json'),JSON.stringify(outcomes,null,2));console.log(JSON.stringify(outcomes));await client.close();
}
