#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# agent-run.sh — Execute one agent run (provider-aware)
#
# Spawned by server.sh for each agent trigger.
# Resolves provider from conversation → agent → system default.
# Creates transactional messages with status lifecycle:
#   pending → processing → streaming → complete|error
#
# Usage:
#   ./agent-run.sh <agent_id> [message_id]
# ═══════════════════════════════════════════════════════════════════

set -uo pipefail

AGENT_ID="${1:-}"
MSG_ID="${2:-}"
ES_URL="${ES_URL:-http://arc3d.master.local/elementStore}"
DEFAULT_PROVIDER="provider:claude-cli"

if [ -z "$AGENT_ID" ]; then
  echo "Usage: $0 <agent_id> [message_id]"
  exit 1
fi

NOW() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
es_get()    { curl -sf "$ES_URL/store/$1/$2" 2>/dev/null; }
es_query()  { curl -sf "$ES_URL/query/$1?$2" 2>/dev/null; }
es_create() { curl -sf -X POST "$ES_URL/store/$1" -H 'Content-Type: application/json' -d "$2" 2>/dev/null; }
es_update() { curl -sf -X PUT "$ES_URL/store/$1/$2" -H 'Content-Type: application/json' -d "$3" 2>/dev/null; }

# ─── Load agent ──────────────────────────────────────────
AGENT_DATA=$(es_get "ai:agent" "$AGENT_ID")
if [ -z "$AGENT_DATA" ] || [ "$AGENT_DATA" = "null" ]; then
  echo "Agent not found: $AGENT_ID"
  exit 1
fi

AGENT_NAME=$(echo "$AGENT_DATA" | jq -r '.name // "?"')
AGENT_PROMPT=$(echo "$AGENT_DATA" | jq -r '.prompt // ""')
AGENT_MODEL=$(echo "$AGENT_DATA" | jq -r '.model // ""')
AGENT_PROVIDER=$(echo "$AGENT_DATA" | jq -r '.provider_id // ""')
SESSION_MODE=$(echo "$AGENT_DATA" | jq -r '.behavior.session_mode // "fresh"')

echo "[$(date '+%H:%M:%S')] Agent: $AGENT_NAME ($AGENT_ID) mode=$SESSION_MODE"

# ─── Resolve provider ────────────────────────────────────
resolve_provider() {
  local conv_id="$1"
  local provider_id=""

  # 1. Conversation-level override
  if [ -n "$conv_id" ] && [ "$conv_id" != "null" ]; then
    provider_id=$(es_get "ai:conversation" "$conv_id" | jq -r '.provider_id // ""' 2>/dev/null)
  fi

  # 2. Agent-level default
  if [ -z "$provider_id" ] || [ "$provider_id" = "null" ]; then
    provider_id="$AGENT_PROVIDER"
  fi

  # 3. System default
  if [ -z "$provider_id" ] || [ "$provider_id" = "null" ]; then
    provider_id="$DEFAULT_PROVIDER"
  fi

  echo "$provider_id"
}

# ─── Provider executors ──────────────────────────────────

execute_claude_cli() {
  local prompt="$1"
  local model="$2"
  local tmpfile="$3"
  local provider_data="$4"

  [ -z "$model" ] || [ "$model" = "null" ] && model=$(echo "$provider_data" | jq -r '.model // "sonnet"')

  echo "[$(date '+%H:%M:%S')] Provider: claude_cli model=$model" >&2
  claude --print --model "$model" --output-format stream-json --verbose <<< "$prompt" > "$tmpfile" 2>/dev/null &
  echo $!
}

execute_anthropic_api() {
  local prompt="$1"
  local model="$2"
  local tmpfile="$3"
  local provider_data="$4"

  [ -z "$model" ] || [ "$model" = "null" ] && model=$(echo "$provider_data" | jq -r '.model // "claude-sonnet-4-20250514"')
  local base_url=$(echo "$provider_data" | jq -r '.base_url // "https://api.anthropic.com"')
  local max_tokens=$(echo "$provider_data" | jq -r '.max_tokens // 8192')
  local api_key="${ANTHROPIC_API_KEY:-}"

  if [ -z "$api_key" ]; then
    echo "[$(date '+%H:%M:%S')] ERROR: ANTHROPIC_API_KEY not set" >&2
    echo '{"error":"ANTHROPIC_API_KEY not set"}' > "$tmpfile"
    echo "0"
    return
  fi

  echo "[$(date '+%H:%M:%S')] Provider: anthropic_api model=$model" >&2

  # Build messages JSON
  local messages_json=$(jq -n --arg content "$prompt" '[{role:"user",content:$content}]')

  curl -sN "$base_url/v1/messages" \
    -H "x-api-key: $api_key" \
    -H "anthropic-version: 2023-06-01" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg model "$model" \
      --argjson max_tokens "$max_tokens" \
      --argjson messages "$messages_json" \
      --arg system "$AGENT_PROMPT" \
      '{model:$model, max_tokens:$max_tokens, messages:$messages, system:$system, stream:true}'
    )" > "$tmpfile" 2>/dev/null &
  echo $!
}

# ─── Stream monitor ──────────────────────────────────────

monitor_claude_cli_stream() {
  local tmpfile="$1"
  local resp_id="$2"
  local pid="$3"
  local last_text=""

  # Wait for process, polling for stream updates
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    if [ -f "$tmpfile" ]; then
      local new_text=$(grep '"type":"assistant"' "$tmpfile" 2>/dev/null | tail -1 | jq -r '.message.content[]? | select(.type=="text") | .text // empty' 2>/dev/null || true)
      if [ -n "$new_text" ] && [ "$new_text" != "$last_text" ]; then
        es_update "ai:message" "$resp_id" "$(jq -n --arg c "$new_text" '{content:$c, status:"streaming"}')" > /dev/null 2>&1
        last_text="$new_text"
        echo "[$(date '+%H:%M:%S')] Streaming: ${#new_text} chars" >&2
      fi
    fi
  done

  wait "$pid" 2>/dev/null

  # Final read — catches fast completions that the loop missed
  if [ -f "$tmpfile" ]; then
    local new_text=$(grep '"type":"assistant"' "$tmpfile" 2>/dev/null | tail -1 | jq -r '.message.content[]? | select(.type=="text") | .text // empty' 2>/dev/null || true)
    if [ -n "$new_text" ] && [ "$new_text" != "$last_text" ]; then
      es_update "ai:message" "$resp_id" "$(jq -n --arg c "$new_text" '{content:$c, status:"streaming"}')" > /dev/null 2>&1
      last_text="$new_text"
      echo "[$(date '+%H:%M:%S')] Final stream read: ${#new_text} chars" >&2
    fi
  fi

  # Get final result from stream-json output
  local result=""
  if [ -f "$tmpfile" ]; then
    result=$(grep '"type":"result"' "$tmpfile" 2>/dev/null | tail -1 | jq -r '.result // ""' 2>/dev/null || true)
    [ -z "$result" ] && result="$last_text"
  fi
  [ -z "$result" ] && result="[no response]"

  echo "$result"
}

monitor_anthropic_api_stream() {
  local tmpfile="$1"
  local resp_id="$2"
  local pid="$3"
  local accumulated=""

  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    if [ -f "$tmpfile" ]; then
      local new_text=$(grep 'event: content_block_delta' -A1 "$tmpfile" 2>/dev/null | grep 'data:' | jq -r '.delta.text // empty' 2>/dev/null | tr -d '\n' || true)
      if [ -n "$new_text" ] && [ "$new_text" != "$accumulated" ]; then
        accumulated="$new_text"
        es_update "ai:message" "$resp_id" "$(jq -n --arg c "$accumulated" '{content:$c, status:"streaming"}')" > /dev/null 2>&1
        echo "[$(date '+%H:%M:%S')] Streaming: ${#accumulated} chars" >&2
      fi
    fi
  done

  wait "$pid" 2>/dev/null

  local result=""
  if [ -f "$tmpfile" ]; then
    result=$(grep 'data:' "$tmpfile" 2>/dev/null | jq -r 'select(.type=="content_block_delta") | .delta.text // empty' 2>/dev/null | tr -d '\n' || true)
    [ -z "$result" ] && result="$accumulated"
  fi
  [ -z "$result" ] && result="[no response]"

  echo "$result"
}

# ─── Find messages to process ────────────────────────────

if [ -n "$MSG_ID" ]; then
  MSG_RAW=$(curl -sf "$ES_URL/store/ai:message/$MSG_ID" 2>/dev/null)
  if [ -n "$MSG_RAW" ] && echo "$MSG_RAW" | jq -e '.id' > /dev/null 2>&1; then
    MESSAGES=$(echo "$MSG_RAW" | jq -c '.')
    echo "[$(date '+%H:%M:%S')] Found message: $MSG_ID"
  else
    echo "[$(date '+%H:%M:%S')] Message not found: $MSG_ID"
    MESSAGES=""
  fi
else
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

# ─── Process each message ────────────────────────────────

echo "$MESSAGES" | while IFS= read -r msg_json; do
  [ -z "$msg_json" ] && continue

  msg_id=$(echo "$msg_json" | jq -r '.id')
  msg_content=$(echo "$msg_json" | jq -r '.content // ""')
  conv_id=$(echo "$msg_json" | jq -r '.conversation_id // ""')

  echo "[$(date '+%H:%M:%S')] Processing: ${msg_content:0:60}..."

  # ── TX: Mark input message → processing ──
  es_update "ai:message" "$msg_id" '{"status":"processing"}' > /dev/null 2>&1

  # ── Create or reuse conversation ──
  if [ -z "$conv_id" ] || [ "$conv_id" = "null" ]; then
    conv_id=$(es_create "ai:conversation" "$(jq -n \
      --arg agent "$AGENT_ID" --arg now "$(NOW)" \
      '{class_id:"ai:conversation", agent_id:$agent, user_id:"system", title:"Chat", status:"active", created:$now}'
    )" | jq -r '.id // ""' 2>/dev/null)
    es_update "ai:message" "$msg_id" "{\"conversation_id\":\"$conv_id\"}" > /dev/null 2>&1
  fi

  # ── Update conversation status → processing ──
  es_update "ai:conversation" "$conv_id" '{"status":"processing"}' > /dev/null 2>&1

  # ── Resolve provider ──
  provider_id=$(resolve_provider "$conv_id")
  PROVIDER_DATA=$(es_get "ai:provider" "$provider_id" 2>/dev/null || echo '{}')
  provider_type=$(echo "$PROVIDER_DATA" | jq -r '.provider_type // "claude_cli"')
  model="$AGENT_MODEL"
  [ -z "$model" ] || [ "$model" = "null" ] && model=$(echo "$PROVIDER_DATA" | jq -r '.model // "sonnet"')

  echo "[$(date '+%H:%M:%S')] Provider: $provider_id ($provider_type) model=$model"

  # ── TX: Create response message → streaming ──
  resp_id=$(es_create "ai:message" "$(jq -n \
    --arg conv "$conv_id" --arg agent "$AGENT_ID" --arg ref "$msg_id" --arg now "$(NOW)" --arg prov "$provider_id" --arg mdl "$model" \
    '{class_id:"ai:message", conversation_id:$conv, user_id:"system", agent_id:$agent, role:"assistant", content:"", references:[$ref], status:"streaming", metadata:{provider_id:$prov, model:$mdl}, created:$now}'
  )" | jq -r '.id // ""' 2>/dev/null)

  echo "[$(date '+%H:%M:%S')] Response: $resp_id (streaming via $provider_type)"

  # ── Build prompt with context ──
  tasks=$(es_query "ai:task" "status=open&_sort=step&_limit=15" | jq -c '[.[] | {id,name,priority,status,project}]' 2>/dev/null || echo '[]')
  findings=$(es_query "es:finding" "status=open&_limit=10" | jq -c '[.[] | {id,name,severity}]' 2>/dev/null || echo '[]')
  questions=$(es_query "ai:question" "status=open&_limit=10" | jq -c '[.[] | {id,from_agent,to_title,question}]' 2>/dev/null || echo '[]')

  # Conversation history (last N messages in this conversation for context)
  conv_history=""
  if [ -n "$conv_id" ] && [ "$conv_id" != "null" ]; then
    conv_history=$(es_query "ai:message" "conversation_id=$conv_id&_sort=created&_order=asc&_limit=10" | jq -c '[.[] | {role,content,status,agent_id}]' 2>/dev/null || echo '[]')
  fi

  # ── Shared base prompt (all agents get this) ──
  read -r -d '' BASE_PROMPT << 'BASEPROMPT' || true
# AI Company — Agent System

You are an agent in the AI Company system. You work through elementStore — all data is objects in the store.
Everything — tasks, decisions, findings, questions, approvals — is an ai:message with a results[] array.
Your conversation_id is your session_id (they are the same concept).

## How to interact

**Read from the store** (curl GET):
- GET /store/{class_id}                — list all objects of a class
- GET /store/{class_id}/{id}           — get one object
- GET /query/{class_id}?field=value    — query with filters

**Write to the store** (curl POST/PUT):
- POST /store/{class_id}               — create object (JSON body with class_id)
- PUT  /store/{class_id}/{id}          — update object (partial JSON body)

## Output format

Your response is an ai:message. Structure it clearly with markdown.

When your response contains actionable items, include them in a results[] array in your message:

**To answer a question:**
Include result: {"result_type":"question","to_title":"owner","question":"...","status":"open"}
Or update existing: PUT /store/ai:message/{id} with answer in results[]

**To propose a decision:**
Include result: {"result_type":"decision","topic":"...","decision":"...","rationale":"...","priority":"P1"}

**To create a task:**
Include result: {"result_type":"task","task_id":"...","action":"create","name":"...","priority":"P1","status":"open"}

**To report a finding:**
Include result: {"result_type":"finding","severity":"high","category":"security","description":"..."}

**To request approval:**
Include result: {"result_type":"approval","reference_id":"...","approved":false,"conditions":"..."}

## Agent Communication Rules
- You can READ any message in your project scope
- You should only REACT to messages where to_agents includes your agent ID
- Post messages with to_agents[] to address specific agents
- Low-risk store-write-only proposals can execute without individual approval

## Rules
- You CAN execute curl commands to read/write the store — the CLI supports tool use
- Always include class_id in POST bodies
- Use the ES_URL provided below for all API calls
- Be concise — focus on actions, not explanations
- Do NOT create standalone ai:question, ai:decision, es:finding, ai:task objects — use ai:message with results[] instead

## Response format
Your response is stored as an ai:message and displayed in a dashboard.
Content is rendered as **markdown** — use headers, lists, bold, code blocks freely.

**IMPORTANT**: Always end your response with a summary block:

---
**Summary**: [1-2 sentence description of what you did this round]
**Actions taken**: [list of store operations: created X, updated Y, answered Z]
**Status**: [done | blocked:reason | needs-approval:what]
BASEPROMPT

  full_prompt="${BASE_PROMPT}

---

# Your Role

${AGENT_PROMPT}

---

# Current Context

ES_URL: ${ES_URL}
Agent ID: ${AGENT_ID}
Date: $(date -u '+%Y-%m-%d')

## Open Tasks
${tasks}

## Open Findings
${findings}

## Open Questions
${questions}

## Conversation History
${conv_history}

---

# Message

${msg_content}"

  # ── Execute via provider ──
  t_start=$(date +%s)
  tmpfile="/tmp/aic-run-${msg_id}-$$"

  case "$provider_type" in
    claude_cli)
      exec_pid=$(execute_claude_cli "$full_prompt" "$model" "$tmpfile" "$PROVIDER_DATA")
      result=$(monitor_claude_cli_stream "$tmpfile" "$resp_id" "$exec_pid")
      ;;
    anthropic_api)
      exec_pid=$(execute_anthropic_api "$full_prompt" "$model" "$tmpfile" "$PROVIDER_DATA")
      result=$(monitor_anthropic_api_stream "$tmpfile" "$resp_id" "$exec_pid")
      ;;
    *)
      echo "[$(date '+%H:%M:%S')] Unknown provider type: $provider_type — falling back to claude_cli"
      exec_pid=$(execute_claude_cli "$full_prompt" "$model" "$tmpfile" "$PROVIDER_DATA")
      result=$(monitor_claude_cli_stream "$tmpfile" "$resp_id" "$exec_pid")
      ;;
  esac

  rm -f "$tmpfile"

  t_end=$(date +%s)
  duration=$((t_end - t_start))

  echo "[$(date '+%H:%M:%S')] Complete: ${#result} chars in ${duration}s"

  # ── TX: Finalize response → complete ──
  es_update "ai:message" "$resp_id" "$(jq -n \
    --arg content "$result" --argjson dur "$duration" --arg mdl "$model" --arg prov "$provider_id" \
    '{content:$content, status:"complete", metadata:{duration_s:$dur, model:$mdl, provider_id:$prov, format:"markdown"}}'
  )" > /dev/null 2>&1

  # ── TX: Mark input → answered ──
  es_update "ai:message" "$msg_id" '{"status":"answered"}' > /dev/null 2>&1

  # ── Update conversation: status → active, auto-title from content ──
  conv_title=$(echo "$result" | head -c 200 | tr '\n' ' ' | sed 's/^[#* -]*//' | head -c 60)
  [ -z "$conv_title" ] && conv_title="Chat"
  es_update "ai:conversation" "$conv_id" "$(jq -n \
    --arg st "active" --arg lm "$(NOW)" --arg title "$conv_title" \
    '{status:$st, last_message:$lm, title:$title}'
  )" > /dev/null 2>&1

  # ── Update agent stats ──
  run_count=$(echo "$AGENT_DATA" | jq -r '.run_count // 0')
  es_update "ai:agent" "$AGENT_ID" "{\"run_count\":$((run_count+1)),\"last_run\":\"$(NOW)\"}" > /dev/null 2>&1

  echo "[$(date '+%H:%M:%S')] Done"
done
