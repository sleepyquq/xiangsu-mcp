import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
export const version='0.3.0';
// 本版本以 9.7.2 为适配下限；更旧像塑应使用历史 MCP，未来版本允许尝试。
export const minimumEditorVersion='9.7.2';
export const validationEditors=Object.freeze([minimumEditorVersion]);
export const protocolVersion=2;
export const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// 旧命令清单的历史来源，仅用于清单完整性；不决定本版准入或实测范围。
export const auditedEditors=Object.freeze({
 '9.4.0':'038a67ba2fe26192c271da8fdbca88ab9a5b8d39287205df33676dbd4137df86',
 '9.4.1':'5329a3fbf7952131625e33f61de398b87b4feaad7a196a781a3aa7f7146cb2c9',
});
export function assessEditorCompatibility(editorVersion,_legacyBinaryHash,catalogSourceHash){
 // 继续保护旧命令清单；版本准入不再依赖官方私有可执行文件的哈希白名单。
 if(catalogSourceHash!==auditedEditors['9.4.0'])throw Error('CATALOG_BASELINE_NOT_AUDITED: 命令清单基线已变化，请重新审计版本映射');
 if(typeof editorVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(editorVersion))throw Error('EDITOR_VERSION_UNKNOWN: 无法识别像塑版本 '+editorVersion);
 const parts=editorVersion.split('.').map(Number);
 if(parts.length!==3||parts.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('EDITOR_VERSION_UNKNOWN: 无法识别像塑版本 '+editorVersion);
 const floor=minimumEditorVersion.split('.').map(Number);
 const comparison=parts.reduce((result,n,i)=>result||Math.sign(n-floor[i]),0);
 if(comparison<0)throw Error(`EDITOR_VERSION_TOO_OLD: MCP ${version} 要求像塑 ${minimumEditorVersion} 或更高版本；当前为 ${editorVersion}。请升级像塑，或从 https://github.com/sleepyquq/xiangsu-mcp/releases 下载适配旧版像塑的历史 MCP。`);
 const verified=validationEditors.includes(editorVersion);
 return {verified,minimumEditorVersion,warning:verified?null:`像塑 ${editorVersion} 高于本版适配基线 ${minimumEditorVersion}，允许安装；尚未实测的功能请按实际需要验证。`};
}
export function selectEditorVersion(fileVersion,runtimeVersions=[]){
 const parse=value=>{const m=String(value).match(/^(\d+\.\d+\.\d+)(?:\.\d+)?$/);if(!m)throw Error('EDITOR_VERSION_UNKNOWN: '+value);return m[1];};
 const file=parse(fileVersion),versions=[file,...runtimeVersions.map(parse)];
 const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;};
 const version=versions.sort(compare).at(-1);
 return {version,fileVersion,versionSource:version===file?'executable':'running-editor',runtimeVersions:[...new Set(runtimeVersions)]};
}
export async function detectEditor(installRoot=path.join(process.env.LOCALAPPDATA,'Douyin AR')){
 const executable=path.join(installRoot,'Douyin AR.exe');
 // 软件热更新可能只更新 bundle.jsc，EXE 版本资源仍旧；只采纳当前同一路径进程的日志。
 // 若磁盘 EXE 更新得更晚，则选较新版本，避免给尚未退出的旧进程重复安装旧目录。
 const script=`$fileVersion=(Get-Item -LiteralPath $env:XIANGSU_VERSION_EXE).VersionInfo.FileVersion
$runtimeVersions=@(Get-CimInstance Win32_Process -Filter "Name='Douyin AR.exe'" | Where-Object { $_.ExecutablePath -eq $env:XIANGSU_VERSION_EXE } | ForEach-Object {
 if($_.CommandLine -match '--logPath=(?:"([^\"]+)"|(\\S+))'){
  $logRoot=if($Matches[1]){$Matches[1]}else{$Matches[2]}
  Get-ChildItem -LiteralPath $logRoot -Filter '*-editor.log' -ErrorAction SilentlyContinue | ForEach-Object {
   $entry=Get-Content -LiteralPath $_.FullName -TotalCount 300 | Select-String 'AppVersion: (\\d+\\.\\d+\\.\\d+\\.\\d+) BusinessCommitId:' | Select-Object -First 1
   if($entry){$entry.Matches[0].Groups[1].Value}
  }
 }
})
@{fileVersion=$fileVersion;runtimeVersions=$runtimeVersions} | ConvertTo-Json -Compress`;
 const {stdout}=await promisify(execFile)('pwsh.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,XIANGSU_VERSION_EXE:executable},windowsHide:true});
 const detected=JSON.parse(stdout);
 return {...selectEditorVersion(detected.fileVersion,detected.runtimeVersions),installRoot,executable};
}
export async function expectedBridge(commands){
 return {protocolVersion,runtimeHash:sha256(await fs.readFile(new URL('../editor-plugin/runtime.cjs',import.meta.url))),catalogHash:sha256(JSON.stringify(commands))};
}
