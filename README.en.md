# Xiangsu MCP

[中文](README.md) | [English](README.en.md)

Control the Douyin Xiangsu effect editor from an AI agent through MCP: edit scenes, develop scripts, compile, preview, save, and access official image, audio, and workflow tools.

> **Try the official MCP first.** Xiangsu now provides an official MCP integration. Use the installation prompt supplied by the editor to configure it and follow editor updates. [Xiangsu website](https://effect.douyin.com/) · [Official release notes](https://bytedance.larkoffice.com/docx/RscSdNN59owmcaxXtk1cEGhun2c)
>
> Consider this project if your client needs **stdio access**, or if you need its retained playtest state inspection, audio-detection input simulation, or legacy tool interfaces. This independent community project will receive occasional compatibility updates and necessary fixes.

**Current version: 0.3.0.** See [Releases](https://github.com/sleepyquq/xiangsu-mcp/releases) for past versions, and read the README included with the version you choose.

[Versions](#versions-and-compatibility) · [Features](#features-and-verification) · [Installation](#install-this-project) · [Usage](#start-working-with-an-agent) · [Troubleshooting](#troubleshooting)

## Versions and compatibility

**Starting with 0.3.0, each MCP version uses its tested Xiangsu version as the minimum. It accepts that editor version and newer versions, and rejects older ones.**

- **At the tested baseline:** accepted; see the table and verification records for tested workflows.
- **Above the baseline:** accepted with an unverified-version warning. Future editor changes may still break interfaces.
- **Below the baseline:** rejected. Update Xiangsu or choose an MCP version for your editor from [past releases](https://github.com/sleepyquq/xiangsu-mcp/releases).

For example, MCP 0.3.0 accepts Xiangsu **9.7.2 and later**, but rejects 9.7.1, 9.6.x, and 9.5.x.

| MCP version | Editor versions actually tested | Version admission | Verification scope |
| --- | --- | --- | --- |
| **0.3.0** | **9.7.2.918909817** | **9.7.2 and later**; newer versions marked unverified | Scene editing, script attachment and compilation, real preview, saving, image and short-audio generation and import; [update record, Chinese](docs/RESTART.md) |
| [0.2.2](https://github.com/sleepyquq/xiangsu-mcp/releases/tag/v0.2.2) | **9.5.2.887097048** | Historical policy: installation allowed on 9.4.0 and later | Session binding, text layout and batch preflight, screenshots, compilation, recording; [verification, Chinese](docs/VERIFY-9.5.2-ISSUE-3.md) |
| [0.2.1](https://github.com/sleepyquq/xiangsu-mcp/releases/tag/v0.2.1) | **9.4.1.872531341**; retained historical 9.4.0 results | Historical policy: installation allowed on 9.4.0 and later | Scenes, scripts, resource binding, playtest state, audio simulation, actions; [verification, Chinese](docs/AUDIT-9.4.1.md) |
| [0.2.0](https://github.com/sleepyquq/xiangsu-mcp/releases/tag/v0.2.0) | **9.4.0.866073534** | Only the audited 9.4.0 package | Scenes, scripts, preview, interaction, runtime restoration; [verification, Chinese](docs/UPGRADE-0.2.md) |

Past releases keep their original version checks. **Permission to install is not a live-test result**, and tests from an older release do not establish full coverage on a newer editor.

## Features and verification

| Feature | Available functionality and live-test status |
| --- | --- |
| Scenes and scripts | Edit objects, manage resources, and develop scripts. Object editing, script attachment, compilation, and logs passed on 9.7.2 |
| Preview and saving | Switch preview inputs, capture screenshots, interact, and save projects. Real preview, startup logs, and saving passed on 9.7.2 |
| Images and audio | Generate and import individual assets or batches. One image and one short audio clip were generated and imported on 9.7.2 |
| AI workflows | Edit workflows, generate results, and download them. Capability queries were live-tested; the complete editing-and-generation flow was not |
| H5 scripted animation | Import scripted animations and query status and render settings. Configuration queries and artifact publication were live-tested; full import and cloud-video generation were not tested end to end |
| Playtesting and audio-input simulation | Inspect runtime state and simulate actions and audio-detection inputs. Core workflows were tested on 9.4.0/9.4.1; the full playtest regression has not been rerun on 9.7.2 |
| Local utilities | Project file access, image cropping/compression, static SVG-to-PNG conversion, and TypeScript symbol lookup |

All **37 automated tests pass**. See the [update record, Chinese](docs/RESTART.md) for live-test coverage.

Important limitations:

- Image, audio, and workflow features require Xiangsu's official MCP service. Cloud generation uses the editor's login state and account credits; submit it only with user authorization.
- International TikTok Effect House, macOS, advanced materials/physics/prefabs, and all native-command combinations remain unverified. Multi-step operations can partially complete; read back state after a failure or timeout rather than automatically replaying writes.

## Install this project

If the official MCP meets your needs, you do not need this project. These instructions apply to 0.3.0.

### Ask an agent to install it

Replace the projects directory and give this prompt to an agent:

```text
Please install Xiangsu MCP: https://github.com/sleepyquq/xiangsu-mcp

Read README.en.md and docs/SKILL-ADAPTER.md first, and check the source version against my Xiangsu version. Prefer the official MCP if it meets my needs. If I need this project, reuse or clone its repository, check Windows, PowerShell 7, Git, and Node.js 24, install dependencies, and run npm test.

Set XIANGSU_EFFECT_WORKSPACE and run node scripts/install.mjs. Set XIANGSU_EDITOR_ROOT for a custom editor installation. Respect the minimum editor version of the chosen MCP release: newer untested versions may proceed, but do not bypass the check for older editors.

Preserve existing client configuration and add the xiangsu-editor stdio server, using absolute paths to node and src/server.mjs. If loading the plugin requires reopening a project, tell me to save my work first; do not restart it without notice. Reconnect MCP, verify the test project, and confirm the connection with a read-only check. Do not automatically edit the project or submit paid generation.

My effect projects directory: D:/Effects (replace this)
```

### 1. Prepare the environment and source

- Windows and Xiangsu **9.7.2 or later**, with a project that opens normally.
- Node.js **24**, PowerShell **7** (`pwsh.exe`), Git, and a client supporting local stdio MCP.
- A separate effect projects directory, such as `D:/Effects`. The source repository is not an effect project.

Run in PowerShell 7. Reuse an existing checkout when available; for past releases, use the matching tag and its README:

```powershell
git clone https://github.com/sleepyquq/xiangsu-mcp.git
cd xiangsu-mcp
npm ci --ignore-scripts
npm test
```

### 2. Install the Xiangsu user plugin

```powershell
$env:XIANGSU_EFFECT_WORKSPACE = 'D:/Effects'
# Set only for a non-default Xiangsu installation:
# $env:XIANGSU_EDITOR_ROOT = 'D:/Apps/Douyin AR'
node scripts/install.mjs
```

The installer creates the local configuration and installs `CodexXiangsuMCP@0.3.0`. Configuration backups go to `.local/install-backups/`.

**Save your work, then close and reopen the project window** to activate the plugin. Do not move the source repository after installation.

### 3. Register the MCP client

For clients using `mcpServers` JSON, merge this entry into the existing configuration. Use the actual absolute repository path:

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

If the client cannot find `node`, use `Get-Command node` and provide the absolute path to `node.exe`. Generation can take longer than ordinary calls; set a **300-second** tool timeout if the client supports it, then reconnect MCP.

### 4. Confirm the connection

Open a test project inside an allowed directory. Ask the agent to follow the [adapter guide, Chinese](docs/SKILL-ADAPTER.md), verify the project path, and read the current scene. A correct scene readback confirms editor connectivity.

## Start working with an agent

For example:

> Use the xiangsu-editor MCP. Read the adapter guide, verify my open project, and read back its scene. Only start making the requested changes after confirming the path.

The agent follows the [adapter guide, Chinese](docs/SKILL-ADAPTER.md) for tool arguments, file operations, and H5 authoring. You do not need to compose tool calls manually.

## Troubleshooting

| Situation | Action |
| --- | --- |
| `EDITOR_VERSION_TOO_OLD` | Version 0.3.0 requires Xiangsu 9.7.2 or later. Update Xiangsu or select an older MCP release; do not bypass the check |
| `XIANGSU_COMPATIBILITY_UNVERIFIED` | The editor is newer than the tested baseline and is accepted. Check the features you need in a test copy |
| `OFFICIAL_MCP_UNAVAILABLE` | Start Xiangsu and confirm its official service and address. Existing local editing tools remain available |
| No legacy session / `BRIDGE_UPDATE_REQUIRED` | Check that the plugin is installed for the current editor version. Save your work, rerun the installer, and reopen the project |
| Project path rejected | Check `effectWorkspace` and `allowedRoots` in `config.local.json`; do not expand scope merely to bypass a check |
| Old tool list | Reconnect the MCP service or reload the client. A new conversation alone may not restart the server process |
| Text dimensions rejected | `dynamic` follows content and cannot take explicit width/height. Use `fixedSize`, or `fixedWidth` for fixed width with automatic height |
| Playtest cannot start | A working, attached Game2D entry is required. See the adapter guide for dependencies and temporary-code restoration |
| Write or generation times out / is canceled | It may already have started. Query status or read back results before submitting again |

After updating Xiangsu, rerun the installer for the actual editor version, then save your work and reopen the project. Above the tested baseline, check only the features you need. To disable this project, remove the client's `xiangsu-editor` entry and only the `CodexXiangsuMCP` plugin entry; keep other plugins and rollback backups.

## Tests and contributions

Run `npm test` for protocol, arguments, path boundaries, overwrite protection, forwarding, playtest isolation, and recovery checks. It does not require a running editor.

Run live regression only in a confirmed disposable test copy. These scripts write test source/assets and modify the in-memory scene without saving the main scene:

```powershell
node scripts/blank-setup.mjs 'D:/Effects/DisposableBlankTest'
node scripts/blank-check.mjs 'D:/Effects/DisposableBlankTest'
node scripts/blank-play.mjs 'D:/Effects/DisposableBlankTest'
```

Open that copy in Xiangsu and verify its session first. Close it without saving afterward; test files remain on disk. Do not run these scripts on a production project.

When opening an [issue](https://github.com/sleepyquq/xiangsu-mcp/issues), include the editor version, MCP version, client, reproduction steps, and redacted logs. Distinguish automated tests from live editor checks when changing an interface or adapter.

## Project origin

This is an unofficial community project, not a ByteDance, Douyin, or TikTok product. The repository contains independently written bridges, adapters, tests, and interface metadata for interoperability. It does not distribute Xiangsu executables, official runtime libraries, or asset packs. Required official references and managed scripts are read from the user's local installation. Third-party content remains the property of its respective rights holders.

## License

Original project code is licensed under the [MIT License](LICENSE). Third-party content remains subject to its original licenses.
