#!/bin/bash
# ASI Agent Runner
# Called by scheduler, SSH, or manually.
# Always resumes the same Claude session for continuity.
#
# Usage:
#   ./run.sh                    # Run one loop iteration (resume session)
#   ./run.sh "your message"     # Send a message to the agent
#   ./run.sh --new              # Start a fresh session
#   ./run.sh --stop             # Stop the running agent
#   ./run.sh --status           # Check agent status

set -euo pipefail

ASI_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_FILE="$ASI_DIR/.session_id"
PROMPT_FILE="$ASI_DIR/PROMPT.md"
ENV_FILE="$ASI_DIR/.env"
AGENT_ID="assistant:owner"

# Load environment
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

ES_URL="${ES_URL:-http://localhost:8420}"

# Health check — ES must be up
es_health() {
  if ! curl -sf "$ES_URL/health" > /dev/null 2>&1; then
    echo "[ASI] ERROR: elementStore is not reachable at $ES_URL"
    exit 1
  fi
}

# Get or create session ID
get_session_id() {
  if [ -f "$SESSION_FILE" ]; then
    cat "$SESSION_FILE"
  else
    local sid
    sid=$(uuidgen | tr '[:upper:]' '[:lower:]')
    echo "$sid" > "$SESSION_FILE"
    echo "$sid"
  fi
}

# Get agent name from ES
get_agent_name() {
  curl -sf "$ES_URL/query/ai:assistant?id=$AGENT_ID" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('name','Assistant') if d else 'Assistant')" 2>/dev/null \
    || echo "Assistant"
}

# Get last conversation summary (done since last prompt)
get_last_summary() {
  local last
  last=$(curl -sf "$ES_URL/query/ai:conversation?agent_id=$AGENT_ID&_sort=created&_order=desc&_limit=1" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('title','').split(' | ')[-1] if d else '')" 2>/dev/null) || true
  echo "${last:-first run}"
}

# Register conversation in ES
register_conversation() {
  local session_id="$1"
  local agent_name
  local last_done
  agent_name=$(get_agent_name)
  last_done=$(get_last_summary)
  local now
  now=$(date +%Y-%m-%d\ %H:%M)
  local title="$agent_name $now | $last_done"

  curl -sf -X POST "$ES_URL/store/ai:conversation" \
    -H 'Content-Type: application/json' \
    -d "{
      \"id\": \"asi-session-$session_id\",
      \"class_id\": \"ai:conversation\",
      \"agent_id\": \"$AGENT_ID\",
      \"user_id\": \"owner\",
      \"status\": \"active\",
      \"provider\": \"claude\",
      \"title\": \"$title\",
      \"created\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }" > /dev/null 2>&1 || true
}

# Close conversation in ES
close_conversation() {
  local session_id="$1"
  curl -sf -X PUT "$ES_URL/store/ai:conversation/asi-session-$session_id" \
    -H 'Content-Type: application/json' \
    -d '{"status": "completed"}' > /dev/null 2>&1 || true
}

# --- Commands ---

case "${1:-}" in
  --new)
    es_health
    SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
    echo "$SESSION_ID" > "$SESSION_FILE"
    echo "[ASI] New session: $SESSION_ID"
    shift
    ;;
  --stop)
    es_health
    SESSION_ID=$(get_session_id)
    close_conversation "$SESSION_ID"
    echo "[ASI] Stop signal sent for session: $SESSION_ID"
    exit 0
    ;;
  --status)
    es_health
    echo "[ASI] Active conversations:"
    curl -sf "$ES_URL/query/ai:conversation?status=active&agent_id=$AGENT_ID" | python3 -m json.tool 2>/dev/null || echo "None"
    exit 0
    ;;
esac

# --- Main execution ---

es_health

SESSION_ID=$(get_session_id)
PROMPT=$(cat "$PROMPT_FILE")

# Register in ES
register_conversation "$SESSION_ID" "ASI Loop — $(date +%Y-%m-%d\ %H:%M)"

# Build claude command
CMD=(
  claude
  --print
  --session-id "$SESSION_ID"
  --model sonnet
  --dangerously-skip-permissions
  --max-budget-usd 5
  --add-dir "$ASI_DIR"
)

# If a message was passed, use it; otherwise run the loop
if [ $# -gt 0 ]; then
  FULL_PROMPT="$PROMPT

---
## Owner Message
$*"
else
  FULL_PROMPT="$PROMPT

---
## Loop Iteration
Run one full loop iteration. Follow the rules. Close all tasks."
fi

echo "[ASI] Session: $SESSION_ID"
echo "[ASI] ES: $ES_URL"
echo "[ASI] Starting..."
echo ""

OUTPUT=$(echo "$FULL_PROMPT" | "${CMD[@]}" 2>&1) || true
EXIT_CODE=$?
echo "$OUTPUT"

# Capture output summary from the last line (agent's response footer)
# Agent ends with: [Round: N | Session: id | Tasks: x/y | summary]
SUMMARY=$(echo "$OUTPUT" 2>/dev/null | tail -5 | grep -o '\|[^|]*\]$' | tr -d '|]' | xargs || echo "completed")

# Update conversation title with what was done
AGENT_NAME=$(get_agent_name)
NOW=$(date +%Y-%m-%d\ %H:%M)
curl -sf -X PUT "$ES_URL/store/ai:conversation/asi-session-$SESSION_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"status\": \"completed\", \"title\": \"$AGENT_NAME $NOW | $SUMMARY\", \"last_message\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /dev/null 2>&1 || true

echo ""
echo "[ASI] Loop complete. Exit code: $EXIT_CODE"
