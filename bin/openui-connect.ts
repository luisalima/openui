#!/usr/bin/env bun

/**
 * OpenUI Connect - Start Claude Code with OpenUI integration
 *
 * This script starts Claude Code as an external session that connects to
 * a running OpenUI server. The session will appear in the OpenUI canvas
 * and report status updates in real-time.
 *
 * Usage:
 *   openui-connect                    # Start Claude Code connected to OpenUI
 *   openui-connect --session-id=xyz   # Use a specific session ID
 *   openui-connect --name="My Session" # Set a custom session name
 *   openui-connect --color="#FF5733"  # Set the node color in the canvas
 *   openui-connect --register         # Pre-register the session before starting
 *   openui-connect -- --model opus    # Pass args to Claude Code after --
 *
 * Environment variables:
 *   OPENUI_PORT    - Port where OpenUI is running (default: 6969)
 *   OPENUI_HOST    - Host where OpenUI is running (default: localhost)
 *   OPENUI_SECRET  - Shared secret for authentication (optional)
 */

import { existsSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const PORT = process.env.OPENUI_PORT || "6969";
const HOST = process.env.OPENUI_HOST || "localhost";
const SECRET = process.env.OPENUI_SECRET || "";
const CWD = process.cwd();

// Parse arguments
const args = process.argv.slice(2);
let sessionId: string | null = null;
let customName: string | null = null;
let customColor: string | null = null;
let preRegister = false;
let claudeArgs: string[] = [];

// Split args on --
const doubleDashIndex = args.indexOf("--");
const ourArgs = doubleDashIndex >= 0 ? args.slice(0, doubleDashIndex) : args;
claudeArgs = doubleDashIndex >= 0 ? args.slice(doubleDashIndex + 1) : [];

for (const arg of ourArgs) {
  if (arg.startsWith("--session-id=")) {
    sessionId = arg.split("=")[1];
  } else if (arg.startsWith("--name=")) {
    customName = arg.split("=").slice(1).join("="); // Handle names with = in them
  } else if (arg.startsWith("--color=")) {
    customColor = arg.split("=")[1];
  } else if (arg === "--register") {
    preRegister = true;
  } else if (arg === "--help" || arg === "-h") {
    console.log(`
OpenUI Connect - Start Claude Code with OpenUI integration

Usage:
  openui-connect                      Start Claude connected to OpenUI
  openui-connect --session-id=xyz     Use a specific session ID
  openui-connect --name="My Session"  Set a custom session name
  openui-connect --color="#FF5733"    Set the node color in the canvas
  openui-connect --register           Pre-register session before starting
  openui-connect -- --model opus      Pass args to Claude Code after --

Options:
  --session-id=ID   Use a specific session ID instead of auto-generating
  --name=NAME       Custom name for the session (default: derived from cwd/git)
  --color=HEX       Hex color for the node (e.g., #FF5733, #8B5CF6)
  --register        Pre-register the session before starting Claude

Environment variables:
  OPENUI_PORT    Port where OpenUI is running (default: 6969)
  OPENUI_HOST    Host where OpenUI is running (default: localhost)
  OPENUI_SECRET  Shared secret for authentication (optional)

The session will automatically appear in the OpenUI canvas when Claude
starts and will report status updates in real-time.
`);
    process.exit(0);
  }
}

// Generate session ID if not provided
if (!sessionId) {
  sessionId = `external-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Derive session name from git or cwd if not provided
function deriveSessionName(): string {
  // Try to get git branch name
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: CWD,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (branch && branch !== "HEAD") {
      // Also try to get repo name
      try {
        const remoteUrl = execSync("git config --get remote.origin.url", {
          cwd: CWD,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        const repoName = basename(remoteUrl.replace(/\.git$/, ""));
        return `${repoName}:${branch}`;
      } catch {
        return branch;
      }
    }
  } catch {
    // Not a git repo or git not available
  }

  // Fall back to directory name
  return basename(CWD);
}

if (!customName) {
  customName = deriveSessionName();
}

// Find the plugin directory
function getPluginDir(): string | null {
  const homePluginDir = join(homedir(), ".openui", "claude-code-plugin");
  const homePluginJson = join(homePluginDir, ".claude-plugin", "plugin.json");
  if (existsSync(homePluginJson)) {
    return homePluginDir;
  }

  // Also check current directory for development
  const devPluginDir = join(import.meta.dir, "..", "claude-code-plugin");
  const devPluginJson = join(devPluginDir, ".claude-plugin", "plugin.json");
  if (existsSync(devPluginJson)) {
    return devPluginDir;
  }

  return null;
}

const pluginDir = getPluginDir();
if (!pluginDir) {
  console.error("\x1b[38;5;196m[error]\x1b[0m OpenUI plugin not found.");
  console.error("Please run 'openui' first to install the plugin, or install it manually:");
  console.error("  mkdir -p ~/.openui/claude-code-plugin");
  console.error("  # Download plugin files from https://github.com/Fallomai/openui");
  process.exit(1);
}

// Check if OpenUI server is running
async function checkServer(): Promise<boolean> {
  try {
    const res = await fetch(`http://${HOST}:${PORT}/api/config`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Pre-register the session with OpenUI
async function registerSession(): Promise<boolean> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (SECRET) {
      headers["X-OpenUI-Secret"] = SECRET;
    }

    const res = await fetch(`http://${HOST}:${PORT}/api/sessions/register`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionId,
        cwd: CWD,
        customName,
        customColor,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`\x1b[38;5;141m[openui-connect]\x1b[0m Starting Claude Code with OpenUI integration`);
  console.log(`\x1b[38;5;245m  Session ID: ${sessionId}\x1b[0m`);
  console.log(`\x1b[38;5;245m  Name: ${customName}\x1b[0m`);
  if (customColor) {
    console.log(`\x1b[38;5;245m  Color: ${customColor}\x1b[0m`);
  }
  console.log(`\x1b[38;5;245m  Plugin: ${pluginDir}\x1b[0m`);
  console.log(`\x1b[38;5;245m  Server: http://${HOST}:${PORT}\x1b[0m`);
  console.log();

  // Check if server is running
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log(`\x1b[38;5;208m[warning]\x1b[0m OpenUI server not detected at http://${HOST}:${PORT}`);
    console.log(`\x1b[38;5;245m  Session will auto-register when the server starts.\x1b[0m`);
    console.log();
  } else {
    console.log(`\x1b[38;5;82m[connected]\x1b[0m OpenUI server detected`);

    // Pre-register if requested
    if (preRegister) {
      const registered = await registerSession();
      if (registered) {
        console.log(`\x1b[38;5;82m[registered]\x1b[0m Session pre-registered with OpenUI`);
      } else {
        console.log(`\x1b[38;5;208m[warning]\x1b[0m Failed to pre-register session`);
      }
    }
    console.log();
  }

  // Build the claude command
  const command = ["claude", "--plugin-dir", pluginDir, ...claudeArgs];

  console.log(`\x1b[38;5;245m  Running: ${command.join(" ")}\x1b[0m`);
  console.log();

  // Spawn Claude with the session ID in the environment
  const proc = Bun.spawn(command, {
    cwd: CWD,
    stdio: ["inherit", "inherit", "inherit"],
    env: {
      ...process.env,
      OPENUI_SESSION_ID: sessionId!,
      OPENUI_PORT: PORT,
      OPENUI_HOST: HOST,
      OPENUI_SECRET: SECRET,
    },
  });

  // Forward signals
  process.on("SIGINT", () => {
    proc.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    proc.kill("SIGTERM");
  });

  // Wait for Claude to exit
  const exitCode = await proc.exited;
  process.exit(exitCode);
}

main();
