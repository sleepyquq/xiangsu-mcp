import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {checkedPath}=require('../editor-plugin/runtime.cjs');
export {checkedPath};
export const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
export async function walk(root){
 const all=[];
 async function visit(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())continue;const p=path.join(dir,e.name);if(e.isDirectory())await visit(p);else all.push(p);}}
 await visit(root);return all;
}
export async function writeAtomic(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.mcp-'+crypto.randomUUID();await fs.writeFile(tmp,data);await fs.rename(tmp,file);}
export async function readProject(projectPath,relative){
 const file=checkedPath(relative,projectPath);const stat=await fs.stat(file);if(stat.size>2*1024*1024)throw Error('文件过大，请用本地文件工具分段读取');
 const bytes=await fs.readFile(file);return {path:relative,sha256:hash(bytes),text:bytes.toString('utf8')};
}
export async function writeProject(ctx,p){
 if(!/^(Assets\/.+\.(ts|json|md|svg)|\.agent\/asset-processing\/.+\.svg|\.codex\/notes\.md|\.codex\/artifacts\/.+\.(md|json|svg))$/.test(p.path.replaceAll('\\','/')))throw Error('文件写入仅支持 Assets 脚本/设计文档和 .codex 记录/产物；场景主文件请用编辑器命令');
 const file=checkedPath(p.path,ctx.projectPath,true);
 let exists=true,before;try{before=await fs.readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;exists=false;}
 if(exists && (!p.expectedSha256||hash(before)!==p.expectedSha256))throw Error('文件已经存在，必须提供读回的 expectedSha256，防止覆盖并发修改');
 if(!exists && p.expectedSha256)throw Error('待修改文件已不存在');
 await ctx.prepare();await writeAtomic(file,p.text);return {path:p.path,sha256:hash(p.text),created:!exists};
}
