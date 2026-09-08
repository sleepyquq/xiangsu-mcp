import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
export const version='0.2.0';
export const protocolVersion=2;
export const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export async function detectEditor(installRoot=path.join(process.env.LOCALAPPDATA,'Douyin AR')){
 const executable=path.join(installRoot,'Douyin AR.exe');
 const {stdout}=await promisify(execFile)('pwsh.exe',['-NoProfile','-NonInteractive','-Command','(Get-Item -LiteralPath $env:XIANGSU_VERSION_EXE).VersionInfo.FileVersion'],{env:{...process.env,XIANGSU_VERSION_EXE:executable},windowsHide:true});
 const fileVersion=stdout.trim(),match=fileVersion.match(/^(\d+\.\d+\.\d+)(?:\.|$)/);
 if(!match)throw Error('EDITOR_VERSION_UNKNOWN: '+fileVersion);
 return {version:match[1],fileVersion,installRoot,executable};
}
export async function expectedBridge(commands){
 return {protocolVersion,runtimeHash:sha256(await fs.readFile(new URL('../editor-plugin/runtime.cjs',import.meta.url))),catalogHash:sha256(JSON.stringify(commands))};
}
