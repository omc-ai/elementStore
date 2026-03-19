#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# aic-agent-run.sh — Execute one agent run
#
# Spawned by aic-api.sh for each agent trigger.
# Reads pending messages, sends to claude, streams response.
# Claude writes directly to elementStore via tools/API.
#
# Usage:
#   ./aic-agent-run.sh <agent_id> [message_id]
#
# If message_id provided: respond to that specific message
# If not: process all pending messages for this agent
# ═══════════════════════════════════════════════════════════════════

set -uo pipefail

AGENT_ID="${1:-}"
MSG_ID="${2:-}"
ES_URL="${ES_URL:-http://arc3d.master.local/elementStore}"

if [ -z "$AGENT_ID" ]; then
  echo "Usage: $0 <agent_id> [message_id]"
  exit 1
fi

NOW() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
es_get()    { curl -sf "$ES_URL/store/$1/$2" 2>/dev/null; }
es_query()  { curl -sf "$ES_URL/query/$1?$2" 2>/dev/null; }
es_create() { curl -sf -X POST "$ES_URL/store/$1" -H 'Content-Type: application/json' -d "$2" 2>/dev/null; }
es_update() { curl -sf -X PUT "$ES_URL/store/$1/$2" -H 'Content-Type: application/json' -d "$3" 2>/dev/null; }

# Load agent config
AGENT_DATA=$(es_get "ai:agent" "$AGENT_ID")
if [ -z "$AGENT_DATA" ] || [ "$AGENT_DATA" = "null" ]; then
  echo "Agent not found: $AGENT_ID"
  exit 1
fi

AGENT_NAME=$(echo "$AGENT_DATA" | jq -r '.name // "?"')
AGENT_PROMPT=$(echo "$AGENT_DATA" | jq -r '.prompt // ""')
SESSION_MODE=$(echo "$AGENT_DATA" | jq -r '.behavior.session_mode // "fresh"')

echo "[$(date '+%H:%M:%S')] Agent: $AGENT_NAME ($AGENT_ID) mode=$SESSION_MODE"

# Find messages to process
if [ -n "$MSG_ID" ]; then
  # Fetch specific message by ID
  MSG_RAW=$(curl -sf "$ES_URL/store/ai:message/$MSG_ID" 2>/dev/null)
  if [ -n "$MSG_RAW" ] && echo "$MSG_RAW" | jq -e '.id' > /dev/null 2>&1; then
    MESSAGES=$(echo "$MSG_RAW" | jq -c '.')
    echo "[$(date '+%H:%M:%S')] Found message: $MSG_ID"
  else
    echo "[$(date '+%H:%M:%S')] Message not found: $MSG_ID"
    MESSAGES=""
  fi
else
  # Find pending messages for this agent
  if [ "$AGENT_ID" = "agent:owner" ]; then
    MESSAGES=$(es_query "ai:message" "user_id=owner&role=user&status=pending&_sort=created&_order=asc&_limit=5" | jq -r '.[] | @json' 2>/dev/null)
  else
    MESSAGES=$(es_query "ai:message" "to_agents=$AGENT_ID&status=pending&_sort=created&_order=asc&_limit=5" | jq -r '.[] | @json' 2>/dev/null)
  fi
fi

if [ -z "$MESSAGES" ]; then
  echo "No pending messages"
  exit 0
fi

# Process each message
echo "$MESSAGES" | while IFS= read -r msg_json; do
  [ -z "$msg_json" ] && continue

  msg_id=$(echo "$msg_json" | jq -r '.id')
  msg_content=$(echo "$msg_json" | jq -r '.content // ""')
  conv_id=$(echo "$msg_json" | jq -r '.conversation_id // ""')

  echo "[$(date '+%H:%M:%S')] Processing: ${msg_content:0:60}..."

  # Mark processing
  es_update "ai:message" "$msg_id" '{"status":"processing"}' > /dev/null 2>&1

  # Create or reuse conversation
  if [ -z "$conv_id" ] || [ "$conv_id" = "null" ]; then
    conv_id=$(es_create "ai:conversation" "$(jq -n \
      --arg agent "$AGENT_ID" --arg now "$(NOW)" \
      '{class_id:"ai:conversation", agent_id:$agent, user_id:"system", title:"Chat", status:"active", created:$now}'
    )" | jq -r '.id // ""' 2>/dev/null)
    es_update "ai:message" "$msg_id" "{\"conversation_id\":\"$conv_id\"}" > /dev/null 2>&1
  fi

  # Create response message (streaming)
  resp_id=$(es_create "ai:message" "$(jq -n \
    --arg conv "$conv_id" --arg agent "$AGENT_ID" --arg ref "$msg_id" --arg now "$(NOW)" \
    '{class_id:"ai:message", conversation_id:$conv, user_id:"system", agent_id:$agent, role:"assistant", content:"", references:[$ref], status:"streaming", created:$now}'
  )" | jq -r '.id // ""' 2>/dev/null)

  echo "[$(date '+%H:%M:%S')] Response: $resp_id (streaming)"

  # Build prompt with context
  tasks=$(es_query "ai:task" "status=open&_sort=step&_limit=15" | jq -c '[.[] | {id,name,priority,status,project}]' 2>/dev/null || echo '[]')
  findings=$(es_query "es:finding" "status=open&_limit=10" | jq -c '[.[] | {id,name,severity}]' 2>/dev/null || echo '[]')

  full_prompt="${AGENT_PROMPT}

ES_URL=${ES_URL}

Open tasks: ${tasks}
Open findings: ${findings}

User message: ${msg_content}"

  # Execute claude with streaming
  t_start=$(date +%s)
  tmpfile="/tmp/aic-run-${msg_id}-$$"

  claude --print --model sonnet --output-format stream-json <<< "$full_prompt" > "$tmpfile" 2>/dev/null &
  claude_pid=$!

  # Monitor stream, update message progressively
  last_text=""
  while kill -0 "$claude_pid" 2>/dev/null; do
    sleep 1
    if [ -f "$tmpfile" ]; then
      # Get latest text from assistant messages
      new_text=$(grep '"type":"assistant"' "$tmpfile" 2>/dev/null | tail -1 | jq -r '.message.content[]? | select(.type=="text") | .text // empty' 2>/dev/null || true)
      if [ -n "$new_text" ] && [ "$new_text" != "$last_text" ]; then
        es_update "ai:message" "$resp_id" "$(jq -n --arg c "$new_text" '{content:$c}')" > /dev/null 2>&1
        last_text="$new_text"
        echo "[$(date '+%H:%M:%S')] Streaming: ${#new_text} chars"
      fi
    fi
  done

  wait "$claude_pid" 2>/dev/null

  # Get final result
  result=""
  if [ -f "$tmpfile" ]; then
    result=$(grep '"type":"result"' "$tmpfile" 2>/dev/null | tail -1 | jq -r '.result // ""' 2>/dev/null || true)
    [ -z "$result" ] && result="$last_text"
    rm -f "$tmpfile"
  fi
  [ -z "$result" ] && result="[no response]"

  t_end=$(date +%s)
  duration=$((t_end - t_start))

  echo "[$(date '+%H:%M:%S')] Complete: ${#result} chars in ${duration}s"

  # Final update
  es_update "ai:message" "$resp_id" "$(jq -n \
    --arg content "$result" --argjson dur "$duration" \
    '{content:$content, status:"complete", metadata:{duration_s:$dur, model:"sonnet"}}'
  )" > /dev/null 2>&1

  # Mark original answered
  es_update "ai:message" "$msg_id" '{"status":"answered"}' > /dev/null 2>&1

  # Update conversation
  es_update "ai:conversation" "$conv_id" "{\"last_message\":\"$(NOW)\"}" > /dev/null 2>&1

  # Update agent run count
  run_count=$(echo "$AGENT_DATA" | jq -r '.run_count // 0')
  es_update "ai:agent" "$AGENT_ID" "{\"run_count\":$((run_count+1)),\"last_run\":\"$(NOW)\"}" > /dev/null 2>&1

  echo "[$(date '+%H:%M:%S')] Done"
done
