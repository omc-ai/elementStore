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
ES_TOKEN="${ES_TOKEN:-}"         # Bearer token for ES endpoints
DEFAULT_PROVIDER="provider:claude-cli"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ES_TOKEN_FILE="${ES_TOKEN_FILE:-${HOME}/.es/token.json}"

# Auto-load cached token if ES_TOKEN not set
if [ -z "$ES_TOKEN" ] && [ -f "$ES_TOKEN_FILE" ]; then
  ES_TOKEN=$(python3 -c "import json; print(json.load(open('$ES_TOKEN_FILE')).get('accessToken',''))" 2>/dev/null || true)
fi

if [ -z "$AGENT_ID" ]; then
  echo "Usage: $0 <agent_id> [message_id]"
  exit 1
fi

NOW() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
# ES API helpers — include Bearer token when available
_es_auth() { [ -n "$ES_TOKEN" ] && printf -- '-H\nAuthorization: Bearer %s' "$ES_TOKEN" || true; }
_ES_AUTH_ARGS=()
[ -n "$ES_TOKEN" ] && _ES_AUTH_ARGS=(-H "Authorization: Bearer $ES_TOKEN")
es_get()    { local raw; raw=$(curl -s "${_ES_AUTH_ARGS[@]}" "$ES_URL/query/$1?id=$(echo "$2" | sed 's/:/%3A/g')&_limit=1" 2>/dev/null || true); echo "$raw" | sed 's/^{"error":"[^"]*"}//g' | jq -c '.[0] // empty' 2>/dev/null || true; }
es_query()  { local raw; raw=$(curl -s "${_ES_AUTH_ARGS[@]}" "$ES_URL/query/$1?$2" 2>/dev/null); echo "$raw" | sed 's/^{"error":"[^"]*"}//g'; }
es_create() { local raw; raw=$(curl -s -X POST -H 'Content-Type: application/json' "${_ES_AUTH_ARGS[@]}" -H 'X-Allow-Custom-Ids: true' "$ES_URL/store/$1" -d "$2" 2>/dev/null); echo "$raw" | sed 's/^{"error":"[^"]*"}//g'; }
es_update() { local raw; raw=$(curl -s -X PUT -H 'Content-Type: application/json' "${_ES_AUTH_ARGS[@]}" "$ES_URL/store/$1/$2" -d "$3" 2>/dev/null); echo "$raw" | sed 's/^{"error":"[^"]*"}//g'; }
es_log() { curl -sf -X POST "$ES_URL/store/es:log" -H 'Content-Type: application/json' "${_ES_AUTH_ARGS[@]}" -d "{\"class_id\":\"es:log\",\"level\":\"$1\",\"message\":\"$2\",\"source\":\"${3:-agent-run}\"}" > /dev/null 2>&1; }

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
AGENT_TOOLS=$(echo "$AGENT_DATA" | jq -r '(.tools // []) | join(",")')
MAX_BUDGET=$(echo "$AGENT_DATA" | jq -r '.behavior.max_budget_usd // 1.00')

echo "[$(date '+%H:%M:%S')] Agent: $AGENT_NAME ($AGENT_ID) mode=$SESSION_MODE tools=$AGENT_TOOLS"
es_log "info" "Worker started: $AGENT_NAME ($AGENT_ID) PID=$$" "agent-run"

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

# ─── F4: Context budget helpers ──────────────────────────
# Estimate token count (rough: 1 token ≈ 4 chars)
estimate_tokens() {
  local text="$1"
  echo $(( ${#text} / 4 ))
}

# Max context tokens for this agent (from agent.behavior or default)
MAX_CONTEXT_TOKENS=$(echo "$AGENT_DATA" | jq -r '.behavior.max_context_tokens // 8000')

# Trim a JSON array of objects to fit within a token budget
# Returns a trimmed JSON array
trim_to_budget() {
  local json_array="$1"
  local budget="$2"
  local count
  count=$(echo "$json_array" | jq 'length' 2>/dev/null || echo 0)
  local current="$json_array"
  # Trim from end if over budget
  while [ "$count" -gt 1 ]; do
    local estimated
    estimated=$(estimate_tokens "$current")
    if [ "$estimated" -le "$budget" ]; then
      break
    fi
    count=$((count - 1))
    current=$(echo "$json_array" | jq --argjson n "$count" '.[:$n]' 2>/dev/null || echo '[]')
  done
  echo "$current"
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

  # F4: Context budget — trim tasks and history to stay within token budget
  local tasks_budget=$(( MAX_CONTEXT_TOKENS / 3 ))
  local findings_budget=$(( MAX_CONTEXT_TOKENS / 6 ))
  tasks=$(trim_to_budget "$tasks" "$tasks_budget")
  findings=$(trim_to_budget "$findings" "$findings_budget")

  # F6: Memory Agent — inject relevant memories into context
  local memories=""
  local mem_raw
  mem_raw=$(es_query "ai:memory" "agent_id=$AGENT_ID&_sort=importance&_order=desc&_limit=5" 2>/dev/null || echo '[]')
  # Also query global memories (no agent_id)
  local global_mem
  global_mem=$(es_query "ai:memory" "_limit=3&_sort=importance&_order=desc" 2>/dev/null || echo '[]')
  local all_mem
  all_mem=$(echo "[$mem_raw, $global_mem]" | jq -c 'flatten | unique_by(.id) | .[:5] | [.[] | {content,importance,source_type}]' 2>/dev/null || echo '[]')
  if [ "$all_mem" != "[]" ] && [ -n "$all_mem" ]; then
    memories="$all_mem"
  fi

  context="## Your Tasks
${tasks}

## Open Findings
${findings}

## Questions For You
${questions}

## Relevant Memories
${memories:-[]}"

  # ── Action tools — @action objects bound to this agent ──
  # Agent field: action_tools[] = array of @action IDs
  # Agents call: bash $SCRIPT_DIR/es-action-tool.sh <action_id> '<json_params>'
  # Requires ES_TOKEN env var with a valid admin Bearer token
  local action_tools_ids
  action_tools_ids=$(echo "$AGENT_DATA" | jq -r '(.action_tools // []) | .[]' 2>/dev/null || true)

  if [ -n "$action_tools_ids" ]; then
    local actions_section=""
    actions_section="## Available Action Tools
Execute @action objects directly using Bash (requires ES_TOKEN env var):
  ES_TOKEN=\$ES_TOKEN bash ${SCRIPT_DIR}/es-action-tool.sh <action_id> '<json_params>'

"
    while IFS= read -r act_id; do
      [ -z "$act_id" ] && continue
      # Fetch action definition
      local act_data
      act_data=$(es_get "@action" "$act_id" 2>/dev/null || true)
      [ -z "$act_data" ] || [ "$act_data" = "null" ] && continue

      local act_name act_desc act_type act_params_desc
      act_name=$(echo "$act_data" | jq -r '.name // ""')
      act_desc=$(echo "$act_data" | jq -r '.description // ""')
      act_type=$(echo "$act_data" | jq -r '.type // "api"')

      # Build params description from action.params[]
      act_params_desc=$(echo "$act_data" | jq -r '
        (.params // []) | map(
          "    - " + .key + " (" + (.data_type // "string") +
          (if (.flags.required // false) then ", required" else ", optional" end) + ")" +
          (if .description != null and .description != "" then ": " + .description else "" end)
        ) | join("\n")
      ' 2>/dev/null || true)

      actions_section="${actions_section}### ${act_id} — ${act_name} [${act_type}]
${act_desc}
Params:
${act_params_desc:-    (none)}
Call: bash ${SCRIPT_DIR}/es-action-tool.sh ${act_id} '{\"key\":\"value\"}'

"
    done <<< "$action_tools_ids"

    context="${context}

${actions_section}"
  fi

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

    # F4: Extract token usage from claude CLI stream-json
    # Claude CLI emits a "result" line with usage.input_tokens / usage.output_tokens
    local cli_input_tokens cli_output_tokens
    cli_input_tokens=$(grep '"type":"result"' "$tmpfile" 2>/dev/null | tail -1 \
      | jq -r '.usage.input_tokens // 0' 2>/dev/null || echo 0)
    cli_output_tokens=$(grep '"type":"result"' "$tmpfile" 2>/dev/null | tail -1 \
      | jq -r '.usage.output_tokens // 0' 2>/dev/null || echo 0)
    # Expose as globals (same pattern as ANTHROPIC_* vars)
    ANTHROPIC_INPUT_TOKENS="${cli_input_tokens:-0}"
    ANTHROPIC_OUTPUT_TOKENS="${cli_output_tokens:-0}"

    # F4: Warn if context approaching limit
    local total_tokens=$(( ANTHROPIC_INPUT_TOKENS + ANTHROPIC_OUTPUT_TOKENS ))
    if [ "$total_tokens" -gt 0 ] && [ "$MAX_CONTEXT_TOKENS" -gt 0 ]; then
      local pct=$(( total_tokens * 100 / MAX_CONTEXT_TOKENS ))
      if [ "$pct" -ge 80 ]; then
        echo "[$(date '+%H:%M:%S')] F4 ContextBudget: ${total_tokens} tokens (${pct}% of ${MAX_CONTEXT_TOKENS} budget)" >&2
      fi
    fi
  fi
  [ -z "$result" ] && result="[no response]"

  echo "$result"
}

monitor_anthropic_api_stream() {
  local tmpfile="$1"
  local resp_id="$2"
  local pid="$3"
  local accumulated=""
  local last_update=0

  # Parse SSE stream from Anthropic API.
  # Each SSE data line is: "data: <json>"
  # We strip "data: " prefix before passing to jq.
  _extract_text() {
    grep '^data: ' "$1" 2>/dev/null \
      | sed 's/^data: //' \
      | jq -r 'select(.type=="content_block_delta" and .delta.type=="text_delta") | .delta.text // empty' 2>/dev/null \
      | tr -d '\n' || true
  }

  _extract_tokens() {
    local input_tokens output_tokens
    # input tokens from message_start
    input_tokens=$(grep '^data: ' "$1" 2>/dev/null | sed 's/^data: //' \
      | jq -r 'select(.type=="message_start") | .message.usage.input_tokens // 0' 2>/dev/null | tail -1 || echo 0)
    # output tokens from message_delta
    output_tokens=$(grep '^data: ' "$1" 2>/dev/null | sed 's/^data: //' \
      | jq -r 'select(.type=="message_delta") | .usage.output_tokens // 0' 2>/dev/null | tail -1 || echo 0)
    echo "${input_tokens:-0} ${output_tokens:-0}"
  }

  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    if [ -f "$tmpfile" ]; then
      local new_text
      new_text=$(_extract_text "$tmpfile")
      if [ -n "$new_text" ] && [ "$new_text" != "$accumulated" ]; then
        accumulated="$new_text"
        local now_ts
        now_ts=$(date +%s)
        if [ $((now_ts - last_update)) -ge 2 ]; then
          es_update "ai:message" "$resp_id" "$(jq -n --arg c "$accumulated" '{content:$c, status:"streaming"}')" > /dev/null 2>&1
          last_update=$now_ts
        fi
        echo "[$(date '+%H:%M:%S')] Streaming: ${#accumulated} chars" >&2
      fi
    fi
  done

  wait "$pid" 2>/dev/null

  local result=""
  if [ -f "$tmpfile" ]; then
    result=$(_extract_text "$tmpfile")
    [ -z "$result" ] && result="$accumulated"

    # Extract token usage for tracking
    local token_info
    token_info=$(_extract_tokens "$tmpfile")
    ANTHROPIC_INPUT_TOKENS=$(echo "$token_info" | awk '{print $1}')
    ANTHROPIC_OUTPUT_TOKENS=$(echo "$token_info" | awk '{print $2}')
    echo "[$(date '+%H:%M:%S')] Tokens: in=${ANTHROPIC_INPUT_TOKENS} out=${ANTHROPIC_OUTPUT_TOKENS}" >&2
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

    # F5: Self-critique gate — only for developer/coordinator, not reviewer (avoids infinite loop)
    local enable_critique
    enable_critique=$(echo "$AGENT_DATA" | jq -r '.behavior.self_critique // false')
    if [ "$enable_critique" = "true" ] && [ "$AGENT_ID" != "agent:reviewer" ]; then
      echo "[$(date '+%H:%M:%S')] F5 Self-critique: reviewing work for $task_ref..." >&2
      local task_desc
      task_desc=$(es_get "ai:task" "$task_ref" | jq -r '.description // .name // ""' 2>/dev/null || echo "")
      local critique_prompt="You just completed a task. Self-review your work.

Task: $task_ref
Description: $task_desc

Your response was:
---
${result:0:2000}
---

Answer ONLY with one of:
1. PASS: [1 line reason why the work is complete and correct]
2. NEEDS_WORK: [specific gap or issue that must be fixed before completion]

Be strict. Only PASS if you are confident the task is genuinely done."

      local critique_result
      critique_result=$(echo "$critique_prompt" | claude --print --model sonnet \
        --output-format text \
        --max-budget-usd 0.10 2>/dev/null || echo "PASS: critique unavailable")

      echo "[$(date '+%H:%M:%S')] F5 Self-critique result: ${critique_result:0:100}" >&2

      if echo "$critique_result" | grep -q "^NEEDS_WORK:"; then
        local issue
        issue=$(echo "$critique_result" | sed 's/^NEEDS_WORK: *//')
        echo "[$(date '+%H:%M:%S')] F5 Self-critique: BLOCKED completion of $task_ref — $issue" >&2
        # Add a note to the task about what needs fixing
        es_update "ai:task" "$task_ref" "$(jq -n \
          --arg note "Self-critique: $issue" \
          '{self_critique_note:$note}')" > /dev/null 2>&1
        # Don't mark complete — agent must continue
        continue
      fi
      echo "[$(date '+%H:%M:%S')] F5 Self-critique: PASSED — marking $task_ref → review" >&2
    fi

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

  # Parse prompt improvement proposals (agent proposes, owner approves)
  # Format: PROMPT_IMPROVE: <rationale> | <proposed text>
  # Example: PROMPT_IMPROVE: Always check for existing tests before writing | ## Testing Rule\nRun existing tests first with `npm test`
  echo "$result" | grep -oP 'PROMPT_IMPROVE:\s*\K.+' 2>/dev/null | head -3 | while IFS= read -r proposal_line; do
    [ -z "$proposal_line" ] && continue
    local rationale proposed_text prompt_file agent_lower
    rationale=$(echo "$proposal_line" | sed 's/ *|.*//' | xargs)
    proposed_text=$(echo "$proposal_line" | grep -oP '\|\s*\K.+' || echo "")
    # Derive prompt file from agent name
    agent_lower=$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')
    prompt_file="${agent_lower}.md"
    echo "[$(date '+%H:%M:%S')] Post-process: creating prompt proposal for $prompt_file" >&2
    es_create "ai:prompt_proposal" "$(jq -n \
      --arg agent "$AGENT_ID" \
      --arg file "$prompt_file" \
      --arg proposed "$proposed_text" \
      --arg rationale "$rationale" \
      --arg now "$(NOW)" \
      '{class_id:"ai:prompt_proposal", agent_id:$agent, prompt_file:$file, proposed_addition:$proposed, rationale:$rationale, status:"pending", created:$now}')" > /dev/null 2>&1
    # Notify owner
    es_create "ai:message" "$(jq -n \
      --arg agent "$AGENT_ID" \
      --arg rationale "$rationale" \
      --arg file "$prompt_file" \
      --arg now "$(NOW)" \
      '{class_id:"ai:message", role:"assistant", agent_id:$agent, to_agents:["agent:assistant"], content:("Prompt improvement proposal for **" + $file + "**:\n\n> " + $rationale + "\n\nReview pending proposals: `curl $ES_URL/query/ai:prompt_proposal?status=pending`\nApprove with: `bash apps/aic/apply-prompt-improvement.sh <proposal_id>`"), status:"pending", created:$now}')" > /dev/null 2>&1
  done

  # F2: Typed artifacts — parse ARTIFACT: <type> | <json_or_text> signals
  # Types: code, plan, document, data, analysis, image_prompt
  # Example: ARTIFACT: code | {"language":"bash","content":"#!/bin/bash\n...","description":"Deploy script"}
  # Example: ARTIFACT: plan | {"steps":["step1","step2"],"description":"Implementation plan"}
  echo "$result" | grep -oP 'ARTIFACT:\s*\K.+' 2>/dev/null | head -5 | while IFS= read -r artifact_line; do
    [ -z "$artifact_line" ] && continue
    local artifact_type artifact_content
    artifact_type=$(echo "$artifact_line" | sed 's/ *|.*//' | xargs | tr '[:upper:]' '[:lower:]')
    artifact_content=$(echo "$artifact_line" | grep -oP '\|\s*\K.+' || echo "")
    [ -z "$artifact_type" ] && artifact_type="document"
    [ -z "$artifact_content" ] && artifact_content="$artifact_line"

    # Try to get current task_id from recent in_progress tasks for this agent
    local linked_task
    linked_task=$(es_query "ai:task" "agent_id=$AGENT_ID&status=in_progress&_limit=1" \
      | jq -r '.[0].id // ""' 2>/dev/null || echo "")

    echo "[$(date '+%H:%M:%S')] F2 Artifact: type=$artifact_type task=${linked_task:-none}" >&2
    es_create "ai:artifact" "$(jq -n \
      --arg type "$artifact_type" \
      --arg content "$artifact_content" \
      --arg agent "$AGENT_ID" \
      --arg task "${linked_task:-}" \
      --arg now "$(NOW)" \
      '{class_id:"ai:artifact", artifact_type:$type, content:$content, agent_id:$agent, task_id:$task, status:"created", created:$now}')" > /dev/null 2>&1
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
${ES_TOKEN:+ES_TOKEN: ${ES_TOKEN}}

${agent_context}

## Conversation History
${conv_history}"

  # ── Execute via provider ──
  t_start=$(date +%s)
  tmpfile="/tmp/aic-run-${msg_id}-$$"
  ANTHROPIC_INPUT_TOKENS=0
  ANTHROPIC_OUTPUT_TOKENS=0

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
  in_tok="${ANTHROPIC_INPUT_TOKENS:-0}"
  out_tok="${ANTHROPIC_OUTPUT_TOKENS:-0}"

  # Write result to temp file to avoid command-line length limits
  result_file="/tmp/aic-result-$$"
  echo "$result" > "$result_file"
  update_json=$(jq -n \
    --rawfile content "$result_file" \
    --argjson dur "$duration" --arg mdl "$model" --arg prov "$provider_id" --argjson tc "$tc" \
    --argjson in_tok "$in_tok" --argjson out_tok "$out_tok" \
    '{content:$content, status:"complete", metadata:{duration_s:$dur, model:$mdl, provider_id:$prov, format:"markdown", tool_uses:$tc, tokens:{input:$in_tok, output:$out_tok}}}' 2>/dev/null)

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
  old_total_runs=$(echo "$AGENT_DATA" | jq -r '.stats.total_runs // 0')
  old_total_dur=$(echo "$AGENT_DATA" | jq -r '.stats.total_duration_s // 0')
  new_total_runs=$((old_total_runs + 1))
  new_total_dur=$((old_total_dur + duration))
  if [ "$new_total_runs" -gt 0 ]; then
    new_avg=$(awk "BEGIN{printf \"%.1f\", $new_total_dur / $new_total_runs}")
  else
    new_avg="0.0"
  fi
  stats_json=$(jq -n \
    --argjson tr "$new_total_runs" --argjson td "$new_total_dur" \
    --argjson avg "$new_avg" --argjson dur "$duration" --arg now "$(NOW)" \
    '{total_runs:$tr,total_duration_s:$td,avg_duration_s:$avg,last_run:$now,last_duration_s:$dur}')
  es_update "ai:agent" "$AGENT_ID" "$(jq -n \
    --argjson rc "$((run_count+1))" --arg lr "$(NOW)" --argjson st "$stats_json" \
    '{run_count:$rc,last_run:$lr,stats:$st}')" > /dev/null 2>&1

  es_log "info" "Worker finished: $AGENT_NAME ($AGENT_ID) PID=$$ duration=${duration}s exit=$exit_code" "agent-run"
  echo "[$(date '+%H:%M:%S')] Done"
done
