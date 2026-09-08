import {effectWorkspace} from '../src/paths.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=effectWorkspace();
const projectPath=path.join(root,'Agent_cowork/像塑Agent接口调查/test-stable');
const evidence=path.join(projectPath,'.codex/artifacts/mcp-live-test');await fs.mkdir(evidence,{recursive:true});
const client=new Client({name:'xiangsu-live-test',version:'1.0.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.mjs',import.meta.url))],stderr:'pipe'}));
const outcomes=[];
async function call(name,params={}){
 const begin=Date.now(),result=await client.callTool({name,arguments:{projectPath,params}},undefined,{timeout:180000});
 const value=JSON.parse(result.content.find(c=>c.type==='text').text);
 await fs.writeFile(path.join(evidence,`${outcomes.length}-${name}.json`),JSON.stringify(result,null,2));
 outcomes.push({name,success:!result.isError,durationMs:Date.now()-begin});
 if(result.isError)throw Error(name+': '+JSON.stringify(value));return value;
}
const guid=o=>typeof o.guid==='string'?o.guid:o.guid?.data??o.result?.guid?.data??o.result?.guid;
let group,object,component;
try{
 const before=await call('eh_getScene');
 await call('eh_getSupportedRenderGroupType');await call('eh_getSupportedComponentTypes');await call('eh_getAllAssets');
 group=guid(await call('eh_addRenderGroup',{name:'MCP回归临时分组',type:'Utility'}));if(!group)throw Error('新分组未返回 GUID');
 object=guid(await call('eh_addSceneObject',{parent:group,type:'Transform',name:'MCP回归临时对象'}));if(!object)throw Error('新对象未返回 GUID');
 await call('eh_setSceneObject',{guid:object,properties:[{property:'name',value:{type:'String',data:'MCP改名通过'}}]});
 const changed=await call('eh_getSceneObject',{guid:object});if(changed.name.data!=='MCP改名通过')throw Error('改名未生效');
 await call('eh_setSceneObject',{guid:object,properties:[{property:'visible',value:{type:'Boolean',data:false}}]});
 await call('eh_getSceneObject',{guid:object});
 await call('eh_saveScreenshot',{scale:0.5});await call('compileProject');
 await call('eh_pausePreview');await call('eh_resumePreview');
 await call('eh_deleteSceneObject',{guid:object});object=null;
 await call('eh_deleteRenderGroup',{guid:group});group=null;
 const after=await call('eh_getScene');
 outcomes.push({name:'sceneGroupCountRestored',success:before.renderGroups.length===after.renderGroups.length});
}catch(e){outcomes.push({name:'failure',success:false,error:String(e)});process.exitCode=1;}
finally{
 if(object)try{await call('eh_deleteSceneObject',{guid:object});}catch(e){outcomes.push({name:'cleanupObject',success:false,error:String(e)});}
 if(group)try{await call('eh_deleteRenderGroup',{guid:group});}catch(e){outcomes.push({name:'cleanupGroup',success:false,error:String(e)});}
 await fs.writeFile(path.join(evidence,'summary.json'),JSON.stringify(outcomes,null,2));console.log(JSON.stringify(outcomes));await client.close();
}
