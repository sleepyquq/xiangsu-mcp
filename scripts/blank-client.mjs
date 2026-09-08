import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// 必须显式指定已经确认可丢弃的空项目；不会保存编辑器场景。
if(!process.argv[2])throw Error('用法：node scripts/blank-{setup|play}.mjs <空白测试工程绝对路径>');
export const projectPath=path.resolve(process.argv[2]).replaceAll('\\','/');
export const client=new Client({name:'blank94-regression',version:'0.2.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.mjs',import.meta.url))],stderr:'pipe'}));
const sessions=await client.callTool({name:'xiangsu_sessions',arguments:{}},undefined,{timeout:190000});
const match=JSON.parse(sessions.content[0].text).filter(s=>s.projectPath.replaceAll('\\','/').toLowerCase()===projectPath.toLowerCase());
if(match.length!==1){await client.close();throw Error('测试会话不唯一或未就绪');}
export const sessionId=match[0].sessionId;
export const evidence=path.join(projectPath,'.codex/artifacts/blank94');await fs.mkdir(evidence,{recursive:true});
export async function call(name,params={}){
 console.log('CALL',name,params.action??'');
 const r=await client.callTool({name,arguments:{projectPath,sessionId,params,timeoutMs:180000}},undefined,{timeout:600000});
 const v=JSON.parse(r.content.find(c=>c.type==='text').text);
 await fs.writeFile(path.join(evidence,Date.now()+'-'+name+'.json'),JSON.stringify(r,null,2));
 console.log(name,r.isError?'FAIL':'OK');if(r.isError)throw Error(JSON.stringify(v));return v;
}
export async function write(name,text){let old;try{old=await fs.readFile(path.join(projectPath,name));}catch{}; const {createHash}=await import('node:crypto');return call('project_write_file',{path:name,text,...(old?{expectedSha256:createHash('sha256').update(old).digest('hex')}: {})});}
