// 使用真正的 MCP stdio 客户端调用，供回归与排错使用。
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
const client=new Client({name:'xiangsu-local-client',version:'0.1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.mjs',import.meta.url))],stderr:'pipe'});
await client.connect(transport);
try{
 const name=process.argv[2]??'xiangsu_sessions';
 const args=process.argv[3]?JSON.parse(await fs.readFile(process.argv[3],'utf8')):{};
 const result=await client.callTool({name,arguments:args},undefined,{timeout:180000});
 if(process.argv[4])await fs.writeFile(process.argv[4],JSON.stringify(result,null,2));
 for(const c of result.content??[])if(c.type==='text')console.log(c.text);else console.log(`[${c.type}]`);
 if(result.isError)process.exitCode=1;
}finally{await client.close();}
