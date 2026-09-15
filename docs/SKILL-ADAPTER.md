# 官方 Skill 的本地适配与读取指引

适用：像塑 9.4.0 / 9.4.1、MCP 0.2.1；核对日期 2026-09-16。这是适配契约，不是全部能力已通过真实编辑器回归的声明。修改适配器后同步更新本文件；以已加载服务的工具 schema 和编辑器实际读回为准。历史验证不能直接继承为新版完整验证。9.4.1 的兼容范围见 [审查记录](AUDIT-9.4.1.md)，新增 `seek_to_time`、`switch_gesture_video` 尚未接入。

## 开始任务

1. 首次使用本 MCP 或适配版本变化时，先读本说明：`xiangsu-doc://adapter/SKILL-ADAPTER.md`。同一任务内不必反复加载。
2. 调用 `xiangsu_sessions`，确认目标工程绝对路径；同工程多窗口时指定 sessionId。没有就绪工程时，先通过 GUI 打开工程。读取文档本身不要求工程或官方 Agent 会话。
3. 根据下表选择官方资料，通过 MCP `resources/list` 找到对应 URI，再 `resources/read`。只读当前任务需要的章节和引用，不全量加载或复制官方 Skill。
4. 核对已加载 MCP 工具的 inputSchema；必要时调用 `xiangsu_capabilities` 查原生命令信息。读取实时对象后小步操作，完成相关字段读回、编译或预览验证。

不把官方 Skill 自动安装为我们的全局指令。官方组件、API、物理和资源说明用于技术参考；本文件负责把内置 Agent 的专用流程转换为当前可执行流程。用户已明确的目标与偏好不应被官方模板改写。

## 文档从哪里读

- `config.local.json.skillsRoot` 指向安装目录 `AgentSkills`，通过 `xiangsu-doc://skills/…` 提供。
- `config.local.json.resourcesRoot` 指向安装目录 `AgentResources`，通过 `xiangsu-doc://resources/…` 提供。
- 本机当前目录：`%LOCALAPPDATA%/Douyin AR/Resources/BuiltinResource/AgentSkills` 和同级 `AgentResources`。换机器时以配置为准；`xiangsu_capabilities.documentation` 返回当前配置路径。
- 官方 `.agent/skills/<相对路径>` 的文档引用，解析到 `skillsRoot/<相对路径>`；文档内 `./` 和 `../` 引用按源文件目录解析，且不能越出文档根。优先使用列表返回的 URI，勿猜测编码。
- 列表目前提供 md、yaml、json、ts 文本。引用 PNG 等图片时，需要按安装目录实际路径使用可用的图片查看工具；文本读取成功不等于已经看过参考图。
- MCP 客户端未提供资源读取入口时，可用本地文件工具按上述配置路径读取同一份说明，不要求用户先启动内置 Agent。官方目录缺失时报告具体缺失项，仅暂停依赖该资料的步骤，不凭记忆杜撰 API。

## 按任务选择资料

以下路径均相对 `skillsRoot`，进入对应 SKILL.md 后仅跟随任务相关的引用。

| 当前任务 | 先读 | 本地执行注意事项 |
|---|---|---|
| 已有对象的坐标、贴图、文本 | `scene-builder/SKILL.md`，涉及布局时加 `ui-layout/SKILL.md` | 不重新启动整套创作规划；注意下文 sceneOps 缺陷 |
| 新游戏、玩法设计 | `game2d-planner/SKILL.md` | 采用设计知识；草案卡片、风格选择等内置流程按下表替换 |
| 视觉特效设计 | `visual-effect-planner/SKILL.md` | 用户需求已明确时直接推进，不强制重复提问或创建 Brief |
| 物理、碰撞、用户脚本 | `effect-abilities/game2d-engine/SKILL.md`，物理任务加同目录 `物理系统.md` | 查能力 API；初始化依赖、编辑脚本、编译、验证真实交互 |
| 内置资源、材质 | `asset-manager/SKILL.md`；手写材质加 `effect-abilities/material-authoring/SKILL.md` | 查询实际可写字段；复杂材质仍需专项回归 |
| 预览触摸、录屏 | `effect-abilities/preview-tool/SKILL.md` | 触摸坐标归一化；截图落盘限制见下文 |
| 视觉质量检查 | `preview-verification/SKILL.md` | 按任务范围检查；不强制移植整套内部评分、报告流程 |
| GAN、视觉算法、音频检测等 | 对应 `effect-abilities/<能力>/SKILL.md` | 能力目录存在不代表已接通或已验证；音频检测与音频生成是不同能力 |

## 内置流程如何替换

| 官方依赖或约定 | 当前做法 |
|---|---|
| `AskUserQuestion` 专用草案卡片、RootAgent 调度、调用后强制结束回合 | 不复制内部 UI/调度协议；需求明确则继续，仅在缺少影响结果的必要信息时用当前对话澄清 |
| `.agent/setting-image/style_selection.json`、设定图确认和生成状态 | 采用用户提供或已确认的风格与参考。必要时记在 `.codex/notes.md`；不伪造官方确认文件或任务状态。缺少这个内部文件本身不阻塞我们的创作 |
| 固定 Draft/Brief/manifest 文件、强制多阶段规划 | 模板按需参考，简单修改不创建整套文档。确实被当前脚本或工具读取的文件须保留其真实格式和路径，不能仅因目录整理就改名 |
| Seedream、音频生成、等待云端任务、设定参考图工具 | 7 个官方云端入口尚未接入，调用会报错。图片由当前图像工具生成，取得本地素材后导入并验证；音频生成方案待定，不伪造生成结果 |
| 官方统计、聊天历史、内部任务完成信号 | 不写入。`task_done` 仅返回摘要，不保存工程、不代表已验证、不更新官方聊天 |
| `.agent/skills/` 全量释放 | 不执行。只从安装目录读说明；运行时库和脚本模板由 `setupGameScript` 按所选能力复制到 Assets。`.codex/runtime-dependencies.json` 保存已同步哈希，用户修改冲突时拒绝覆盖。旧 userScript 作为兼容入口保留 |

## 工具格式与已知语义差异

官方示例的 `actions / tool_name / payload` 不能直接传给当前 MCP 路由。优先直接调用相应上层工具；所有工程操作使用统一外层 `{projectPath, sessionId?, params, timeoutMs?}`。例如读取场景：

```json
{"name":"eh_getScene","arguments":{"projectPath":"E:/你的工程","params":{}}}
```

确需使用 `effect_house_toolbox` 时，当前 params 为 `{tool, params}`，一次调用一个上层工具。例如编译：

```json
{"name":"effect_house_toolbox","arguments":{"projectPath":"E:/你的工程","params":{"tool":"compileProject","params":{}}}}
```

上面是 MCP `tools/call` 请求体示例；实际调用请使用当前宿主提供的工具接口。不同工具的内层 params 以其公开 inputSchema 为准，不把原生命令参数或官方示例未经转换塞入上层入口。

| 工具或依赖 | 当前限制与使用方式 |
|---|---|
| `sceneOps` / `eh_applySceneOps` | sceneOps 接入平铺到 transform/image/text 等嵌套结构的转换，整批预检后逐项执行与读回。检查 results 中 verification.errors 和 unverifiedFields；不是原子事务，失败时此前步骤可能已生效。eh_applySceneOps 只接受原生嵌套结构。textContainerId 自动布局尚不支持，显式给矩形 |
| `sceneSpec` | objects 由实时 getScene/getAllAssets 投影，包含 GUID、组件 ID、显隐及可计算矩形；不依赖 Assets/scene.json。使用官方 720×1280 设计坐标，复杂旋转/缩放的几何不作可靠承诺 |
| `setupGameScript` / `userScript` / `compileProject` | 新入口支持 resourceBindings:[{property,type:Texture或Material,guid}]；旧入口保留 action/componentProperties。依赖冲突默认保留用户修改；确需升级，先读回哈希，再显式传 expectedRuntimeHashes。编译通过不等于玩法已验证 |
| `builtinResource` / `materialAsset` | 有本地映射；资源知识查询只搜索原始 schema，没有官方覆盖层融合。字段缺失时查询实际对象，不猜测字段；复杂资源、材质仍待专项验证 |
| `eh_previewTouch` / `eh_previewDrag` | 坐标使用 [0,1]，schema 会拒绝范围外输入。触摸原点与实际命中仍需按预览验证 |
| `eh_saveScreenshot` | 返回 MCP image；指定工程内 path 时桥接解码图像、落盘并返回 saved/path/width/height/sha256，图像缺失或无法解码时报错。未指定 path 时只返回图像 |
| `eh_recordPreviewVideo` | 默认输出到工程 `.codex/artifacts/recordings/`，需读回输出并核对文件；已打开的旧桥接窗口可能仍采用旧目录 |
| `imageCrop` / `imageCompress` / `svgConvert` | 本地确定性处理；区域裁剪须指定 outputPath。设计稿尺寸推断、HUD 自动归一化、SVG 动画不支持；显式给尺寸及路径 |
| `code_search` / `consoleLog` | 前者是本地 TS 符号查询，不是官方私有代码图谱；日志已适配 9.4 startLine/count 参数顺序，但空日志仍不能作为正常运行证据 |
| `playHumanActions` / `playStep` | 枚举精确动作 ID；playStep 执行有序 actions，每项提供 commandType、params、waitAfterMs（1～30000）。支持触摸、拖拽、wait、switch_human_action、simulate_audio_input。失败仍清理模拟音频并暂停，返回 completed 与错误，禁止盲目重试 |
| `playLifecycle` / `playScreenshot` | start/restart/finish 管理按工程、会话绑定的试玩状态；开始真实录制，截图固定 scale=0.5，产物在 .codex/artifacts/playthrough。finish 检查视频文件。失败会清理；清理失败保留 active 状态，需继续收尾 |
| `playStateFields` / `playState` | 先枚举真实字段，再用 target:{type:fields,fieldNames:[...]} 和 range:{type:lastFrames,frameCount:N} 或 {type:sinceLastPause} 查询。只读当前试玩的真实 ndjson，最多读尾部 4MB、lastFrames 上限 1000；未知字段、日志缺失、多份候选均明确报错，不用静态场景填补 |
| 保存、重开编辑器 | 当前没有已验证的保存工程 MCP 入口；使用 GUI 保存并核对工程落盘，不重启未保存窗口 |

## 工程目录与失败处理

- 我们的工程记录、证据和备份分别在 `.codex/notes.md`、`.codex/artifacts/`、`.codex/backups/`，按需创建；官方 `.agent/` 保留原样。总目录 `.agents/skills/` 仅用于共享 Skill 发现。
- 不把所有 `.agent/…` 引用机械改为 `.codex/…`：文档引用解析到安装目录；我们的产物用 `.codex/`；编辑器实际依赖的脚本、资源按原位置保存。
- `project_write_file` 开放 Assets 限定文本/SVG、`.codex/notes.md`、`.codex/artifacts/` 下 md/json/svg，保留旧中间 SVG 路径兼容。覆盖已有文件必须提供 SHA256。运行时清单和 backups 不开放为通用写入目录。
- 会话返回 protocolVersion、runtimeHash、catalogHash、editorVersion。服务在执行前核对桥接；BRIDGE_UPDATE_REQUIRED 表示需更新插件和运行时清单，保存工作后再重新打开编辑窗口，不能只重连 MCP。
- 上层操作通过会话锁串行化，避免多个 MCP 客户端同时改同一窗口。已完成队列文件保留至少一小时后回收；进行中请求不回收。
- `playLifecycle start` 临时插入 Game2D 状态上报与所需音频输入桥接，编译并等待运行脚本就绪；要求已经挂载且能启动的 Game2D 入口。普通空场景需先 setupGameScript。只支持已核对的运行库结构，锚点变化会拒绝写入。
- 状态消息从 PreviewRenderMsg 35025 收集，优先读取会话目录 `playthrough/<playId>.ndjson`，同时核对 evalId/runId；官方转发器的重复日志不造成歧义。对象序列化有深度、数组与字段数上限，截断/循环明确标记，不能视作完整对象导出。
- 注入前将原文、哈希和恢复清单存入 `.codex/backups/play-<id>`。finish 恢复源码、编译并重载；中途用户改过运行库会报 PLAY_RESTORE_CONFLICT，保留新修改与备份。清理失败可重试 finish，已结束的录像不会重复结束。此流程会改写临时源码，不调用保存场景。
- 音频模拟驱动 AgentAudioDetector / AgentAudioKeyword 的检测结果与回调，不生成真实声音。volume 是底层检测原始值，不是 getVolume() 的感知响度。9.4.0 运行库按幅度处理；9.4.1 改按能量处理，使用 10 倍常用对数、[-16, -7] dB 窗口和 0.7 次幂。新版输入 0.1 对应约 0.753，0.001 会映射为零；不能复用旧版的响度预期。具体取决于工程实际同步的运行库，升级时保留用户修改保护。本桥接输入从渲染线程接收时计时，并等待 audioInput 确认；确认超时会报错而不是报告已执行。每步结束清空输入；没有对应运行库时在动作执行前拒绝。
- 会话发现并发读取历史记录并返回 heartbeatAgeMs。明确指定 sessionId 时容忍最多两分钟心跳延迟，仍检查进程存活、主机实际响应、工程路径与桥接哈希；未指定会话的自动选择仍要求新鲜心跳。
- 调用参数错误先对照本地 schema；写入失败或超时先读回，不能盲目重试；云端未适配错误改走已明确的替代路线。验证范围按改动决定，不强制每轮完整审计。
- 读到与当前接口冲突的官方新文档时，记录编辑器版本、接口名和差异，在测试副本验证后再调整适配说明。不要把文档新增或工具已登记当作已验证。

## 维护与证据

本文件是适配说明的唯一维护源；README、工作区 Skill 和 MCP 入口只链接它。官方文件不改写，也不逐工程分发副本。

依据：本项目 `src/server.mjs`、`src/adapters.mjs`、`src/catalog.mjs`、`editor-plugin/runtime.cjs`，本机官方 Skill，及特效工作区 `像塑MCP实时编辑接口.md` 中的真实编辑器验证记录。本说明补齐读取与执行指引，不代表上述尚未修复的接口缺陷已修复。

9.4 实测补充：新增 Image 请显式指定 sceneSpec 中唯一的 groupId，纹理按资源 GUID 绑定。setupGameScript 的 targetId 可传唯一对象名或 GUID；原生入口按名称定位，因此重名会在写入前拒绝。实测状态以 UPGRADE-0.2.md 为准。
