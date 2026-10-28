# 像塑 9.6.0 兼容性审查

核对日期：2026-10-23。当前 MCP：0.2.2；本机像塑：`9.6.0.900323358`，ProductVersion：`9,6,0,40fd32681c`。

## 结论：需要局部兼容更新，不需要重写 MCP

35 个基础命令的登记定义与现有基线一致，但新版音频运行库名称和人体动作调用契约发生变化。**仅重新安装插件或登记新版本，不能恢复完整试玩能力。** 建议在保留旧版接口的前提下完成音频和动作适配，再进行 9.6.0 测试副本回归。

本轮是兼容性评估：未修改产品实现、安装配置或特效工程，未重启编辑器。检查程序只在本仓库 `.local/audit-9.6.0/` 创建隔离副本。

## 已确认的问题

### 1. 本机插件没有迁移到新版本目录

- 本机配置仍为 `editorVersion: 9.5.2`、`editorFileVersion: 9.5.2.887097048`。
- `DouyinAR/Plugins/v9.6.0/Local` 为空；9.5.2 的插件登记仍是 `CodexXiangsuMCP@0.2.1`。
- 真实 MCP stdio 调用 `xiangsu_sessions` 返回空数组。
- EXE 与本次提取的 `agent-server.exe` 经文件句柄核对，物理路径均位于正常 `AppData/Local/Douyin AR` 安装目录，没有使用历史 Codex LocalCache 副本。

需要将桥接安装到 9.6.0 对应目录并更新本机配置。安装器已允许 9.4.0 之后版本，因此没有必须先修改的版本门槛；应在修复后使用已有安装脚本，保留配置备份并由用户保存工作后重开工程。

### 2. 新建音频工程的模拟输入会被拒绝

新版官方 `effect-abilities/audio/SKILL.md` 映射到：

- `AudioDetector.ts`，替代 `AgentAudioDetector.ts`；公开类型也使用 `PitchDetector` / `VolumeDetector`。
- `KeywordDetector.ts`，替代 `AgentAudioKeyword.ts`。

当前 `setupScript` 能按新版 Skill 正确复制新文件；但 `src/play-instrumentation.mjs` 只查找旧文件名。因此，使用新版运行库的工程会得到：

```json
{"state":true,"audioDetector":false,"keyword":false}
```

在隔离目录中调用现有 `setupScript`、`prepareInstrumentation` 和 `runPlay` 已复现：

- 音高模拟：`PLAY_AUDIO_DETECTOR_MISSING`。
- 关键词模拟：`PLAY_KEYWORD_DETECTOR_MISSING`。
- 两次拒绝均发生在调用编辑器之前。

此结论针对使用新版运行库的工程；保留旧运行库的已有工程不能仅按编辑器版本判为相同情况。适配应按实际文件和结构识别，继续支持旧文件名、冲突保护与恢复机制。

现有 `test/fixtures/Blank94Probe.ts` 仍导入旧文件与旧类型，`scripts/blank-play.mjs` 也固定读取旧文件名，需一起调整。新版音量转换仍采用能量语义、10 倍常用对数、[-16, -7] dB 窗口与 0.7 次幂；这次直接确认的破坏点是运行库命名，不是该转换曲线。

### 3. 人体动作改为素材引用与会话管理

本机官方 `PlayHumanActionClient` 的调用为：

- `beginHumanActionSession(sessionId)`。
- `switchHumanAction(sessionId, actionId, filePath, inputType)`；`actionId` 与 `filePath` 均来自准备好的 `materialRef`。
- `restoreHumanActionSession(sessionId)`。

官方上层新增 `preparePlayMaterial`；`playStep.switch_human_action` 改为 `materialRef` 与 `inputType`，后者包含 `preview_face`、`preview_hand`、`preview_fullbody`、`preview_twoperson`。

当前 MCP 的 `switchHumanAction` 只有一个 `actionId` 参数，也没有动作会话的开始与恢复。`getHumanActions` 已不在新版官方命令枚举内，二进制中仅发现其残留超时判断。**旧动作枚举及单参数切换路径不能继续作为 9.6.0 支持承诺。** 接收端是否保留兼容分支，需要实机核实；后续实现应覆盖素材路径限制、会话恢复和失败清理，并保留旧版入口。

## 保持一致的部分与新增差异

- AST 提取的 35 个基础命令完全一致，包含参数顺序、Schema 和描述。
- MCP 71 个本地命令中，70 个名称仍在新版官方命令枚举内；缺少的是 `getHumanActions`。名称一致不能证明签名与行为一致，动作切换就是反例。
- 本轮提取到 26 个上层工具，原基线为 29 个：新增 `preparePlayMaterial`；未再提取到 `playState`、`playStateFields`、`playHumanActions`、`ffmpegInfo`。
- 本地 `playState` / `playStateFields` 是独立状态采集实现，`ffmpegInfo` 使用的底层 `getFfmpegPath` 仍存在，不能因官方上层清单变化就删除现有入口。
- 官方 `playLifecycle` 增加 `warmupMs` / `terminalDwellMs`。本地生命周期为独立实现，不应直接替换其 Schema、给旧调用强加新必填项。
- 新版 `Game2D.ts` 的现有插入锚点仍匹配，在隔离副本完成插入与恢复。真实消息上报、编译和预览仍需实机验证。
- 官方 Skill 和资源根目录仍存在，可继续按现有配置路径读取。新工具与无法完整表达的 Schema 构造仍需人工审查，不直接用候选覆盖正式清单。

## 验证证据与边界

- `npm test`：23/23 通过；这些测试使用既有样例，未覆盖上述新版文件名与动作契约。
- `.local/audit-9.6.0/catalog.candidate.json`：从本机 9.6.0 官方二进制提取的候选。
- `.local/audit-9.6.0/static-audit.json`：基线差异及运行库插入/恢复结果。
- `.local/audit-9.6.0/compatibility-probes.json`：新版依赖复制、旧回归导入缺失、音频模拟拒绝的复现。
- `.local/audit-9.6.0/official-human-action-client.txt`：本机官方动作客户端调用片段，仅存本地。
- 复现脚本：`.local/audit-9.6.0/check.mjs`、`probes.mjs`；后者的 `attachUserScript` 使用模拟调用，不代表真实挂载或编译成功。

当前没有 MCP 编辑器会话，故未执行 9.6.0 场景读写、截图、编译、录像和交互回归。此前 9.5.2 的成功结果保持其原有版本范围。

## 推荐更新顺序

1. 兼容新旧音频运行库名称及类型，更新相关回归样例和使用说明。
2. 适配新版动作素材与会话生命周期；旧版调用保持原契约，不用删除能力来迁就新清单。
3. 使用已有安装器将插件登记到 9.6.0；保存工作后重开已确认的测试副本并核对会话工程路径。
4. 在该副本验证场景与文字、图片绑定、截图、编译、音高/音量/关键词、动作切换及恢复、MP4 和临时运行库恢复。通过后再更新兼容性声明与发布版本。
