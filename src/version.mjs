import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
export const version='0.2.1';
export const protocolVersion=2;
export const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// 精确绑定版本与已审计官方包；9.4.1 复用结构未变的 9.4.0 命令基线。
export const auditedEditors=Object.freeze({
 '9.4.0':'038a67ba2fe26192c271da8fdbca88ab9a5b8d39287205df33676dbd4137df86',
 '9.4.1':'5329a3fbf7952131625e33f61de398b87b4feaad7a196a781a3aa7f7146cb2c9',
});
export function assertEditorCompatibility(editorVersion,binaryHash,catalogSourceHash){
 if(!Object.hasOwn(auditedEditors,editorVersion))throw Error('EDITOR_VERSION_NOT_AUDITED: '+editorVersion);
 if(binaryHash!==auditedEditors[editorVersion])throw Error('CATALOG_SOURCE_MISMATCH: 官方包与该版本审计哈希不一致，请先提取候选并审计');
 if(catalogSourceHash!==auditedEditors['9.4.0'])throw Error('CATALOG_BASELINE_NOT_AUDITED: 命令清单基线已变化，请重新审计版本映射');
}
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
