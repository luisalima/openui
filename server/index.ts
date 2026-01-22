import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { apiRoutes } from "./routes/api";
import { sessions, restoreSessions } from "./services/sessionManager";
import { saveState } from "./services/persistence";
import type { WebSocketData } from "./types";

const app = new Hono();
const PORT = Number(process.env.PORT) || 6968;
const QUIET = !!process.env.OPENUI_QUIET;

// Conditionally log only in dev mode
const log = QUIET ? () => {} : console.log.bind(console);

// Global control WebSocket clients (for broadcasting session events)
export const controlClients = new Set<ServerWebSocket<WebSocketData>>();

// Broadcast to all control clients
export function broadcastControl(event: { type: string; [key: string]: any }) {
  const message = JSON.stringify(event);
  for (const client of controlClients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

// Middleware
app.use("*", cors());

// API Routes
app.route("/api", apiRoutes);

// Serve static files
app.use("/*", serveStatic({ root: "./client/dist" }));

// WebSocket server
Bun.serve<WebSocketData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // Global control WebSocket for session events
    if (url.pathname === "/ws/control") {
      const upgraded = server.upgrade(req, { data: { sessionId: "_control" } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Per-session WebSocket for terminal I/O
    if (url.pathname === "/ws") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) return new Response("Session ID required", { status: 400 });

      const session = sessions.get(sessionId);
      if (!session) return new Response("Session not found", { status: 404 });

      const upgraded = server.upgrade(req, { data: { sessionId } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      const { sessionId } = ws.data;

      // Handle control WebSocket
      if (sessionId === "_control") {
        controlClients.add(ws);
        log(`\x1b[38;5;245m[ws]\x1b[0m Control client connected (${controlClients.size} total)`);
        return;
      }

      const session = sessions.get(sessionId);

      if (!session) {
        ws.close(1008, "Session not found");
        return;
      }

      log(`\x1b[38;5;245m[ws]\x1b[0m Connected to ${sessionId}`);
      session.clients.add(ws);

      if (session.outputBuffer.length > 0 && !session.isRestored && session.pty) {
        const history = session.outputBuffer.join("");
        ws.send(JSON.stringify({ type: "output", data: history }));
      } else if (session.isRestored || !session.pty) {
        ws.send(JSON.stringify({
          type: "output",
          data: "\x1b[38;5;245mSession was disconnected.\r\nClick \"Spawn Fresh\" to start a new session.\x1b[0m\r\n"
        }));
      }

      ws.send(JSON.stringify({
        type: "status",
        status: session.status,
        isRestored: session.isRestored
      }));
    },
    message(ws, message) {
      const { sessionId } = ws.data;

      // Control clients don't send messages (yet)
      if (sessionId === "_control") return;

      const session = sessions.get(sessionId);
      if (!session) return;

      try {
        const msg = JSON.parse(message.toString());
        switch (msg.type) {
          case "input":
            if (session.pty) {
              session.pty.write(msg.data);
              session.lastInputTime = Date.now();
            }
            break;
          case "resize":
            if (session.pty) {
              session.pty.resize(msg.cols, msg.rows);
            }
            break;
        }
      } catch (e) {
        if (!QUIET) console.error("Error processing message:", e);
      }
    },
    close(ws) {
      const { sessionId } = ws.data;

      // Handle control client disconnect
      if (sessionId === "_control") {
        controlClients.delete(ws);
        log(`\x1b[38;5;245m[ws]\x1b[0m Control client disconnected (${controlClients.size} total)`);
        return;
      }

      const session = sessions.get(sessionId);
      if (session) {
        session.clients.delete(ws);
        log(`\x1b[38;5;245m[ws]\x1b[0m Disconnected from ${sessionId}`);
      }
    },
  },
});

// Restore sessions on startup
restoreSessions();

log(`\x1b[38;5;141m[server]\x1b[0m Running on http://localhost:${PORT}`);
log(`\x1b[38;5;245m[server]\x1b[0m Launch directory: ${process.env.LAUNCH_CWD || process.cwd()}`);

// Auto-open browser if OPENUI_OPEN_BROWSER is set
if (process.env.OPENUI_OPEN_BROWSER === "1") {
  setTimeout(async () => {
    const { $ } = await import("bun");
    const platform = process.platform;
    const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
    try {
      await $`${cmd} http://localhost:${PORT}`.quiet();
    } catch {
      // Ignore errors
    }
  }, 500);
}

// Periodic state save
setInterval(() => {
  saveState(sessions);
}, 30000);

// Cleanup on exit
process.on("SIGINT", () => {
  log("\n\x1b[38;5;245m[server]\x1b[0m Saving state before exit...");
  saveState(sessions);
  for (const [, session] of sessions) {
    if (session.pty) session.pty.kill();
    if (session.stateTrackerPty) session.stateTrackerPty.kill();
  }
  process.exit(0);
});
