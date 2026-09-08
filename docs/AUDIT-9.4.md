# MCP 缺陷与像塑 9.4 接入评估

核对日期：2026-09-08。范围为代码审计、已有任务证据及本机官方安装包静态分析；没有更新插件、覆盖命令清单或操作特效工程。

## 证据与结论边界

- 已读取任务 `01a0767a-e20e-7462-b387-4531be7effe5`（查找像素最新 Agent 模板）的本地消息记录。任务 API 返回空 items，正文来自该任务本地 rollout。
- 本机 `Douyin AR.exe` 的 FileVersion 为 `9.4.0.866073534`，ProductVersion 为 `9,4,0,f505c1a2cf`。
- 官方 `Resources/agent-server.exe` SHA256：`038a67ba2fe26192c271da8fdbca88ab9a5b8d39287205df33676dbd4137df86`；项目旧清单来源 SHA256：`86461dd079fa665e13e23d125427dacda1d9fab6e0f4b2105419ec733bac305b`。
- 对新版 `EHCommandRegisterList` 做 AST 读取，35 个基础命令名称与旧提取清单一致。这不证明参数、行为或全部内部命令未变化；MCP 的其余 29 个命令由本地补充映射构成。
- 新版识别到 29 个具名上层工具，旧清单为 23 个：增加 6 个 `play*` 工具，并以 `setupGameScript` 替换 `userScript`。这是相对项目旧清单的差异，不是对这些能力首次发布版本的完整历史证明；play 工具位于官方内部 eval/playthrough 模块，未确认全部对普通用户开放。
- [官方主页](https://effect.douyin.com/)未提供本次可核实的详细 9.4 发布说明。因此下列技术结论依据本机官方包，不冒充官网发布公告。
- `npm test`：3 组通过；`node scripts/call.mjs xiangsu_sessions`：本次返回空数组，未开展 9.4 实机回归。
- 临时提取证据与摘要位于本项目 `.local/audit-9.4/`，未替换生产清单。

## 当前缺陷及优先级

| 优先级 | 缺陷 | 依据与影响 | 建议验收 |
|---|---|---|---|
| P0 | 安装与协议适配仍停留在 9.3.2 | `scripts/install.mjs` 写死 `v9.3.2/Local`；新版目录存在，但检查的 `v9.4.0/Local/plugins.config.json` 不存在。旧提取器依赖压缩字符串，本次对新版报“官方命令表特征已变化”。 | 显式版本检测/选择，提取结果先隔离比较，schema 与参数顺序审计后才更新插件；测试副本可发现会话。 |
| P0 | `sceneOps` 未做 DSL 转换 | `src/adapters.mjs` 仍把平铺 ops 原样交给 `applySceneOps`；已有任务确认创建成功但布局、贴图、文字未应用。`src/scene.mjs` 没有被入口导入，不能算修复上线。 | 新建 Image/Text 后逐项读回尺寸、位置、贴图、文字、字号、显隐，并检查预览。 |
| P1 | `sceneSpec` 依赖过时管理记录 | objects 仍来自 `Assets/scene.json`，liveScene 才是实时场景；没有该文件时 objects 为空。 | 返回实时对象与 GUID，不以创建影子 scene.json 掩盖差异。 |
| P1 | 截图输出路径没有落盘保证 | 桥接只转发 `saveScreenshot`，没有显式保存返回图像或检查文件；已有任务确认此限制。 | 返回实际文件路径、尺寸/哈希并验证文件可解码；图像返回与落盘分别报告。 |
| P1 | 触摸/拖拽坐标校验缺失 | `src/catalog.mjs` 使用普通 number，没有限制 [0,1]。 | 明确坐标系，范围错误在调用前拒绝；真实点击和拖拽结果读回。 |
| P1 | 运行版本和验证标识不足 | `bridgeVersion` 固定为 0.1.0；`priorVerified` 为静态集合，没有编辑器版本、代码哈希和证据作用域。 | 会话返回编辑器版本、桥接构建/协议/清单哈希；9.3.2 验证不自动继承给 9.4。 |
| P1 | 脚本运行时覆盖保护不完整 | `userScript` 每次复制 Game2D 和选中能力同名文件，没有 SHA256 冲突检查；首次备份不能保护后续用户自定义修改。 | 依赖清单记录来源版本与哈希；未修改文件可升级，冲突文件明确报告。 |
| P2 | 协作写入路径不一致 | 默认协作目录已改 `.codex/`，但 `project_write_file` 仍只允许 Assets 和旧 `.agent/asset-processing` SVG。 | 按用途开放 `.codex/notes.md` 与限定中间产物，保留工程边界和覆盖检查。 |
| P2 | 长会话队列积累 | bridge/runtime 不清理已完成 req/res/started 文件，tick 每次扫描全部请求。 | 设保留期和清理规则，保留进行中/未确认请求；提供 requestId 查询，超时写入不盲目重试。 |

`src/scene.mjs` 草稿也不宜直接接上线：固定 720×1280，复杂父级变换未验证；Image color 后处理依赖输入显式携带 type；分组操作和部分样式没有读回校验。同批对同一对象多次修改，还需避免用最终状态逐条验证中间预期。

尚无已验证保存工程入口，consoleLog 的业务日志完整性没有证实，素材导入到最终预览整链路仍待测。三组自动测试不能覆盖这些真实编辑器语义。

## 9.4 最值得接入的能力

| 官方工具/能力 | 官方包中可见行为 | MCP 接入价值与工作量 |
|---|---|---|
| `playLifecycle` | start/restart/finish；重置预览、开始运行日志和视频、暂停；结束前保留终态画面并收尾。 | 高价值，中等偏高。做成按工程和会话隔离的试玩状态机，失败也清理输入、录制与暂停状态。 |
| `playStep` | 串行执行触摸、手势及模拟音频，逐步等待后暂停；坐标 [0,1]。 | 最高优先级之一。把“点击开始→移动→等待碰撞”变为可复现步骤，而非临时 GUI 操作。 |
| `playStateFields` + `playState` | 枚举可查询字段，再按精确路径读取最近若干帧或上次暂停后的时间线。 | 最高优先级之一。可对分数、游戏阶段、对象位置等做断言。依赖真实运行日志，不能用静态场景冒充。 |
| `playScreenshot` | 固定 0.5 比例获取当前试玩截图，降低图像成本。 | 较低成本。与截图可靠落盘、步骤编号、状态时间线关联后更有价值。 |
| `playHumanActions` | 列举可用脸/手/全身动作，使用精确 actionId 切换并循环动作。 | 高价值，中等工作量。无需用户反复对镜头做动作即可回归算法驱动玩法；需核对素材目录和主机支持。 |
| `playStep` 模拟音频 | 输入音高、原始音量、关键词事件；注入后清除。 | 高价值。声控游戏可自动测试；音量不是归一化游戏力度，先校准输入映射；不等于音频生成。 |
| `setupGameScript` | 脚本和能力依赖配置，支持 `resourceBindings` 绑定 Texture/Material GUID。 | 优先适配。保留旧 userScript 兼容层，但不能简单改名：schema、能力元数据、资源绑定和依赖保护均需审计。 |

已定位的底层调用候选：`getHumanActions`、`switchHumanAction(actionId)`、`setPlayAudioInput(id,input,durationMs)`、`clearPlayAudioInput()`，以及 `beginPreviewRecording(filePath,projectPath)`、`endPreviewRecording()`、`abortPreviewRecording()`。它们走官方 SendCommand 通道，适合评估现有桥接复用，但均未做真实编辑器验证。

接入注意：运行状态读取依赖官方 `agentLogPath` 邻近的 `agentPlaythrough/*.ndjson`，不能假设不启动官方 Agent 也自然有日志。应先建立/验证独立日志来源与当前工程、当前试玩关联。官方录制报告默认目录是 Desktop/AutoTestEvalReport；本项目产物应按用户约定落到目标工程 `.codex/artifacts/`。新增 `filePath` 参数须补路径校验，当前运行时只枚举校验 path/assetPath/gitRepoPath 等字段。

新版内置资料还提供音频检测、排行榜、打卡、社交资料、视觉算法、物理、GAN、画面效果。仅凭这些目录存在，不能断言它们都是 9.4 新增，也不必每项新造 MCP 工具；优先通过能力查询、依赖配置和真实脚本回归复用。

## 建议开发顺序

1. 版本检测、提取器与兼容性检查；修复 sceneOps/sceneSpec、截图落盘、坐标约束。先恢复可靠修改与验证。
2. 适配 setupGameScript，补资源绑定、运行时文件冲突保护；贯通外部图片生成→导入→绑定→预览。沿用用户决定：图片走 Codex 图像工具，音频生成暂缓。
3. 接入 playStep + 状态字段/时间线 + 截图，再加 lifecycle/录制，形成可重复玩法验证。
4. 接入人体动作和模拟音频，扩展到体感、声控玩法回归。

每阶段分别记录静态审计、协议测试、真实编辑器读回和视觉/交互验证。先恢复测试副本会话，再开展真实回归；不重启未保存的用户窗口。
