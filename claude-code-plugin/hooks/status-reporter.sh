#!/bin/bash

# OpenUI Status Reporter for Claude Code
# Reports agent status and metrics to OpenUI server via HTTP

# Don't use strict mode - we want to always exit 0
STATUS="${1:-}"
OPENUI_PORT="${OPENUI_PORT:-6969}"
OPENUI_HOST="${OPENUI_HOST:-localhost}"
DEBUG_LOG="${OPENUI_DEBUG_LOG:-/tmp/openui-plugin-debug.log}"
MAX_LOG_SIZE="${OPENUI_MAX_LOG_SIZE:-1048576}"  # 1MB default

# Shared secret for authentication (optional)
OPENUI_SECRET="${OPENUI_SECRET:-}"

# Get OpenUI session ID from environment (passed by OpenUI when spawning the PTY)
OPENUI_SID="${OPENUI_SESSION_ID:-}"

# Rotate log if too large
if [ -f "$DEBUG_LOG" ]; then
  LOG_SIZE=$(stat -f%z "$DEBUG_LOG" 2>/dev/null || stat -c%s "$DEBUG_LOG" 2>/dev/null || echo "0")
  if [ "$LOG_SIZE" -gt "$MAX_LOG_SIZE" ]; then
    mv "$DEBUG_LOG" "${DEBUG_LOG}.old" 2>/dev/null || true
  fi
fi

# Read the hook input from stdin (JSON)
INPUT=$(cat)

# jq is required for reliable JSON handling
if ! command -v jq &> /dev/null; then
  echo "[$(date)] ERROR: jq is required but not installed" >> "$DEBUG_LOG" 2>/dev/null || true
  exit 0
fi

# Extract fields from input JSON
CLAUDE_SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty' 2>/dev/null || echo "")
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // null' 2>/dev/null || echo "null")
STOP_REASON=$(echo "$INPUT" | jq -r '.reason // empty' 2>/dev/null || echo "")
STOP_RESULT=$(echo "$INPUT" | jq -r '.stop_hook_result // empty' 2>/dev/null || echo "")
NOTIFICATION_TYPE=$(echo "$INPUT" | jq -r '.notification // empty' 2>/dev/null || echo "")
NOTIFICATION_MESSAGE=$(echo "$INPUT" | jq -r '.message // empty' 2>/dev/null || echo "")
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
USER_PROMPT=$(echo "$INPUT" | jq -r '.user_prompt // empty' 2>/dev/null | head -c 500 || echo "")
MODEL=$(echo "$INPUT" | jq -r '.model // empty' 2>/dev/null || echo "")
SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.subagent_type // empty' 2>/dev/null || echo "")

# Debug logging
echo "[$(date)] Hook: event=$HOOK_EVENT status=$STATUS tool=$TOOL_NAME openui=$OPENUI_SID" >> "$DEBUG_LOG" 2>/dev/null || true

# Build the JSON payload safely using jq
if [ -n "$STATUS" ]; then
  # Start with required fields using jq for proper escaping
  PAYLOAD=$(jq -n \
    --arg status "$STATUS" \
    --arg openuiSessionId "$OPENUI_SID" \
    --arg claudeSessionId "$CLAUDE_SESSION_ID" \
    --arg cwd "$CWD" \
    '{status: $status, openuiSessionId: $openuiSessionId, claudeSessionId: $claudeSessionId, cwd: $cwd}')

  # Add optional fields using jq
  [ -n "$HOOK_EVENT" ] && PAYLOAD=$(echo "$PAYLOAD" | jq --arg v "$HOOK_EVENT" '. + {hookEvent: $v}')
  [ -n "$TOOL_NAME" ] && PAYLOAD=$(echo "$PAYLOAD" | jq --arg v "$TOOL_NAME" '. + {toolName: $v}')
  [ -n "$STOP_REASON" ] && PAYLOAD=$(echo "$PAYLOAD" | jq --arg v "$STOP_REASON" '. + {stopReason: $v}')
  [ -n "$STOP_RESULT" ] && PAYLOAD=$(echo "$PAYLOAD" | jq --arg v "$STOP_RESULT" '. + {stopResult: $v}')
  [ -n "$NOTIFICATION_TYPE" ] && PAYLOAD=$(echo "$PAYLOAD" | jq --arg v "$NOTIFICATION_TYPE" '. + {notificationType: $v}')
  [ -n "$NOTIFICATION_MESSAGE" ] && PAYLOAD=$(echo "$PAYLOAD" | jq --arg v "$NOTIFICATION_MESSAGE" '. + {notificationMessage: $v}')
  [ -n "$TRANSCRIPT_PATH" ] && PAYLOAD=$(echo "$PAYLOAD" | jq --arg v "$TRANSCRIPT_PATH" '. + {transcriptPath: $v}')
  [ -n "$MODEL" ] && PAYLOAD=$(echo "$PAYLOAD" | jq --arg v "$MODEL" '. + {model: $v}')
  [ -n "$SUBAGENT_TYPE" ] && PAYLOAD=$(echo "$PAYLOAD" | jq --arg v "$SUBAGENT_TYPE" '. + {subagentType: $v}')
  [ -n "$USER_PROMPT" ] && PAYLOAD=$(echo "$PAYLOAD" | jq --arg v "$USER_PROMPT" '. + {userPrompt: $v}')

  # Add tool input as raw JSON if present and valid
  if [ "$TOOL_INPUT" != "null" ] && [ -n "$TOOL_INPUT" ]; then
    PAYLOAD=$(echo "$PAYLOAD" | jq --argjson v "$TOOL_INPUT" '. + {toolInput: $v}')
  fi

  # Add auth header if secret is configured
  AUTH_HEADER=""
  if [ -n "$OPENUI_SECRET" ]; then
    AUTH_HEADER="-H \"X-OpenUI-Secret: ${OPENUI_SECRET}\""
  fi

  # Send to OpenUI server with retry logic
  MAX_RETRIES=2
  RETRY_DELAY=0.5
  for i in $(seq 1 $MAX_RETRIES); do
    if [ -n "$AUTH_HEADER" ]; then
      RESPONSE=$(curl -s -X POST "http://${OPENUI_HOST}:${OPENUI_PORT}/api/status-update" \
        -H "Content-Type: application/json" \
        -H "X-OpenUI-Secret: ${OPENUI_SECRET}" \
        -d "$PAYLOAD" \
        --max-time 2 2>&1)
    else
      RESPONSE=$(curl -s -X POST "http://${OPENUI_HOST}:${OPENUI_PORT}/api/status-update" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        --max-time 2 2>&1)
    fi
    CURL_EXIT=$?

    if [ $CURL_EXIT -eq 0 ]; then
      echo "[$(date)] Response: $RESPONSE" >> "$DEBUG_LOG" 2>/dev/null || true
      break
    else
      echo "[$(date)] Retry $i/$MAX_RETRIES failed (exit $CURL_EXIT)" >> "$DEBUG_LOG" 2>/dev/null || true
      [ $i -lt $MAX_RETRIES ] && sleep $RETRY_DELAY
    fi
  done
fi

# Always exit successfully so we don't block Claude
exit 0
