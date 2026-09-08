// 仅操作历史确认的可丢弃测试副本，证据保存在该工程。
import {effectWorkspace} from '../src/paths.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const projectPath=path.join(effectWorkspace(),'Agent_cowork/像塑Agent接口调查/test-stable');
const out=path.join(projectPath,'.codex/artifacts/mcp-9.4');
await fs.mkdir(out,{recursive:true});
const client=new Client({name:'regression-9.4',version:'0.2.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.mjs',import.meta.url))],stderr:'pipe'}));
const results=[];
async function call(name,params={}){
 const r=await client.callTool({name,arguments:{projectPath,params}},undefined,{timeout:180000});
 await fs.writeFile(path.join(out,`${results.length}-${name}.json`),JSON.stringify(r,null,2));
 const v=JSON.parse(r.content.find(c=>c.type==='text').text);
 results.push({name,success:!r.isError,error:r.isError?v:undefined});
 console.log(name,r.isError?'FAIL':'OK');
 if(r.isError)throw Error(JSON.stringify(v));return v;
}
const id='MCP94回归文字',imageId='MCP94回归图片';let playing=false;
try{
 await call('sceneSpec');
 await call('sceneOps',{ops:[{op:'add',type:'Text',id,groupId:'2D 前景 (1)',content:'MCP 9.4',positionMode:'absolute',x:360,y:250,width:360,height:100,fontSize:48,color:'#00ff00',boxDimension:'fixedSize',horizontalAlignment:'center'}]});
 const created=await call('sceneSpec'); await call('eh_getSceneObject',{guid:created.objects.find(o=>o.id===id).guid});
 await call('sceneOps',{ops:[{op:'modify',id,content:'读回通过',positionMode:'relative',dx:20,dy:10,visible:true}]});
 await call('sceneOps',{ops:[{op:'add',type:'Image',id:imageId,groupId:'2D 前景 (1)',textureKey:'边框-155',positionMode:'absolute',x:360,y:640,width:180,height:320,color:'#ff0000',alpha:0.6}]});
 await call('eh_saveScreenshot',{path:path.join(out,'scene.png'),scale:0.5});
 await call('playHumanActions');
 await call('eh_getConsoleLogs',{startLine:1,count:5});
 await call('playLifecycle',{action:'start'});
 playing=true;
 await call('playStep',{actions:[{commandType:'wait',waitAfterMs:500}]});
 await call('playScreenshot');
 try{await call('playStateFields');}catch{}
 await call('playLifecycle',{action:'finish'});
 playing=false;
}catch(e){console.log(String(e));process.exitCode=1;}
finally{
 if(playing)try{await call('playLifecycle',{action:'finish'});}catch(e){console.log('停止试玩失败',String(e));}
 try{const s=await call('sceneSpec');for(const o of s.objects.filter(o=>[id,imageId].includes(o.id)))await call('eh_deleteSceneObject',{guid:o.guid});}catch(e){console.log('清理失败',String(e));}
 await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(results,null,2));
 await client.close();
}
