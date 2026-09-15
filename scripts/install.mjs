// 幂等安装用户插件；保留其他插件，并备份被替换的文件。
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {commands,extracted} from '../src/catalog.mjs';
import {detectEditor,version,sha256,assertEditorCompatibility} from '../src/version.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
let previous={};
try{previous=JSON.parse(await fs.readFile(path.join(root,'config.local.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const workspace=process.env.XIANGSU_EFFECT_WORKSPACE??previous.effectWorkspace??previous.allowedRoots?.[0];
if(!workspace)throw Error('首次安装请设置 XIANGSU_EFFECT_WORKSPACE 为特效工程总目录');
const local=process.env.LOCALAPPDATA;
const editor=await detectEditor(process.env.XIANGSU_EDITOR_ROOT);
assertEditorCompatibility(editor.version,sha256(await fs.readFile(path.join(editor.installRoot,'Resources/agent-server.exe'))),extracted.sha256);
const config={...previous,effectWorkspace:workspace,editorVersion:editor.version,editorFileVersion:editor.fileVersion,stateRoot:previous.stateRoot??path.join(local,'CodexXiangsuMCP/sessions'),allowedRoots:previous.allowedRoots??[workspace],catalogPath:path.join(root,'commands.runtime.json'),skillsRoot:path.join(editor.installRoot,'Resources/BuiltinResource/AgentSkills'),resourcesRoot:path.join(editor.installRoot,'Resources/BuiltinResource/AgentResources')};
const pluginParent=path.join(local,`DouyinAR/Plugins/v${editor.version}/Local`);
await fs.mkdir(pluginParent,{recursive:true});
const configPath=path.join(pluginParent,'plugins.config.json');
let old={plugins:[]};try{old=JSON.parse(await fs.readFile(configPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const backupDir=path.join(root,'.local/install-backups',String(Date.now()));
await fs.mkdir(backupDir,{recursive:true});await fs.writeFile(path.join(backupDir,'plugins.config.json'),JSON.stringify(old,null,2));
for(const file of ['config.local.json','commands.runtime.json'])try{await fs.copyFile(path.join(root,file),path.join(backupDir,file));}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile(path.join(root,'commands.runtime.json'),JSON.stringify(commands,null,2));
await fs.writeFile(path.join(root,'config.local.json'),JSON.stringify(config,null,2));
const name='CodexXiangsuMCP',dest=path.join(pluginParent,name+'@'+version);await fs.mkdir(dest,{recursive:true});
try{await fs.copyFile(path.join(dest,'index.js'),path.join(backupDir,'index.js'));}catch{}
const entry=`'use strict';\nconst {Runtime}=require(${JSON.stringify(path.join(root,'editor-plugin/runtime.cjs'))});\nconst config=require(${JSON.stringify(path.join(root,'config.local.json'))});\nmodule.exports=class { initPlugin(){if(!process.argv.includes('--projectType=project'))return;const o=globalThis.orion;this.runtime=new Runtime(config,{getProject:()=>o['@orion/orion-sdk/EditorFramework'].Project.getCurrent(),execute:r=>o['@orion/Business/Agent/EHCommand'].executeCommand(r)});this.runtime.start();} deinitPlugin(){this.runtime?.stop();} };\n`;
await fs.writeFile(path.join(dest,'index.js'),entry);
await fs.writeFile(path.join(dest,'plugin.manifest.json'),JSON.stringify({name,version,description:'本地 MCP 编辑器桥接',requirements:{orionSDK:'',apis:{}},entry:'index.js',builderVersion:1},null,2));
// 用正式桥接替换旧调查插件的启动条目，旧文件和配置备份仍保留。
old.plugins=old.plugins.filter(p=>!['CodexCockpitProbe',name].includes(p.name));old.plugins.push({name,version,loadOnStartup:true});
await fs.writeFile(configPath,JSON.stringify(old,null,2));
console.log(JSON.stringify({plugin:dest,backupDir,requiresEditorReload:true,config:path.join(root,'config.local.json')}));
