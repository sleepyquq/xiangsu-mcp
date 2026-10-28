import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {checkedPath,writeAtomic} from './files.mjs';

const maxBytes=128*1024*1024;
export async function preparePlayMaterial(p,c){
 let bytes,extension;
 if(p.sourcePath){
  const source=checkedPath(p.sourcePath,c.projectPath);extension=path.extname(source).toLowerCase();
  if((await fs.stat(source)).size>maxBytes)throw Error('PLAY_MATERIAL_TOO_LARGE: 最大 128 MiB');
  bytes=await fs.readFile(source);
 }else{
  let url=new URL(p.url);extension=path.extname(url.pathname).toLowerCase();
  if(url.protocol!=='https:'||!['.mp4','.mov'].includes(extension))throw Error('PLAY_MATERIAL_URL_INVALID: 需要 HTTPS MP4/MOV 地址');
  const signal=AbortSignal.timeout(60000);let response;
  // 在发送下一跳前检查协议，避免 HTTPS 地址将下载重定向到 HTTP。
  for(let redirects=0;redirects<=5;redirects++){
   response=await fetch(url,{signal,redirect:'manual'});
   if(![301,302,303,307,308].includes(response.status))break;
   await response.body?.cancel();
   const location=response.headers.get('location');if(!location||redirects===5)throw Error('PLAY_MATERIAL_REDIRECT_INVALID');
   url=new URL(location,url);if(url.protocol!=='https:')throw Error('PLAY_MATERIAL_URL_INVALID: 重定向必须使用 HTTPS');
  }
  if(!response.ok)throw Error('PLAY_MATERIAL_DOWNLOAD_FAILED: HTTP '+response.status);
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{
   while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>maxBytes)throw Error('PLAY_MATERIAL_TOO_LARGE: 最大 128 MiB');chunks.push(value);}
  }finally{await reader.cancel();}
  bytes=Buffer.concat(chunks);
 }
 if(!['.mp4','.mov'].includes(extension)||bytes.length<12||bytes.toString('ascii',4,8)!=='ftyp')throw Error('PLAY_MATERIAL_INVALID: 需要带 ftyp 文件头的 MP4/MOV');
 // 可选校验值是下载/复制完整性约定，不把未校验素材当作校验成功。
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 if(p.sha256&&sha256!==p.sha256.toLowerCase())throw Error('PLAY_MATERIAL_CHECKSUM_MISMATCH');
 const materialRef=checkedPath(`.codex/artifacts/play-material/${crypto.randomUUID()}${extension}`,c.projectPath,true);
 await c.prepare();await writeAtomic(materialRef,bytes);
 return {success:true,materialRef,sha256,bytes:bytes.length};
}
