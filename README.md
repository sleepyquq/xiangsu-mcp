# 像塑 MCP

[中文](README.md) | [English](README.en.md)

让 AI Agent 通过 MCP 操作抖音像塑：编辑场景、开发脚本、编译、预览、保存，以及调用官方图片、音频和工作流能力。

> **建议优先使用官方 MCP。** 像塑已提供官方 MCP，请先使用编辑器提供的安装提示词配置官方接入，后续跟随像塑更新。[像塑官网](https://effect.douyin.com/) · [官方更新日志](https://bytedance.larkoffice.com/docx/RscSdNN59owmcaxXtk1cEGhun2c)
>
> 如果官方 MCP 接入出现问题或你的客户端需要 **stdio 接入**，或需要本项目保留的试玩状态读取、音频检测输入模拟和旧工具接口，再考虑使用本项目。这是独立社区项目，后续以低频适配和必要修复为主。

**当前版本：0.3.0。** 历史版本见 [Releases](https://github.com/sleepyquq/xiangsu-mcp/releases)；使用历史版本时，请同时阅读该版本自带的 README。

[版本对应](#版本对应与兼容规则) · [功能](#功能与验证范围) · [安装](#安装本项目) · [使用](#让-agent-开始工作) · [常见问题](#常见问题)

## 版本对应与兼容规则

**从 0.3.0 起，每个 MCP 版本以本次实际验证的像塑版本为下限，只覆盖该版本及更新版本，不支持更旧版本。**

- **等于验证基线**：允许使用，已实测范围见下表和验证记录。
- **高于验证基线**：允许使用并提示未实测；不保证未来像塑更新不会改变接口。
- **低于验证基线**：校验拒绝。请升级像塑，或从 [历史 Releases](https://github.com/sleepyquq/xiangsu-mcp/releases) 选择适配旧像塑的 MCP。

例如，MCP 0.3.0 允许像塑 **9.7.2 及以后版本**；9.7.1、9.6.x、9.5.x 不能通过本版校验。

| MCP 版本 | 对应的实际验证版本 | 版本校验范围 | 验证重点 |
| --- | --- | --- | --- |
| **0.3.0** | **9.7.2.918909817** | **9.7.2 及以后**；更高版本标记为未实测 | 场景编辑、脚本挂载与编译、真实预览、保存，图片和短音频生成并导入；[更新记录](docs/RESTART.md) |
| [0.2.2](https://github.com/sleepyquq/xiangsu-mcp/releases/tag/v0.2.2) | **9.5.2.887097048** | 历史规则：9.4.0 及以后允许安装 | 会话绑定、文字布局与批次预检、截图、编译、录制；[验证记录](docs/VERIFY-9.5.2-ISSUE-3.md) |
| [0.2.1](https://github.com/sleepyquq/xiangsu-mcp/releases/tag/v0.2.1) | **9.4.1.872531341**；保留 9.4.0 的历史验证 | 历史规则：9.4.0 及以后允许安装 | 场景、脚本、资源绑定、试玩状态、音频模拟与动作；[验证记录](docs/AUDIT-9.4.1.md) |
| [0.2.0](https://github.com/sleepyquq/xiangsu-mcp/releases/tag/v0.2.0) | **9.4.0.866073534** | 仅接受当时审计过的 9.4.0 安装包 | 场景、脚本、预览、交互和运行库恢复；[验证记录](docs/UPGRADE-0.2.md) |

历史发布版保留发布时的校验规则，不追溯改写。**允许安装不等于完成实测**；旧版的成功记录也不自动成为新版全部功能的验证结果。

## 功能与验证范围

| 功能 | 可用内容与实测状态 |
| --- | --- |
| 场景与脚本 | 编辑对象、管理资源、开发脚本。9.7.2 已验证对象编辑、脚本挂载、编译及日志 |
| 预览与保存 | 切换预览输入、截图、交互和保存工程。9.7.2 已验证真实预览、启动日志和保存 |
| 图片与音频 | 单项或批量生成素材并导入。9.7.2 已真实生成并导入 1 张图、1 段短音频 |
| AI 工作流 | 编辑工作流、生成并下载结果。已实测能力查询；完整编辑与生成流程尚未实机验证 |
| H5 脚本动画 | 导入脚本动画、查询状态和渲染参数。已实测参数读取及产物发布；完整导入和云端视频尚未端到端验证 |
| 试玩与音频输入模拟 | 读取运行状态、模拟动作和音频检测输入。9.4.0／9.4.1 有核心实测；9.7.2 尚未重跑整套试玩回归 |
| 本地辅助工具 | 工程文件读写、图片裁剪压缩、静态 SVG 转 PNG、TypeScript 符号查询 |

当前 **37 项自动测试通过**，实机验证范围见[更新记录](docs/RESTART.md)。

使用时还需注意：

- 图片、音频和工作流功能需要像塑官方 MCP 服务可用；云端生成使用像塑登录状态和账号额度，只按用户授权提交。
- 国际版 TikTok Effect House、macOS、复杂材质／物理／预制件和全部原生命令组合尚未验证。多步操作可能部分完成，失败或超时后先读回，不自动重放写入。

## 安装本项目

以下步骤适用于 0.3.0。

### 让 Agent 安装

把工程总目录改为自己的路径，再复制下面的提示词：

```text
请安装并配置本仓库的 Xiangsu MCP：https://github.com/sleepyquq/xiangsu-mcp

先读 README.md 和 docs/SKILL-ADAPTER.md，核对取得的源码版本与像塑版本。复用本机已有仓库，或克隆到合适的工具目录；检查 Windows、PowerShell 7、Git、Node.js 24，安装依赖并运行 npm test。

设置 XIANGSU_EFFECT_WORKSPACE 后运行 node scripts/install.mjs；像塑不在默认位置时设置 XIANGSU_EDITOR_ROOT。遵守所选 MCP 版本的最低像塑版本限制，更高但未实测版本可继续，低于下限时不要绕过校验。

保留客户端已有配置，添加 xiangsu-editor stdio 服务，使用 node 和 src/server.mjs 的绝对路径。安装插件后如需重开工程，先告诉我保存工作，不要擅自重启。重新连接 MCP 后，核对测试工程并只读确认连接；不要自动修改工程或提交付费生成。

我的特效工程总目录：D:/Effects（请替换）
```

### 1. 准备环境与源码

- Windows、像塑 **9.7.2 或更高版本**，先确认可以正常打开工程。
- Node.js **24**、PowerShell **7**（`pwsh.exe`）、Git，以及支持本地 stdio MCP 的客户端。
- 独立的特效工程总目录，例如 `D:/Effects`；不要把源码目录当作特效工程目录。

在 PowerShell 7 中执行；已有源码则复用，历史版本按对应 tag 和 README 安装：

```powershell
git clone https://github.com/sleepyquq/xiangsu-mcp.git
cd xiangsu-mcp
npm ci --ignore-scripts
npm test
```

### 2. 安装像塑用户插件

```powershell
$env:XIANGSU_EFFECT_WORKSPACE = 'D:/Effects'
# 仅在像塑不在默认安装位置时设置：
# $env:XIANGSU_EDITOR_ROOT = 'D:/Apps/Douyin AR'
node scripts/install.mjs
```

安装器生成本机配置并安装 `CodexXiangsuMCP@0.3.0`。配置备份位于 `.local/install-backups/`。

**先保存工作，再关闭并重新打开工程窗口**，让插件生效。安装后不要移动源码仓库目录。

### 3. 注册 MCP 客户端

在支持 `mcpServers` JSON 的客户端中添加以下配置；使用仓库的实际绝对路径，合并而非覆盖已有服务：

```json
{
  "mcpServers": {
    "xiangsu-editor": {
      "command": "node",
      "args": ["D:/Tools/xiangsu-mcp/src/server.mjs"]
    }
  }
}
```

客户端找不到 `node` 时，用 `Get-Command node` 查询并填写 `node.exe` 的绝对路径。生成任务耗时较长，客户端支持时将工具超时设为 **300 秒**，然后重连 MCP。

### 4. 确认连接

打开允许目录内的测试工程，让 Agent 按[适配说明](docs/SKILL-ADAPTER.md)核对工程路径，并读取当前场景。能正确读回场景，才说明已经连通编辑器。

## 让 Agent 开始工作

可以直接说：

> 使用 xiangsu-editor MCP，先读取适配说明，核对我打开的工程并读回场景。确认路径后再按我的要求修改。

工具参数、文件操作和 H5 制作流程由 Agent 按[适配说明](docs/SKILL-ADAPTER.md)执行，无需手动拼写工具调用。

## 常见问题

| 情况 | 处理方式 |
| --- | --- |
| `EDITOR_VERSION_TOO_OLD` | 0.3.0 要求像塑 9.7.2 起；升级像塑或选择历史 MCP，不绕过校验 |
| `XIANGSU_COMPATIBILITY_UNVERIFIED` | 高于本版验证基线，允许使用；在测试副本检查实际需要的功能 |
| `OFFICIAL_MCP_UNAVAILABLE` | 启动像塑并确认官方 MCP 服务可用、地址正确；原有本地编辑工具仍可使用 |
| 查不到原插件会话／`BRIDGE_UPDATE_REQUIRED` | 确认插件安装到当前像塑版本；保存工作、重跑安装器并重开工程 |
| 工程路径被拒绝 | 检查 `config.local.json` 的 `effectWorkspace`／`allowedRoots`，不要为通过校验随意扩大范围 |
| 工具列表仍是旧的 | 重连该 MCP 服务或重新加载客户端；仅新开对话可能不会重启服务进程 |
| 文字设置尺寸被拒绝 | `dynamic` 随内容伸缩，不能显式给宽高；需要固定尺寸时使用 `fixedSize`，只固定宽度用 `fixedWidth` |
| 试玩无法开始 | 需要已挂载且能够运行的 Game2D 入口；依赖与临时代码恢复规则见适配说明 |
| 写入或生成超时／取消 | 操作可能已开始，先查状态或读回实际结果，不自动重复提交 |

更新像塑后，按实际版本重新运行安装器并在保存工作后重开工程；超出已测基线时只验证所需能力。停用时删除客户端的 `xiangsu-editor` 配置，并仅移除插件配置中的 `CodexXiangsuMCP` 条目，保留其他插件与回退备份。

## 测试与贡献

运行 `npm test` 验证协议、参数、路径边界、覆盖保护、转发、试玩隔离和恢复逻辑，不需要启动像塑。

真实回归只操作已确认可丢弃的测试副本。现有脚本会写入测试源码与素材并修改内存场景，不保存主场景：

```powershell
node scripts/blank-setup.mjs 'D:/Effects/DisposableBlankTest'
node scripts/blank-check.mjs 'D:/Effects/DisposableBlankTest'
node scripts/blank-play.mjs 'D:/Effects/DisposableBlankTest'
```

先在像塑打开该副本并核对会话。结束后关闭窗口并选择不保存；磁盘上的测试文件仍保留。请勿将正式工程用于这些脚本。

欢迎提交包含像塑版本、MCP 版本、客户端、复现步骤和脱敏日志的 [Issue](https://github.com/sleepyquq/xiangsu-mcp/issues)。修改接口或适配行为时，请区分自动测试与实际编辑器验证。

## 项目来源

这是非官方社区项目，不属于字节跳动、抖音或 TikTok。仓库包含独立编写的桥接、适配器、测试及用于互操作的接口元数据；不分发像塑可执行文件、官方运行库或素材包。所需官方资料与受管脚本从用户本机安装目录读取，第三方内容的权利归原权利人。

## 许可证

本项目自有代码采用 [MIT 许可证](LICENSE)，第三方内容遵循其原有许可。
