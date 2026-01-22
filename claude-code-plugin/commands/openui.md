---
name: openui
description: Connect this Claude Code session to OpenUI for real-time monitoring
---

Connect this session to OpenUI so it appears on the canvas with real-time status updates.

Run this script to register and check connection:

```bash
#!/bin/bash
OPENUI_PORT="${OPENUI_PORT:-6969}"
OPENUI_HOST="${OPENUI_HOST:-localhost}"
CWD="$(pwd)"

echo "Checking OpenUI connection..."
echo ""

# Check if OpenUI server is running
if ! curl -s --max-time 2 "http://${OPENUI_HOST}:${OPENUI_PORT}/api/config" > /dev/null 2>&1; then
  echo "OpenUI server not running at http://${OPENUI_HOST}:${OPENUI_PORT}"
  echo ""
  echo "Start it with: openui"
  exit 1
fi

echo "OpenUI server: http://${OPENUI_HOST}:${OPENUI_PORT}"

# Check if we have a session ID
if [ -n "$OPENUI_SESSION_ID" ]; then
  echo "Session ID: $OPENUI_SESSION_ID (from environment)"
  SESSION_ID="$OPENUI_SESSION_ID"
else
  # Generate one based on timestamp and PID
  SESSION_ID="claude-manual-$(date +%s)-$$"
  echo "Session ID: $SESSION_ID (generated)"
fi

# Register the session
echo ""
echo "Registering session..."
RESPONSE=$(curl -s -X POST "http://${OPENUI_HOST}:${OPENUI_PORT}/api/sessions/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"${SESSION_ID}\",
    \"cwd\": \"${CWD}\",
    \"customName\": \"Claude (connected via /openui)\"
  }")

if echo "$RESPONSE" | grep -q '"sessionId"'; then
  NODE_ID=$(echo "$RESPONSE" | grep -o '"nodeId":"[^"]*"' | cut -d'"' -f4)
  echo "Registered successfully!"
  echo ""
  echo "Your session is now visible at:"
  echo "  http://${OPENUI_HOST}:${OPENUI_PORT}"
  echo ""

  # Check if plugin hooks will work
  if [ -n "$OPENUI_SESSION_ID" ]; then
    echo "Status updates: ENABLED (plugin will report via OPENUI_SESSION_ID)"
  else
    echo "Status updates: LIMITED"
    echo ""
    echo "For full real-time status (running/idle/waiting), restart Claude with:"
    echo "  OPENUI_SESSION_ID=${SESSION_ID} claude --plugin-dir ~/.openui/claude-code-plugin"
    echo ""
    echo "Or use: openui-connect"
  fi
else
  echo "Registration failed:"
  echo "$RESPONSE"
  exit 1
fi
```

This will:
1. Check if OpenUI is running
2. Register your current session
3. Show you the OpenUI URL

**For full status reporting**, you need to have started Claude with the plugin. The easiest way is:
```
openui-connect
```

Or manually:
```
OPENUI_SESSION_ID=my-session claude --plugin-dir ~/.openui/claude-code-plugin
```
