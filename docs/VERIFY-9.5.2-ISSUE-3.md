# 像塑 9.5.2：Issue #3 修复验证

2026-10-06，验证分支 `claude/affectionate-pascal-nn5r6w`（远端头 `3f8d23d`），编辑器 `9.5.2.887097048`。本记录覆盖 [Issue #3](https://github.com/sleepyquq/xiangsu-mcp/issues/3) 的截图和文字尺寸问题，不代表全部工具已验收。

Claude 的截图修复移除了编辑器进程内的 sharp 加载，改用 PNG/JPEG 头解析。文字修复增加 dynamic 尺寸预检及 fixedWidth 高度未验证标记。实查还补充两项源码修复：

- 整批预检继承前一步文字模式，支持同批创建 fixedSize 后修改宽度，并在切回 dynamic 后改尺寸时拒绝整批写入。
- 9.5 Text2D 使用 `layoutMode`；将 AutoSize/AutoHeight/FixedSize 映射为 dynamic/fixedWidth/fixedSize，并按实际组件字段设置。保留旧版 boxDimension 支持，未知 AutoWidth 不套用固定宽度语义。

`npm test`：23/23 通过。真实 MCP stdio 会话确认工程路径、版本及桥接哈希后，在已确认可丢弃的 `MCP-blank-9.5.2-test` 副本验证：

- dynamic 显式尺寸整批拒绝，场景零写入；同批文字模式继承与切换预检通过。
- fixedSize 创建及后续宽度 560 读回；fixedWidth 宽度 300、高度随内容为 96；显式 dynamic 省略尺寸正常读回。
- 带 path 截图真实落盘为 320×569，独立解析尺寸与 SHA256 一致；无 path 返回 MCP 图像。人工查看截图，三段测试文字可见。
- 官方编译通过；2 秒录制生成 846,771 字节 MP4，文件头有效。
- 删除本轮分组及对象后为空场景，cleanupErrors 为空；新旧测试工程 effect.dyehpj 的测试前后哈希不变，未保存场景。

本机测试副本的证据目录：`MCP-blank-9.5.2-test/.codex/artifacts/regression-95-1791284905993`，包含逐次工具响应、summary.json、preview.png 和 preview.mp4；这些本机产物不随源码提交。
