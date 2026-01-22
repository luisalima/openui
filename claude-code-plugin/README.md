# OpenUI Status Plugin for Claude Code

Reports Claude Code agent status to OpenUI in real-time for accurate status display (Working, Using Tools, Idle, etc.).

## Installation

**Automatic:** OpenUI automatically pulls and installs this plugin when you run it. No manual installation required.

**Manual (if needed):**
```bash
curl -fsSL https://raw.githubusercontent.com/Fallomai/openui/main/claude-code-plugin/install.sh | bash
```

This installs to `~/.openui/claude-code-plugin/`. OpenUI automatically uses it when starting Claude agents.

## How It Works

The plugin uses Claude Code hooks to report status:

| Hook Event | Status |
|------------|--------|
| `SessionStart` | `starting` |
| `UserPromptSubmit` | `running` |
| `PreToolUse` | `tool_calling` |
| `PostToolUse` | `running` |
| `Stop` | `idle` |
| `Notification` (idle_prompt) | `waiting_input` |
| `SessionEnd` | `disconnected` |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENUI_HOST` | `localhost` | Host where OpenUI server is running |
| `OPENUI_PORT` | `6969` | Port where OpenUI server is running |
| `OPENUI_SESSION_ID` | (none) | Session ID for external sessions |
| `OPENUI_SECRET` | (none) | Shared secret for authentication |

## External Sessions

See the main [README](../README.md#external-sessions) for connecting Claude sessions from other terminals.

## Troubleshooting

- **Verify plugin loaded:** `/plugins` should show `openui-status`
- **Check connectivity:** Ensure `OPENUI_PORT` matches OpenUI server (default 6969, dev 4242)
- **Debug log:** `tail -f /tmp/openui-status-debug.log`

## Uninstall

**Marketplace install:**
```
/plugin uninstall openui-status@openui-plugins
```

**Curl install:**
```bash
rm -rf ~/.openui/claude-code-plugin
```
