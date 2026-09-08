# Xiangsu MCP · 像塑编辑器 MCP

让 AI Agent 通过 Model Context Protocol（MCP）操作抖音像塑：编辑场景、绑定素材、初始化 TypeScript 脚本、编译、截图和验证交互。

**Xiangsu MCP is an independent MCP server for the Douyin Xiangsu AR effect editor.** It exposes scene editing, asset binding, TypeScript scripting, compilation, preview screenshots and interactive playtesting to MCP clients. **Verified target: Windows + Xiangsu 9.4.0. International TikTok Effect House compatibility is not verified.**

- 项目版本：0.2.0，使用 Node.js 和 stdio MCP，编辑器侧通过用户插件桥接。
- 当前提供 105 个工具入口；入口数量包含兼容入口和明确未接入的云端入口，**不代表 105 项均已实测**。
- 独立社区项目，非字节跳动、抖音或 TikTok 官方产品。不宣称完整替代官方 Agent / Ask AI。
- [安装](#安装) · [功能与验证状态](#功能与验证状态) · [AI 使用指引](#ai-使用指引) · [English quick start](#english-quick-start)

## 功能与验证状态

“已实测”指在像塑 9.4.0 的测试副本中完成相应操作并读回、编译或检查真实预览；不表示该工具的全部参数组合均已覆盖。详细证据范围见 [9.4 验证记录](docs/UPGRADE-0.2.md)。

| 能力 | 当前实现 | 验证情况 |
|---|---|---|
| 会话与工程发现 | 查询已打开工程，按 projectPath / sessionId 绑定操作 | 已验证；同工程多窗口需指定会话 |
| 场景读写 | sceneSpec 实时场景读取；sceneOps 平铺 DSL，创建、修改、显隐与读回 | 文字、图片、布局、颜色、对齐、贴图等已实测；复杂父级变换待验证 |
| 脚本开发 | setupGameScript 初始化、依赖同步、序列化资源字段绑定 | 挂载、编译失败与修复、Texture / Material 绑定已实测 |
| 编译与日志 | 官方编译器、日志分页、错误返回 | 已实测；失败不会伪装成成功 |
| 试玩与状态 | playLifecycle / playStep / playState 等，开始、暂停、重启、结束 | Game2D 就绪、真实运行帧、重启隔离、结束恢复已实测 |
| 预览与录像 | 截图、触摸、动作切换、MP4 录制 | 截图、触摸、张嘴/握拳/挥手、非空 MP4 已实测；拖拽等未逐项验证 |
| 音频输入模拟 | 模拟音高、音量、关键词检测结果，确认接收并清空 | 已实测；这是检测输入模拟，**不生成声音** |
| 工程文件 | 限定路径读写、SHA256 覆盖保护、备份 | 自动化测试覆盖；不允许直接覆盖主场景文件 |
| 本地素材处理 | 图片裁剪、压缩、静态 SVG 转 PNG | 有本地测试覆盖；完整生成素材到最终预览链路待验证 |
| 代码查询 | 基于 TypeScript 的本地符号查询 | 有本地测试覆盖；不是官方私有 CKG 引擎 |
| 原生命令映射 | 71 个 eh_* 本地命令入口 | 尚未逐项实测；预制件、包导入、复杂材质、物理和快照等仍需专项回归 |
| 官方资料读取 | 从本机安装目录提供 Skill、API 和资源说明 | 按需通过 MCP resources 读取，不附带官方文档包 |
| 官方云端生成 | 7 个图片/音频生成及等待任务入口 | **未接入**，返回 OFFICIAL_CLOUD_BACKEND_NOT_ADAPTED |

### 尚未支持或不能保证的内容

- 国际版 Effect House、macOS、其他像塑版本以及国内外工程互通，均未验证。
- 不支持官方设计稿自动布局补全、完整 HUD 归一化、SVG 动画时间线。
- 多步操作不是原子事务；部分失败需读回确认，不能盲目重试写入。
- 试玩依赖已挂载且能启动的 Game2D 入口；运行库结构不匹配会拒绝插入临时代码。
- 试玩期间用户改动运行库时，会保留冲突和备份；不会强行覆盖用户修改。
- 自动提取 Schema 尚不能完整表达所有 Zod refine / transform，最终仍由编辑器校验。
- 使用内部编辑器接口。官方更新后需检查兼容性；安装器限制已审计版本与源包哈希，不保证自动兼容新版本。

## 安装

### 推荐：把下面的提示词发给 Agent

将最后一行的路径改为自己的特效工程目录，复制到有本机终端权限的 AI Agent：

```text
请帮我安装并配置 Xiangsu MCP：https://github.com/sleepyquq/xiangsu-mcp

先阅读仓库 README.md 和 docs/SKILL-ADAPTER.md，检查 Windows、PowerShell 7、Git、Node.js 和像塑版本。将仓库克隆到合适的工具目录（已有仓库则复用），安装依赖并运行测试；设置 XIANGSU_EFFECT_WORKSPACE 后运行插件安装脚本。自定义像塑安装位置时设置 XIANGSU_EDITOR_ROOT。

根据我正在使用的 MCP 客户端配置 stdio 服务，保留已有配置，使用 node 和 src/server.mjs 的绝对路径。不要绕过版本/哈希检查，不要关闭有未保存工作的编辑器。如果需要我保存工作并重新打开工程，明确告诉我。

安装后重新连接 MCP，调用 xiangsu_sessions 核对工程路径、xiangsu_capabilities 查看能力、eh_getScene 验证真实连通；不要修改工程。若缺少客户端配置权限或工程窗口尚未打开，说明准确的剩余步骤，不要声称安装验证成功。

我的特效工程总目录：D:/Effects（请替换为实际路径）
```

以下是手动安装步骤，Agent 也可以据此执行。

### 1. 准备环境

- Windows，安装 **像塑桌面版 9.4.0**，先确认能够正常打开工程。
- Node.js：本项目验证环境为 **24.14.1**；建议使用 Node.js 24。
- PowerShell 7（`pwsh.exe`）、Git，以及支持本地 stdio MCP 的客户端。
- 一个独立特效工程目录，例如 `D:/Effects`。源码仓库目录与特效工程目录是两回事。

像塑可从 [官方网站](https://effect.douyin.com/) 获取。官网可能只提供更新版本；如果当前安装包不匹配审计版本/哈希，请等待适配，不要绕过安装检查。

### 2. 克隆并安装依赖

在 PowerShell 7 中执行：

```powershell
git clone https://github.com/sleepyquq/xiangsu-mcp.git
cd xiangsu-mcp
npm ci --ignore-scripts
npm test
```

### 3. 安装像塑用户插件

将下面的路径替换为自己的**特效工程总目录**：

```powershell
$env:XIANGSU_EFFECT_WORKSPACE = 'D:/Effects'
# 仅在像塑不在默认安装位置时设置：
# $env:XIANGSU_EDITOR_ROOT = 'D:/Apps/Douyin AR'
node scripts/install.mjs
```

安装器会核对像塑版本及 `agent-server.exe` 哈希，生成忽略跟踪的 `config.local.json`、`commands.runtime.json`，安装用户插件 `CodexXiangsuMCP@0.2.0`。原配置备份位于 `.local/install-backups/`。不修改像塑官方二进制。

安装完成后，**先保存已有工作，再关闭并重新打开像塑工程窗口**，让插件加载。不要直接重启有未保存编辑的窗口。保持源码仓库路径不变，用户插件会引用该目录。

首次安装不需要重新提取命令清单。`scripts/extract-catalog.mjs` 用于维护者审计新版安装包，默认生成 `.local/catalog.candidate.json`；生成候选并不等于新版已兼容。

### 4. 配置 MCP 客户端

在客户端的 MCP 配置中添加一个 stdio 服务。下方为常见的 `mcpServers` JSON 格式；替换成仓库实际绝对路径，客户端若提供图形配置则填写相同 command / args：

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

如果客户端找不到 `node`，用 `Get-Command node` 查询路径，并将 `command` 替换为 `node.exe` 的绝对路径。服务使用 stdio，由客户端启动，不需要额外开放 HTTP 端口。配置后重新连接该 MCP 服务。

### 5. 确认安装生效

1. 在像塑中打开位于允许目录下的测试工程。
2. 让 AI 调用 `xiangsu_sessions`，确认返回的 `projectPath` 正是该工程。
3. 调用 `xiangsu_capabilities` 查看当前工具与文档入口。
4. 调用 `eh_getScene` 读取场景；成功读回才表明客户端与编辑器桥接正常。

可以直接对 AI 说：

> 使用 xiangsu-editor MCP，先列出会话并核对我的测试工程路径，读取适配说明，再读取当前场景。先不要修改工程。

### 常见问题与升级

| 情况 | 处理方式 |
|---|---|
| EDITOR_VERSION_NOT_AUDITED | 当前版本不在已审计范围，需完成版本适配 |
| CATALOG_SOURCE_MISMATCH | 即使版本号相同，源包也可能不同；需重新审计，不能只改哈希绕过 |
| 查不到会话 | 确认用户插件已加载，并已重新打开实际工程窗口 |
| 工程路径被拒绝 | 检查 config.local.json 的 effectWorkspace / allowedRoots，确认真实工程位于允许范围 |
| 客户端工具列表还是旧的 | 重启/重新连接 MCP 服务；新开对话不一定重启底层进程 |
| 更新了编辑器插件 | 保存工作、运行安装器、重新打开工程，再重连 MCP |
| 命令超时 | 已开始的操作可能仍执行；先读回状态再决定恢复或重试 |

停用时，从客户端删除该 MCP 配置；如需停用编辑器插件，只移除用户插件配置中的 `CodexXiangsuMCP` 条目，保存工作后重新打开像塑。保留其他插件条目。

## AI 使用指引

先读 [SKILL-ADAPTER.md](docs/SKILL-ADAPTER.md)，运行时也可读取 `xiangsu-doc://adapter/SKILL-ADAPTER.md`。随后通过 `resources/list` / `resources/read` 按需读取本机官方资料。

1. 用 `xiangsu_sessions` 确认工程；不要根据源码仓库位置猜测特效工程路径。
2. 以客户端当前暴露的 inputSchema 为准，先查询对象再使用真实 GUID 和组件字段。
3. 工程操作采用统一外层参数，例如：

```json
{
  "projectPath": "D:/Effects/MyTestEffect",
  "params": {}
}
```

这是 `eh_getScene` 的参数示例；必要时增加 `sessionId` 和 `timeoutMs`。查询辅助工具不需要这个外层。

4. 修改后进行读回、编译和预览验证。“工具存在”“请求成功”不能代替“效果生效”。
5. `project_write_file` 覆盖现有文件需要先读取得到的 SHA256。备份只覆盖磁盘状态，不代替未保存编辑的撤销记录。

## 测试与贡献

```powershell
npm test
```

自动化测试覆盖 MCP stdio、参数/路径边界、覆盖保护、场景读回、截图、试玩状态隔离、音频确认及临时运行库恢复。它们不需要打开像塑，**不能代替真实编辑器测试**。

真实回归只能针对已确认可丢弃的空白测试副本：

```powershell
node scripts/blank-setup.mjs 'D:/Effects/DisposableBlankTest'
node scripts/blank-play.mjs 'D:/Effects/DisposableBlankTest'
```

先在像塑打开该空项目并核对会话。脚本会创建测试源码、素材和证据，会修改编辑器内存场景，但不保存场景；验证完关闭窗口并选择不保存。测试文件仍保留在副本中。历史 `live-*` / `script-test.mjs` 使用特定测试目录，不适合作为新用户的一键测试入口。

欢迎提交带编辑器版本、复现步骤、脱敏错误日志和预期/实际结果的 Issue。优先方向：新版本适配、更多真实回归、安装体验、国际版兼容性验证。

## English quick start

1. Install Windows, Xiangsu **9.4.0**, PowerShell 7, Git and Node.js 24.
2. Clone this repository and run `npm ci --ignore-scripts`, then `npm test`.
3. Set `XIANGSU_EFFECT_WORKSPACE` to your effect projects directory and run `node scripts/install.mjs`. Set `XIANGSU_EDITOR_ROOT` only for a custom editor installation.
4. Save your work and reopen the editor project to load the user plugin.
5. Configure a stdio MCP server: command `node`, args containing the absolute path to `src/server.mjs`.
6. Reconnect MCP, call `xiangsu_sessions`, verify the project path, then call `eh_getScene`.

Cloud image/audio generation is **not connected**. Advanced materials, physics, prefabs and some editor commands still need live testing. TikTok Effect House, macOS and cross-product project portability are **unverified**. Read the [adapter guide](docs/SKILL-ADAPTER.md) before making edits.

## 项目来源与相关名称

本仓库包含独立编写的桥接、适配器、测试，以及用于接口互操作的提取命令元数据 `catalog.generated.json`；不包含像塑可执行文件、官方运行库或官方素材包。所需官方资料和运行库从用户自己的安装目录按需读取。第三方内容的权利归原权利人；MCP SDK 的许可证不自动覆盖本项目或官方内容。

相关检索词：像塑 MCP、抖音特效 MCP、Xiangsu MCP、Douyin AR、Model Context Protocol、AI Agent、AR effect editor automation、TypeScript、Effect House。**Effect House 是兼容性研究方向，不是当前支持承诺。**
