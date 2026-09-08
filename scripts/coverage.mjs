import {effectWorkspace} from '../src/paths.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {commands,extracted} from '../src/catalog.mjs';
import {cloudTools,localAdapterNames} from '../src/adapters.mjs';
const root=effectWorkspace();
const investigation=path.join(root,'Agent_cowork/像塑Agent接口调查');
const verified=new Set();
for(const folder of ['mcp-live-test','mcp-script-test']){
 const current=path.join(investigation,'test-stable/.codex/artifacts',folder,'summary.json');
 const legacy=path.join(investigation,'test-stable/Agent_cowork',folder,'summary.json');
 const rows=JSON.parse(await fs.readFile(await fs.access(current).then(()=>current,()=>legacy),'utf8'));
 for(const row of rows)if(row.success){if(row.name.startsWith('eh_'))verified.add(row.name.slice(3));if(row.name==='compileProject')verified.add('runOtscCheck');if(row.name==='userScript')verified.add('attachUserScript');}
}
const lines=['# MCP 覆盖与验证报告','','日期：2026-09-07。版本：0.1.0；本机像塑 9.3.2。','','## 交付结论','','已实现并注册本地 MCP：64 个编辑器命令映射、23 个上层工具入口、4 个辅助工具，共 91 项。**这是本地接口适配版本，不是已经完整等价替代官方 Agent。**7 个官方云端工具未接通，上层编排还存在 README 中列出的差异。','',`本轮真实 MCP 客户端成功覆盖 ${verified.size} 个不同的底层命令；其余仍需逐项工程回归。先前非 MCP 桥接验证另列，不混算。`,'','新脚本初始化/挂载→编译成功→注入类型错误→正确报失败→恢复→再次编译成功，闭环通过。测试对象和分组已删除；测试副本保留 Game2D.ts、XiangsuMCPProbe.ts 及编译生成的配套文件，供后续回归。正式原工程未改。','','## 本地命令清单','','| 命令 | 参数 | 验证状态 |','|---|---|---|'];
for(const c of commands)lines.push(`| eh_${c.name} | ${c.parameterOrder.join(', ')||'无'} | ${verified.has(c.name)?'真实 MCP 通过':c.runtimeVerified?'此前桥接通过，MCP 待逐项回归':'仅映射，未运行验证'} |`);
lines.push('','## 上层入口','','| 工具 | 状态 |','|---|---|');
for(const t of extracted.topTools)lines.push(`| ${t.name} | ${cloudTools.has(t.name)?'未接入官方云端；明确返回错误':t.name==='effect_house_toolbox'?'路由已实现':localAdapterNames.has(t.name)?'本地实现；语义差异见 README':'未实现'} |`);
lines.push('','## 尚未验证的重要功能','','- 对象/分组复制、重排；组件创建与删除。','- 资源与包导入、预制件实例化、内置资源创建和属性修改。','- OMTL/AUSL 材质创建、编译与修复。','- 声音/触摸/拖拽等交互、视频录制。','- 工程快照创建/恢复；快照路径限制可能需要根据官方实际返回继续适配。','- 新增 Game2D 玩法的运行时行为（本轮验证脚本挂载、编译与错误修复，未开发完整玩法）。','','## 自动检查','','npm test 三组检查通过：MCP 握手/工具列表/调用/图像/错误；超时、路径边界与覆盖保护；本地图像裁剪及 TypeScript 符号查询。','参数固定顺序、可选参数占位、默认值处理已加入；官方上层 refine/transform 并非全部无损翻译，生成目录中的 unknownSchemaConstructs 保留此限制。','','## 安装状态与回退','','Codex MCP 名称：xiangsu-editor，stdio，已启用。像塑用户插件：CodexXiangsuMCP@0.1.0。新窗口自动发现，不再绑定固定 PID。','当前会话工具表可能尚未重新加载；本报告的真实测试使用独立 MCP 客户端。','回退：codex mcp remove xiangsu-editor；像塑配置仅移除同名插件条目。配置备份见 mcp-install-backups。','实现入口：../../.agents/tools/xiangsu-mcp/README.md。');
const reportDir=fileURLToPath(new URL('../.local/reports/',import.meta.url));
await fs.mkdir(reportDir,{recursive:true});
await fs.writeFile(path.join(reportDir,'MCP覆盖报告.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({mapped:commands.length,mcpVerified:verified.size,topTools:extracted.topTools.length,cloudNotAdapted:cloudTools.size}));
