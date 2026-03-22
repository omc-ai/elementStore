#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# agent-run.sh — Execute one agent run (tool-enabled, provider-aware)
#
# Spawned by ws-dispatcher.js or server.sh for each agent trigger.
# Resolves provider from conversation → agent → system default.
# Agents get real tool access (Bash, Read, Edit, etc.) based on their
# tools[] definition. Output is post-processed to update store objects.
#
# Usage:
#   ./agent-run.sh <agent_id> [message_id]
# ═══════════════════════════════════════════════════════════════════

set -uo pipefail

AGENT_ID="${1:-}"
MSG_ID="${2:-}"
ES_URL="${ES_URL:-http://arc3d.master.local/elementStore}"
DEFAULT_PROVIDER="provider:claude-cli"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$AGENT_ID" ]; then
  echo "Usage: $0 <agent_id> [message_id]"
  exit 1
fi

NOW() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
# ES API helpers — strip auth error prefix that server prepends before actual JSON
ESH='-H X-Disable-Ownership:true'
es_get()    { local raw; raw=$(curl -s -H 'X-Disable-Ownership: true' "$ES_URL/query/$1?id=$(echo "$2" | sed 's/:/%3A/g')&_limit=1" 2>/dev/null); echo "$raw" | sed 's/^{"error":"[^"]*"}//g' | jq -c '.[0] // empty' 2>/dev/null; }
es_query()  { local raw; raw=$(curl -s -H 'X-Disable-Ownership: true' "$ES_URL/query/$1?$2" 2>/dev/null); echo "$raw" | sed 's/^{"error":"[^"]*"}//g'; }
es_create() { local raw; raw=$(curl -s -X POST -H 'Content-Type: application/json' -H 'X-Disable-Ownership: true' -H 'X-Allow-Custom-Ids: true' "$ES_URL/store/$1" -d "$2" 2>/dev/null); echo "$raw" | sed 's/^{"error":"[^"]*"}//g'; }
es_update() { local raw; raw=$(curl -s -X PUT -H 'Content-Type: application/json' -H 'X-Disable-Ownership: true' "$ES_URL/store/$1/$2" -d "$3" 2>/dev/null); echo "$raw" | sed 's/^{"error":"[^"]*"}//g'; }

# ─── Load agent ──────────────────────────────────────────
# Use query instead of direct GET to avoid URL encoding issues with colons in IDs
AGENT_DATA=$(curl -sf "$ES_URL/query/ai:agent?id=$AGENT_ID&_limit=1" 2>/dev/null | jq -c '.[0] // empty' 2>/dev/null)
if [ -z "$AGENT_DATA" ] || [ "$AGENT_DATA" = "null" ]; then
  echo "Agent not found: $AGENT_ID"
  exit 1
fi

AGENT_NAME=$(echo "$AGENT_DATA" | jq -r '.name // "?"')
AGENT_PROMPT=$(echo "$AGENT_DATA" | jq -r '.prompt // ""')
AGENT_MODEL=$(echo "$AGENT_DATA" | jq -r '.model // ""')
AGENT_PROVIDER=$(echo "$AGENT_DATA" | jq -r '.provider_id // ""')
SESSION_MODE=$(echo "$AGENT_DATA" | jq -r '.behavior.session_mode // "fresh"')
AGENT_TOOLS=$(echo "$AGENT_DATA" | jq -r '(.tools // []) | join(",")')
MAX_BUDGET=$(echo "$AGENT_DATA" | jq -r '.behavior.max_budget_usd // 1.00')

echo "[$(date '+%H:%M:%S')] Agent: $AGENT_NAME ($AGENT_ID) mode=$SESSION_MODE tools=$AGENT_TOOLS"

# ─── Load prompt from file if available ──────────────────
load_prompt_file() {
  local agent_name="$1"
  local prompt_file="$SCRIPT_DIR/prompts/${agent_name}.md"
  if [ -f "$prompt_file" ]; then
    cat "$prompt_file"
  else
    echo ""
  fi
}

# Try to load prompt from file (falls back to agent object prompt)
PROMPT_FILE_CONTENT=$(load_prompt_file "$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')")
if [ -n "$PROMPT_FILE_CONTENT" ]; then
  AGENT_PROMPT="$PROMPT_FILE_CONTENT"
fi

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

# ─── Build scoped context ────────────────────────────────
# Each agent only sees data relevant to them, not everything
build_agent_context() {
  local context=""

  # Read context_filter from agent definition
  local scope
  scope=$(echo "$AGENT_DATA" | jq -r '.context_filter.scope // "all"')

  # Tasks — scoped to agent or all
  local tasks
  case "$scope" in
    assigned)
      tasks=$(es_query "ai:task" "agent_id=$AGENT_ID&_sort=priority&_limit=10" | jq -c '[.[] | {id,name,priority,status,project,retry_count}]' 2>/dev/null || echo '[]')
      ;;
    review)
      tasks=$(es_query "ai:task" "status=review&_sort=priority&_limit=10" | jq -c '[.[] | {id,name,priority,status,completed_by,project}]' 2>/dev/null || echo '[]')
      ;;
    *)
      tasks=$(es_query "ai:task" "status=open&status=assigned&status=in_progress&status=review&_sort=priority&_limit=15" | jq -c '[.[] | {id,name,priority,status,agent_id,project}]' 2>/dev/null || echo '[]')
      ;;
  esac

  # Findings — relevant to this agent or all open
  local findings
  findings=$(es_query "es:finding" "status=open&_limit=10" | jq -c '[.[] | {id,name,severity,category}]' 2>/dev/null || echo '[]')

  # Questions — only those directed to this agent
  local questions
  questions=$(es_query "ai:question" "to_agents=$AGENT_ID&status=open&_limit=10" | jq -c '[.[] | {id,from_agent,question,status}]' 2>/dev/null || echo '[]')

  context="## Your Tasks
${tasks}

## Open Findings
${findings}

## Questions For You
${questions}"

  echo "$context"
}

# ─── Provider executors ──────────────────────────────────

execute_claude_cli() {
  local user_message="$1"
  local model="$2"
  local tmpfile="$3"
  local provider_data="$4"
  local system_prompt="$5"
  local context="$6"

  [ -z "$model" ] || [ "$model" = "null" ] && model=$(echo "$provider_data" | jq -r '.model // "sonnet"')

  # Build tools flag from agent definition
  local tools_args=""
  if [ -n "$AGENT_TOOLS" ] && [ "$AGENT_TOOLS" != "" ]; then
    tools_args="--allowedTools $AGENT_TOOLS"
  fi

  echo "[$(date '+%H:%M:%S')] Provider: claude_cli model=$model tools=[$AGENT_TOOLS] budget=\$$MAX_BUDGET" >&2

  echo "$user_message" | claude --print \
    --model "$model" \
    --output-format stream-json \
    --verbose \
    --system-prompt "$system_prompt" \
    --append-system-prompt "$context" \
    --max-budget-usd "$MAX_BUDGET" \
    $tools_args > "$tmpfile" 2>/dev/null &
  echo $!
}

execute_anthropic_api() {
  local user_message="$1"
  local model="$2"
  local tmpfile="$3"
  local provider_data="$4"
  local system_prompt="$5"
  local context="$6"

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

  local full_system="${system_prompt}

${context}"
  local messages_json=$(jq -n --arg content "$user_message" '[{role:"user",content:$content}]')

  curl -sN "$base_url/v1/messages" \
    -H "x-api-key: $api_key" \
    -H "anthropic-version: 2023-06-01" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg model "$model" \
      --argjson max_tokens "$max_tokens" \
      --argjson messages "$messages_json" \
      --arg system "$full_system" \
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
  local last_update=0

  # Wait for process, polling for stream updates
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    if [ -f "$tmpfile" ]; then
      local new_text=$(grep '"type":"assistant"' "$tmpfile" 2>/dev/null | tail -1 | jq -r '.message.content[]? | select(.type=="text") | .text // empty' 2>/dev/null || true)
      if [ -n "$new_text" ] && [ "$new_text" != "$last_text" ]; then
        # Throttle updates to every 2 seconds
        local now_ts=$(date +%s)
        if [ $((now_ts - last_update)) -ge 2 ]; then
          es_update "ai:message" "$resp_id" "$(jq -n --arg c "$new_text" '{content:$c, status:"streaming"}')" > /dev/null 2>&1
          last_update=$now_ts
        fi
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

# ─── Output post-processing ──────────────────────────────
# Parse agent response and update store objects accordingly

postprocess_response() {
  local result="$1"
  local tmpfile="$2"
  local tool_count=0

  # Count tool uses from stream-json (shows what the agent actually did)
  if [ -f "$tmpfile" ]; then
    tool_count=$(grep -c '"type":"tool_use"' "$tmpfile" 2>/dev/null || echo 0)
  fi

  # Parse task completion signals
  # Agents mark tasks via curl (tool use), but also check text signals
  echo "$result" | grep -oP 'TASK_COMPLETE:\s*\K\S+' 2>/dev/null | while IFS= read -r task_ref; do
    [ -z "$task_ref" ] && continue
    echo "[$(date '+%H:%M:%S')] Post-process: marking $task_ref → review" >&2
    es_update "ai:task" "$task_ref" "$(jq -n --arg by "$AGENT_ID" --arg now "$(NOW)" \
      '{status:"review", completed_by:$by, completed_at:$now}')" > /dev/null 2>&1
  done

  # Parse finding signals (agent should create via curl, but catch text fallback)
  echo "$result" | grep -oP 'FINDING:\s*\K.+' 2>/dev/null | head -3 | while IFS= read -r finding_text; do
    [ -z "$finding_text" ] && continue
    echo "[$(date '+%H:%M:%S')] Post-process: creating finding" >&2
    es_create "es:finding" "$(jq -n --arg desc "$finding_text" --arg agent "$AGENT_ID" --arg now "$(NOW)" \
      '{class_id:"es:finding", name:($desc | .[0:60]), description:$desc, severity:"medium", status:"open", reported_by:$agent, created:$now}')" > /dev/null 2>&1
  done

  # Parse task creation (coordinator creates tasks for developer)
  echo "$result" | grep -oP 'CREATE_TASK:\s*\K.+' 2>/dev/null | head -5 | while IFS= read -r task_line; do
    [ -z "$task_line" ] && continue
    local task_name task_agent task_priority
    task_name=$(echo "$task_line" | sed 's/ *|.*//')
    task_agent=$(echo "$task_line" | grep -oP 'agent:\S+' || echo "agent:developer")
    task_priority=$(echo "$task_line" | grep -oP 'P[0-3]' || echo "P2")
    echo "[$(date '+%H:%M:%S')] Post-process: creating task '$task_name' → $task_agent" >&2
    es_create "ai:task" "$(jq -n \
      --arg name "$task_name" --arg agent "$task_agent" --arg pri "$task_priority" --arg now "$(NOW)" \
      '{class_id:"ai:task", name:$name, agent_id:$agent, priority:$pri, status:"assigned", created:$now}')" > /dev/null 2>&1
  done

  # Parse review verdicts (reviewer approves or rejects)
  echo "$result" | grep -oP 'VERIFIED:\s*\K\S+' 2>/dev/null | while IFS= read -r task_ref; do
    [ -z "$task_ref" ] && continue
    echo "[$(date '+%H:%M:%S')] Post-process: $task_ref → verified" >&2
    es_update "ai:task" "$task_ref" '{"status":"verified"}' > /dev/null 2>&1
  done

  echo "$result" | grep -oP 'REJECTED:\s*\K\S+' 2>/dev/null | while IFS= read -r task_ref; do
    [ -z "$task_ref" ] && continue
    # Increment retry count, reassign to developer
    local retry_count
    retry_count=$(es_get "ai:task" "$task_ref" | jq -r '.retry_count // 0' 2>/dev/null || echo 0)
    retry_count=$((retry_count + 1))
    if [ "$retry_count" -ge 3 ]; then
      echo "[$(date '+%H:%M:%S')] Post-process: $task_ref → failed (max retries)" >&2
      es_update "ai:task" "$task_ref" '{"status":"failed","retry_count":'"$retry_count"'}' > /dev/null 2>&1
    else
      echo "[$(date '+%H:%M:%S')] Post-process: $task_ref → assigned (retry $retry_count)" >&2
      es_update "ai:task" "$task_ref" '{"status":"assigned","retry_count":'"$retry_count"'}' > /dev/null 2>&1
    fi
  done

  echo "$tool_count"
}

# ─── Find messages to process ────────────────────────────

if [ -n "$MSG_ID" ]; then
  MSG_RAW=$(curl -s -H 'X-Disable-Ownership: true' "$ES_URL/query/ai:message?id=$MSG_ID&_limit=1" 2>/dev/null | sed 's/^{"error":"[^"]*"}//g' | jq -c '.[0] // empty' 2>/dev/null)
  if [ -n "$MSG_RAW" ] && [ "$MSG_RAW" != "null" ] && echo "$MSG_RAW" | jq -e '.id' > /dev/null 2>&1; then
    MESSAGES=$(echo "$MSG_RAW" | jq -c '.')
    echo "[$(date '+%H:%M:%S')] Found message: $MSG_ID"
  else
    echo "[$(date '+%H:%M:%S')] Message not found: $MSG_ID"
    MESSAGES=""
  fi
else
  if [ "$AGENT_ID" = "agent:assistant" ] || [ "$AGENT_ID" = "agent:owner" ]; then
    MESSAGES=$(es_query "ai:message" "user_id=owner&role=user&status=pending&_sort=created&_order=asc&_limit=5" | jq -r '.[] | @json' 2>/dev/null)
  else
    MESSAGES=$(es_query "ai:message" "to_agents=$AGENT_ID&status=pending&_sort=created&_order=asc&_limit=5" | jq -r '.[] | @json' 2>/dev/null)
  fi
fi

if [ -z "$MESSAGES" ]; then
  echo "No pending messages"
  exit 0
fi

# ─── Build system prompt ─────────────────────────────────
# Shared base loaded from prompts/shared.md, agent-specific from agent object

SHARED_PROMPT=""
if [ -f "$SCRIPT_DIR/prompts/shared.md" ]; then
  SHARED_PROMPT=$(cat "$SCRIPT_DIR/prompts/shared.md")
fi

SYSTEM_PROMPT="${SHARED_PROMPT}

---

# Your Role: ${AGENT_NAME}

${AGENT_PROMPT}"

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

  # ── Build scoped context ──
  agent_context=$(build_agent_context)

  # Conversation history (last N messages for continuity)
  conv_history=""
  if [ -n "$conv_id" ] && [ "$conv_id" != "null" ]; then
    conv_history=$(es_query "ai:message" "conversation_id=$conv_id&_sort=created&_order=asc&_limit=10" | jq -c '[.[] | {role,content,status,agent_id}]' 2>/dev/null || echo '[]')
  fi

  context_block="# Current Context

ES_URL: ${ES_URL}
Agent ID: ${AGENT_ID}
Date: $(date -u '+%Y-%m-%d')

${agent_context}

## Conversation History
${conv_history}"

  # ── Execute via provider ──
  t_start=$(date +%s)
  tmpfile="/tmp/aic-run-${msg_id}-$$"

  case "$provider_type" in
    claude_cli)
      exec_pid=$(execute_claude_cli "$msg_content" "$model" "$tmpfile" "$PROVIDER_DATA" "$SYSTEM_PROMPT" "$context_block")
      result=$(monitor_claude_cli_stream "$tmpfile" "$resp_id" "$exec_pid")
      ;;
    anthropic_api)
      exec_pid=$(execute_anthropic_api "$msg_content" "$model" "$tmpfile" "$PROVIDER_DATA" "$SYSTEM_PROMPT" "$context_block")
      result=$(monitor_anthropic_api_stream "$tmpfile" "$resp_id" "$exec_pid")
      ;;
    *)
      echo "[$(date '+%H:%M:%S')] Unknown provider type: $provider_type — falling back to claude_cli"
      exec_pid=$(execute_claude_cli "$msg_content" "$model" "$tmpfile" "$PROVIDER_DATA" "$SYSTEM_PROMPT" "$context_block")
      result=$(monitor_claude_cli_stream "$tmpfile" "$resp_id" "$exec_pid")
      ;;
  esac

  t_end=$(date +%s)
  duration=$((t_end - t_start))

  echo "[$(date '+%H:%M:%S')] Complete: ${#result} chars in ${duration}s"

  # ── Post-process: parse output, update tasks/findings ──
  tool_count=$(postprocess_response "$result" "$tmpfile")

  rm -f "$tmpfile"

  echo "[$(date '+%H:%M:%S')] Post-process: $tool_count tool uses detected"

  # ── TX: Finalize response → complete ──
  tc="${tool_count:-0}"
  [ -z "$tc" ] || ! [[ "$tc" =~ ^[0-9]+$ ]] && tc=0

  # Write result to temp file to avoid command-line length limits
  local result_file="/tmp/aic-result-$$"
  echo "$result" > "$result_file"
  local update_json
  update_json=$(jq -n \
    --rawfile content "$result_file" \
    --argjson dur "$duration" --arg mdl "$model" --arg prov "$provider_id" --argjson tc "$tc" \
    '{content:$content, status:"complete", metadata:{duration_s:$dur, model:$mdl, provider_id:$prov, format:"markdown", tool_uses:$tc}}' 2>/dev/null)

  if [ -n "$update_json" ]; then
    curl -sf -X PUT -H 'Content-Type: application/json' -H 'X-Disable-Ownership: true' \
      "$ES_URL/store/ai:message/$resp_id" -d "$update_json" > /dev/null 2>&1
  else
    # Fallback: save content without metadata
    curl -sf -X PUT -H 'Content-Type: application/json' -H 'X-Disable-Ownership: true' \
      "$ES_URL/store/ai:message/$resp_id" \
      -d "$(jq -n --rawfile c "$result_file" '{content:$c, status:"complete"}')" > /dev/null 2>&1
  fi
  rm -f "$result_file"

  # ── TX: Mark input → answered ──
  curl -sf -X PUT -H 'Content-Type: application/json' -H 'X-Disable-Ownership: true' \
    "$ES_URL/store/ai:message/$msg_id" -d '{"status":"answered"}' > /dev/null 2>&1

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
