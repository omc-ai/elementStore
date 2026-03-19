#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# server.sh — AI Company v4.0 (API-driven server)
#
# Long-running worker that executes agent rounds through elementStore REST API.
# Manages its own worker status object (ai:worker) so dashboards can track it.
# All reads/writes go through the store — no local jq/file I/O.
#
# Usage:
#   ./server.sh                    # Run one round
#   ./server.sh --loop             # Run rounds until all tasks complete
#   ./server.sh --loop --max 5     # Run up to 5 rounds
#   ./server.sh --status           # Show current status from store
#   ./server.sh --agents           # List agents
#   ./server.sh --tasks            # List open tasks
#
# Dashboard: http://arc3d.master.local/aic.html (auto-refresh)
#
# Requires: curl, jq, claude (Claude CLI)
# ═══════════════════════════════════════════════════════════════════

set -uo pipefail
# Note: NOT using set -e (errexit) — grep returning 1 in pipes kills the script

ES_URL="${ES_URL:-http://arc3d.master.local/elementStore}"
MAX_ROUNDS="${MAX_ROUNDS:-50}"
WORKER_ID="worker:aic-$(hostname -s 2>/dev/null || echo local)"
LOOP=false
STATUS_ONLY=false
AGENTS_ONLY=false
TASKS_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --loop)    LOOP=true ;;
    --status)  STATUS_ONLY=true ;;
    --agents)  AGENTS_ONLY=true ;;
    --tasks)   TASKS_ONLY=true ;;
    --max)     ;; # next arg
    [0-9]*)    MAX_ROUNDS="$arg" ;;
  esac
done

NOW() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

# ─── ES API helpers ───────────────────────────────────────────

es_get()    { curl -sf "$ES_URL/store/$1/$2" 2>/dev/null; }
es_query()  { curl -sf "$ES_URL/query/$1?$2" 2>/dev/null; }
es_list()   { curl -sf "$ES_URL/store/$1" 2>/dev/null; }
es_create() { curl -sf -X POST "$ES_URL/store/$1" -H 'Content-Type: application/json' -H 'X-Allow-Custom-Ids: true' -d "$2" 2>/dev/null; }
es_update() { curl -sf -X PUT "$ES_URL/store/$1/$2" -H 'Content-Type: application/json' -d "$3" 2>/dev/null; }

# ─── Worker management ────────────────────────────────────────

LOG_BUFFER=()

wlog() {
  local msg="[$(date '+%H:%M:%S')] $1"
  echo "$msg"
  LOG_BUFFER+=("$msg")
  # Keep last 50 lines
  if [ ${#LOG_BUFFER[@]} -gt 50 ]; then
    LOG_BUFFER=("${LOG_BUFFER[@]: -50}")
  fi
}

worker_update() {
  local fields="$1"
  # Add heartbeat and log to every update
  local log_json
  log_json=$(printf '%s\n' "${LOG_BUFFER[@]}" | jq -R . | jq -s '.')
  es_update "ai:worker" "$WORKER_ID" "$(echo "$fields" | jq --argjson log "$log_json" --arg hb "$(NOW)" '. + {last_heartbeat: $hb, log: $log}')" > /dev/null 2>&1 || true
}

worker_start() {
  wlog "Starting worker $WORKER_ID (PID $$)"
  es_create "ai:worker" "$(jq -n \
    --arg id "$WORKER_ID" \
    --arg started "$(NOW)" \
    --argjson pid $$ \
    --argjson max "$MAX_ROUNDS" \
    --arg es "$ES_URL" \
    '{id:$id, class_id:"ai:worker", name:"AIC Server", status:"running", pid:$pid, max_rounds:$max, started:$started, last_heartbeat:$started, rounds_completed:0, es_url:$es, log:[], project:"arc3d"}'
  )" > /dev/null 2>&1 || \
  worker_update '{"status":"running","pid":'$$',"started":"'"$(NOW)"'","rounds_completed":0}'
}

worker_stop() {
  local reason="${1:-stopped}"
  wlog "Worker stopped: $reason"
  worker_update "{\"status\":\"stopped\",\"current_agent\":null,\"current_round\":null}"
}

worker_error() {
  wlog "ERROR: $1"
  worker_update "{\"status\":\"error\",\"error\":\"$1\"}"
}

# Cleanup on exit
trap 'worker_stop "process exit"' EXIT

# ─── Data access ──────────────────────────────────────────────

get_agents() {
  es_list "ai:agent" | jq -r 'sort_by(.execution_order // 99) | .[] | @json'
}

get_open_tasks() {
  es_query "ai:task" "status=open&_sort=step&_order=asc"
}

get_preferences() {
  es_list "ai:preference" | jq -r '[.[] | select(.overridden != true)]' 2>/dev/null || echo '[]'
}

get_findings() {
  es_query "es:finding" "status=open" 2>/dev/null || echo '[]'
}

next_round_number() {
  es_list "ai:round" | jq -r '[.[] | .round_number // 0] | max // 0' 2>/dev/null || echo "0"
}

# ─── Round management ─────────────────────────────────────────

create_round() {
  local num="$1"
  es_create "ai:round" "$(jq -n \
    --arg id "round:$num" \
    --argjson num "$num" \
    --arg started "$(NOW)" \
    '{id:$id, class_id:"ai:round", name:("Round "+($num|tostring)), round_number:$num, started:$started, agents_completed:[], decisions_made:0, all_tasks_complete:false}'
  )" > /dev/null
  echo "round:$num"
}

complete_round() {
  local round_id="$1" summary="$2"
  es_update "ai:round" "$round_id" "$(jq -n --arg c "$(NOW)" --arg s "$summary" '{completed:$c, summary:$s}')" > /dev/null
}

mark_agent_done() {
  local round_id="$1" agent_id="$2"
  local completed
  completed=$(es_get "ai:round" "$round_id" | jq -r '.agents_completed // []')
  completed=$(echo "$completed" | jq --arg a "$agent_id" '. + [$a] | unique')
  es_update "ai:round" "$round_id" "{\"agents_completed\":$completed}" > /dev/null
}

# ─── Task management ──────────────────────────────────────────

create_task() {
  local name="$1" priority="$2" agent_id="$3" round_id="$4"
  local id="task:$(date +%s)-$(( RANDOM % 1000 ))"
  es_create "ai:task" "$(jq -n \
    --arg id "$id" --arg name "$name" --arg priority "$priority" \
    --arg agent_id "$agent_id" --arg round_id "$round_id" --arg started "$(NOW)" \
    '{id:$id, class_id:"ai:task", name:$name, priority:$priority, status:"in_progress", agent_id:$agent_id, round_id:$round_id, source:"ceo_directive", started:$started}'
  )" > /dev/null
  echo "$id"
}

complete_task() {
  local task_id="$1" result="$2"
  es_update "ai:task" "$task_id" "$(jq -n --arg r "$result" --arg c "$(NOW)" '{status:"done", result:$r, completed:$c}')" > /dev/null
}

# ─── Agent execution — spawns agent-run.sh ───────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNING_PIDS=""

# Spawn agent as separate process
spawn_agent() {
  local agent_id="$1"
  local msg_id="${2:-}"
  local agent_name
  agent_name=$(es_list "ai:agent" | jq -r --arg id "$agent_id" '.[] | select(.id==$id) | .name // "?"' 2>/dev/null)

  wlog "▶ Spawning $agent_name ($agent_id)..."
  worker_update "{\"current_agent\":\"$agent_id\",\"status\":\"running\"}"

  # Spawn executor in background
  ES_URL="$ES_URL" bash "$SCRIPT_DIR/agent-run.sh" "$agent_id" "$msg_id" >> "/tmp/aic-agent-${agent_id##*:}.log" 2>&1 &
  local pid=$!
  RUNNING_PIDS="$RUNNING_PIDS $pid"

  wlog "  Spawned PID $pid → /tmp/aic-agent-${agent_id##*:}.log"
  return 0
}

# Wait for a spawned agent to finish
wait_agent() {
  local pid="$1"
  wait "$pid" 2>/dev/null
  local exit_code=$?
  RUNNING_PIDS=$(echo "$RUNNING_PIDS" | sed "s/ $pid//")
  return $exit_code
}

# Run agent synchronously (for round shifts — one at a time)
# Creates a round-context message, then calls agent-run.sh to process it
run_agent_sync() {
  local agent_id="$1"
  local agent_name
  agent_name=$(es_list "ai:agent" | jq -r --arg id "$agent_id" '.[] | select(.id==$id) | .name // "?"' 2>/dev/null)

  wlog "▶ Running $agent_name..."
  worker_update "{\"current_agent\":\"$agent_id\",\"status\":\"running\"}"

  # Build round context — tasks, findings, questions for this agent
  local tasks findings questions
  tasks=$(get_open_tasks | jq -c '[.[] | {id,name,priority,status,step,project}]' 2>/dev/null || echo '[]')
  findings=$(get_findings | jq -c '[.[] | {id,name,severity,category,fix}]' 2>/dev/null || echo '[]')
  questions=$(es_query "ai:question" "status=open" 2>/dev/null | jq -c '[.[] | {id,question,from_agent,to_agents}]' 2>/dev/null || echo '[]')

  local round_prompt="Round execution. Review open tasks and findings in your domain. Take action.

Open tasks: $tasks

Open findings: $findings

Open questions: $questions"

  # Create a pending message for this agent to process
  local msg_id
  msg_id=$(es_create "ai:message" "$(jq -n \
    --arg agent "$agent_id" --arg content "$round_prompt" --arg now "$(NOW)" \
    '{class_id:"ai:message", user_id:"system", agent_id:"system", to_agents:[$agent], role:"user", content:$content, status:"pending", created:$now}'
  )" | jq -r '.id // ""' 2>/dev/null)

  if [ -n "$msg_id" ] && [ "$msg_id" != "null" ]; then
    wlog "  Round message: $msg_id"
    ES_URL="$ES_URL" bash "$SCRIPT_DIR/agent-run.sh" "$agent_id" "$msg_id" >> "/tmp/aic-agent-${agent_id##*:}.log" 2>&1
  else
    wlog "  Failed to create round message"
  fi

  local exit_code=$?

  # Update agent run count
  local run_count
  run_count=$(es_get "ai:agent" "$agent_id" | jq -r '.run_count // 0' 2>/dev/null || echo 0)
  es_update "ai:agent" "$agent_id" "{\"run_count\":$((run_count+1)),\"last_run\":\"$(NOW)\"}" > /dev/null 2>&1

  if [ $exit_code -eq 0 ]; then
    wlog "  ✓ $agent_name done"
  else
    wlog "  ✗ $agent_name failed (exit $exit_code)"
  fi
}

# Legacy build_context kept for round-based agents
build_context() {
  local agent_data="$1"

  # Get master prompt from store
  local master_prompt
  master_prompt=$(es_get "ai:prompt" "prompt:master" | jq -r '.template // ""' 2>/dev/null || echo "")
  # Replace ES_URL placeholder
  master_prompt="${master_prompt//\$ES_URL/$ES_URL}"
  master_prompt="${master_prompt//\{ES_URL\}/$ES_URL}"

  # Get agent-specific prompt (from agent object or ai:prompt)
  local agent_prompt
  agent_prompt=$(echo "$agent_data" | jq -r '.prompt // ""')

  # Get live data from store
  local agent_id
  agent_id=$(echo "$agent_data" | jq -r '.id')
  local open_tasks open_findings preferences open_questions
  open_tasks=$(get_open_tasks | jq -r '[.[] | {id,name,priority,status,step,project,agent_id}]' 2>/dev/null || echo '[]')
  open_findings=$(get_findings | jq -r '[.[] | {id,name,severity,category,project,fix}]' 2>/dev/null || echo '[]')
  preferences=$(get_preferences | jq -r '[.[] | {name,rule,confidence}]' 2>/dev/null || echo '[]')
  open_questions=$(es_query "ai:question" "status=open" 2>/dev/null | jq -r '[.[] | {id,name,question,from_agent,to_agents,to_title,context}]' 2>/dev/null || echo '[]')

  cat <<PROMPT
${master_prompt}

## Environment
ES_URL=$ES_URL

---

${agent_prompt}

---

## Live Data (from elementStore)

### Open Tasks
$open_tasks

### Open Findings
$open_findings

### Open Questions (check if any are directed to you)
$open_questions

### Learned Preferences
$preferences
PROMPT
}

# ─── Legacy functions (kept for reference, not called) ─────

_legacy_run_personal_agent() {
  local agent_data="$1"
  local round_id="$2"
  local agent_id="agent:owner"
  local agent_prompt
  agent_prompt=$(echo "$agent_data" | jq -r '.prompt // ""')

  # Find pending messages
  local pending
  pending=$(es_query "ai:message" "user_id=owner&role=user&status=pending&_sort=created&_order=asc&_limit=5" 2>/dev/null || echo '[]')
  local msg_count
  msg_count=$(echo "$pending" | jq 'length' 2>/dev/null || echo 0)

  if [ "$msg_count" = "0" ]; then
    wlog "  No pending messages for owner"
    return
  fi

  wlog "  $msg_count pending message(s)"

  # Process each message
  echo "$pending" | jq -r '.[] | @json' | while IFS= read -r msg_json; do
    [ -z "$msg_json" ] && continue
    local msg_id msg_content conv_id
    msg_id=$(echo "$msg_json" | jq -r '.id')
    msg_content=$(echo "$msg_json" | jq -r '.content // ""')
    conv_id=$(echo "$msg_json" | jq -r '.conversation_id // ""')

    wlog "  Processing: ${msg_content:0:50}..."

    # Mark processing
    es_update "ai:message" "$msg_id" '{"status":"processing"}' > /dev/null 2>&1

    # Create conversation if needed
    if [ -z "$conv_id" ] || [ "$conv_id" = "null" ]; then
      conv_id=$(es_create "ai:conversation" "$(jq -n \
        --arg agent "$agent_id" --arg now "$(NOW)" \
        '{class_id:"ai:conversation", agent_id:$agent, user_id:"owner", title:"Personal chat", status:"active", created:$now}'
      )" | jq -r '.id // ""' 2>/dev/null)
      es_update "ai:message" "$msg_id" "{\"conversation_id\":\"$conv_id\"}" > /dev/null 2>&1
    fi

    # Create streaming response placeholder
    local resp_id
    resp_id=$(es_create "ai:message" "$(jq -n \
      --arg conv "$conv_id" --arg agent "$agent_id" --arg ref "$msg_id" --arg now "$(NOW)" \
      '{class_id:"ai:message", conversation_id:$conv, user_id:"system", agent_id:$agent, role:"assistant", content:"...", references:[$ref], status:"streaming", created:$now}'
    )" | jq -r '.id // ""' 2>/dev/null)

    # Build context
    local tasks findings
    tasks=$(es_query "ai:task" "status=open&_sort=step&_limit=15" | jq -r '[.[] | {id,name,priority,status,project}]' 2>/dev/null || echo '[]')
    findings=$(es_query "es:finding" "status=open&_limit=10" | jq -r '[.[] | {id,name,severity}]' 2>/dev/null || echo '[]')

    local full_prompt="${agent_prompt}

ES_URL=${ES_URL}

Open tasks: ${tasks}
Open findings: ${findings}

User says: ${msg_content}"

    # Call claude with streaming — update message progressively
    local result=""
    local accumulated=""
    local t_start t_end
    t_start=$(date +%s)

    if command -v claude &>/dev/null; then
      # Stream output to temp file, update message as chunks arrive
      local tmpfile="/tmp/aic-stream-$$"
      echo "$full_prompt" | claude --print --model sonnet --output-format stream-json > "$tmpfile" 2>/dev/null &
      local claude_pid=$!

      # Monitor the stream file for text chunks
      local last_size=0
      while kill -0 "$claude_pid" 2>/dev/null; do
        sleep 1
        if [ -f "$tmpfile" ]; then
          local current_size
          current_size=$(wc -c < "$tmpfile" 2>/dev/null || echo 0)
          if [ "$current_size" -gt "$last_size" ]; then
            # Extract latest text from stream
            local latest_text
            latest_text=$(grep '"type":"result"' "$tmpfile" 2>/dev/null | tail -1 | jq -r '.result // empty' 2>/dev/null)
            if [ -z "$latest_text" ]; then
              latest_text=$(grep '"type":"assistant"' "$tmpfile" 2>/dev/null | tail -1 | jq -r '.message.content[]? | select(.type=="text") | .text // empty' 2>/dev/null)
            fi
            if [ -n "$latest_text" ]; then
              es_update "ai:message" "$resp_id" "$(jq -n --arg c "$latest_text" '{content:$c}')" > /dev/null 2>&1
            fi
            last_size=$current_size
          fi
        fi
      done

      wait "$claude_pid" 2>/dev/null

      # Get final result
      if [ -f "$tmpfile" ]; then
        result=$(grep '"type":"result"' "$tmpfile" 2>/dev/null | tail -1 | jq -r '.result // ""' 2>/dev/null)
        if [ -z "$result" ]; then
          result=$(grep '"type":"assistant"' "$tmpfile" 2>/dev/null | tail -1 | jq -r '.message.content[]? | select(.type=="text") | .text // empty' 2>/dev/null)
        fi
        rm -f "$tmpfile"
      fi
      [ -z "$result" ] && result="[no response]"
    else
      result="[DRY RUN] Would respond to: ${msg_content:0:100}"
    fi

    t_end=$(date +%s)
    local duration=$((t_end - t_start))
    wlog "  Response: ${#result} chars in ${duration}s"

    # Final update with complete content
    es_update "ai:message" "$resp_id" "$(jq -n \
      --arg content "$result" --argjson dur "$duration" \
      '{content:$content, status:"complete", metadata:{duration_s:$dur, model:"sonnet"}}'
    )" > /dev/null 2>&1

    # Mark original answered
    es_update "ai:message" "$msg_id" '{"status":"answered"}' > /dev/null 2>&1

    wlog "  ✓ Responded to ${msg_content:0:30}..."
  done
}

_legacy_run_agent() {
  local agent_data="$1"
  local round_id="$2"
  local agent_name agent_id
  agent_name=$(echo "$agent_data" | jq -r '.name')
  agent_id=$(echo "$agent_data" | jq -r '.id')

  wlog "▶ Running $agent_name..."
  worker_update "{\"current_agent\":\"$agent_id\",\"status\":\"running\"}"

  # Personal agent: process pending user messages instead of round prompt
  if [ "$agent_id" = "agent:owner" ]; then
    run_personal_agent "$agent_data" "$round_id"
    return
  fi

  # Create conversation for this agent run
  local conv_id
  conv_id=$(es_create "ai:conversation" "$(jq -n \
    --arg agent "$agent_id" --arg title "$agent_name round" \
    --arg round "$round_id" --arg now "$(NOW)" \
    '{class_id:"ai:conversation", agent_id:$agent, user_id:"system", title:$title, status:"active", created:$now}'
  )" | jq -r '.id // empty' 2>/dev/null || echo "")

  local prompt
  prompt=$(build_context "$agent_data")

  # Log request as ai:message (the prompt sent to claude)
  local req_msg_id
  req_msg_id=$(es_create "ai:message" "$(jq -n \
    --arg conv "$conv_id" --arg agent "$agent_id" --arg round "$round_id" \
    --arg content "$prompt" --arg now "$(NOW)" \
    '{class_id:"ai:message", conversation_id:$conv, user_id:"system", agent_id:$agent, role:"user", content:$content, round_id:$round, status:"complete", created:$now}'
  )" | jq -r '.id // empty' 2>/dev/null || echo "")
  wlog "  Sent ${#prompt} chars → msg:$req_msg_id"

  # Execute via Claude CLI
  local result=""
  local t_start
  t_start=$(date +%s)
  if command -v claude &>/dev/null; then
    result=$(echo "$prompt" | claude --print --model sonnet 2>/dev/null || echo "[error]")
  else
    result="[DRY RUN] Would execute $agent_name with ${#prompt} char prompt"
    wlog "  (claude CLI not available — dry run)"
  fi
  local t_end
  t_end=$(date +%s)
  local duration=$((t_end - t_start))
  wlog "  $agent_name: ${#result} chars in ${duration}s"

  # Parse results from agent output
  local results_json="[]"

  # Parse TASK_COMPLETE
  { echo "$result" | grep "TASK_COMPLETE:" || true; } | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local tid summary
    tid=$(echo "$line" | sed 's/TASK_COMPLETE: \([^ ]*\).*/\1/')
    summary=$(echo "$line" | sed 's/TASK_COMPLETE: [^ ]* - //')
    complete_task "$tid" "$summary" 2>/dev/null || true
    wlog "  ✓ Completed: $tid"
  done

  # Parse QUESTION and collect as results
  local q_results="[]"
  { echo "$result" | grep "^QUESTION:" || true; } | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local q_text q_to="agent:ceo"
    q_text=$(echo "$line" | sed 's/^QUESTION: *//')
    if echo "$q_text" | grep -q "^@"; then
      q_to=$(echo "$q_text" | sed 's/^@\([^ ]*\).*/\1/')
      q_text=$(echo "$q_text" | sed 's/^@[^ ]* *[—-] *//')
    fi
    # Still create ai:question for backward compat (will migrate later)
    es_create "ai:question" "$(jq -n \
      --arg name "${q_text:0:60}" --arg question "$q_text" \
      --arg from "$agent_id" --arg to "$q_to" --arg now "$(NOW)" --arg round "$round_id" \
      '{class_id:"ai:question", name:$name, question:$question, from_agent:$from, to_agents:[$to], round_id:$round, status:"open", created:$now}'
    )" > /dev/null 2>&1 || true
    wlog "  ? Question to $q_to"
  done

  # Parse DECISION
  { echo "$result" | grep "^DECISION:" || true; } | while IFS= read -r line; do
    [ -z "$line" ] && continue
    local dec_text
    dec_text=$(echo "$line" | sed 's/^DECISION: *//')
    es_create "ai:decision" "$(jq -n \
      --arg name "${dec_text:0:80}" --arg topic "${dec_text:0:80}" \
      --arg decision "$dec_text" --arg round "$round_id" --arg agent "$agent_id" \
      '{class_id:"ai:decision", name:$name, topic:$topic, decision:$decision, round_id:$round, assigned_agents:[$agent], priority:"P2", implemented:false}'
    )" > /dev/null 2>&1 || true
    wlog "  Decision: ${dec_text:0:50}..."
  done

  # Log response as ai:message (the claude output + metadata)
  local resp_content
  resp_content=$(echo "$result" | head -100 | jq -Rsa '.' | sed 's/^"//;s/"$//')
  es_create "ai:message" "$(jq -n \
    --arg conv "$conv_id" --arg agent "$agent_id" --arg round "$round_id" \
    --arg content "$result" --arg now "$(NOW)" --argjson dur "$duration" \
    --argjson prompt_len ${#prompt} --argjson result_len ${#result} \
    '{class_id:"ai:message", conversation_id:$conv, user_id:"system", agent_id:$agent, role:"assistant", content:$content, round_id:$round, status:"complete", metadata:{duration_s:$dur, prompt_chars:$prompt_len, response_chars:$result_len}, created:$now}'
  )" > /dev/null 2>&1 || true

  # Close conversation
  if [ -n "$conv_id" ]; then
    es_update "ai:conversation" "$conv_id" "{\"status\":\"closed\",\"last_message\":\"$(NOW)\"}" > /dev/null 2>&1 || true
  fi

  mark_agent_done "$round_id" "$agent_id"

  # Update agent run count
  local run_count
  run_count=$(echo "$agent_data" | jq -r '.run_count // 0')
  es_update "ai:agent" "$agent_id" "{\"run_count\":$((run_count+1)),\"last_run\":\"$(NOW)\"}" > /dev/null

  wlog "  ✓ $agent_name done (conv:${conv_id:0:8})"
}

# ─── Status display ───────────────────────────────────────────

show_status() {
  echo "═══ AI Company Status ═══"
  echo ""

  # Worker status
  local worker
  worker=$(es_get "ai:worker" "$WORKER_ID" 2>/dev/null || echo '{}')
  local w_status w_rounds w_hb
  w_status=$(echo "$worker" | jq -r '.status // "not running"')
  w_rounds=$(echo "$worker" | jq -r '.rounds_completed // 0')
  w_hb=$(echo "$worker" | jq -r '.last_heartbeat // "never"')
  echo "Worker: $WORKER_ID"
  echo "  Status: $w_status | Rounds: $w_rounds | Last heartbeat: $w_hb"
  echo ""

  echo "Agents:"
  es_list "ai:agent" | jq -r 'sort_by(.execution_order // 99) | .[] | "  #\(.execution_order // "?") \(.name)\t\(.run_count // 0) runs"'
  echo ""
  echo "Open Tasks:"
  get_open_tasks | jq -r '.[] | "  [\(.priority // "?")] step:\(.step // "-") \(.name)"'
  echo ""
  echo "Rounds: $(es_list 'ai:round' | jq length)"
  echo "Decisions: $(es_list 'ai:decision' | jq length)"
  echo "Preferences: $(es_list 'ai:preference' | jq length)"
}

# ─── Main ─────────────────────────────────────────────────────

# Health check
if ! curl -sf "$ES_URL/health" > /dev/null 2>&1; then
  echo "ERROR: Cannot reach elementStore at $ES_URL"
  exit 1
fi

if [ "$STATUS_ONLY" = true ]; then show_status; exit 0; fi
if [ "$AGENTS_ONLY" = true ]; then
  es_list "ai:agent" | jq -r 'sort_by(.execution_order // 99) | .[] | "#\(.execution_order // "?") \(.id)\t\(.name)\t\(.title // "")"'
  exit 0
fi
if [ "$TASKS_ONLY" = true ]; then
  get_open_tasks | jq -r '.[] | "[\(.priority // "?")] step:\(.step // "-") \(.status)\t\(.name)"'
  exit 0
fi

# Register worker
worker_start

echo "═══════════════════════════════════════"
echo "  AI Company v4.0 (API-driven server)"
echo "  Worker: $WORKER_ID (PID $$)"
echo "  Store:  $ES_URL"
echo "  Max:    $MAX_ROUNDS rounds"
echo "  Dashboard: http://arc3d.master.local/aic.html"
echo "═══════════════════════════════════════"
echo ""

POLL_INTERVAL=5

# Check if an agent has pending work (new task assigned or question received)
check_agent_triggers() {
  local agent_id="$1"
  local agent_data="$2"
  local triggers
  triggers=$(echo "$agent_data" | jq -r '.behavior.trigger_on // ["round"] | .[]')

  for trigger in $triggers; do
    case "$trigger" in
      task_assigned)
        local count
        count=$(es_query "ai:task" "agent_id=$agent_id&status=open" 2>/dev/null | jq 'length' 2>/dev/null || echo 0)
        [ "$count" -gt 0 ] && return 0
        ;;
      question_received)
        local qcount
        qcount=$(es_query "ai:question" "status=open" 2>/dev/null | jq --arg a "$agent_id" '[.[] | select(.to_agents != null and (.to_agents | index($a)) != null)] | length' 2>/dev/null || echo 0)
        [ "$qcount" -gt 0 ] && return 0
        ;;
      message_pending)
        # Check for pending messages directed to this agent
        local mcount=0
        if [ "$agent_id" = "agent:owner" ]; then
          mcount=$(es_query "ai:message" "user_id=owner&role=user&status=pending" 2>/dev/null | jq 'length' 2>/dev/null || echo 0)
        else
          mcount=$(es_query "ai:message" "to_agents=$agent_id&status=pending" 2>/dev/null | jq 'length' 2>/dev/null || echo 0)
        fi
        [ "$mcount" -gt 0 ] && return 0
        ;;
      scheduled)
        # Check for scheduled messages/tasks whose time has arrived
        local now_ts
        now_ts=$(date +%s)
        local sched_count
        sched_count=$(es_query "ai:message" "agent_id=$agent_id&status=scheduled" 2>/dev/null | jq --argjson now "$now_ts" '[.[] | select(.metadata.scheduled_at != null) | select((.metadata.scheduled_at | split("T")[0:2] | join("T") | sub("Z$";"") | . as $t | now) <= $now)] | length' 2>/dev/null || echo 0)
        [ "$sched_count" -gt 0 ] && return 0
        ;;
    esac
  done
  return 1
}

# Read behavior field from agent (embedded object)
agent_behavior() {
  local agent_data="$1" field="$2" default="$3"
  echo "$agent_data" | jq -r --arg f "$field" --arg d "${default:-}" '.behavior[$f] // $d'
}

# Check agent cooldown
check_cooldown() {
  local agent_data="$1"
  local cooldown last_run
  cooldown=$(agent_behavior "$agent_data" "cooldown" "0")
  last_run=$(echo "$agent_data" | jq -r '.last_run // ""')
  [ -z "$last_run" ] && return 0
  [ "$cooldown" = "0" ] && return 0

  local last_ts now_ts
  last_ts=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$last_run" "+%s" 2>/dev/null || date -d "$last_run" "+%s" 2>/dev/null || echo 0)
  now_ts=$(date "+%s")
  local elapsed=$((now_ts - last_ts))
  [ "$elapsed" -ge "$cooldown" ] && return 0
  return 1
}

# Health check — create a test message to verify store → WS → dashboard pipeline
wlog "Sending health message to verify pipeline..."
es_create "ai:message" "$(jq -n \
  --arg now "$(NOW)" --arg wid "$WORKER_ID" \
  '{class_id:"ai:message", user_id:"system", agent_id:$wid, role:"system", content:"AIC worker started — health check", status:"complete", metadata:{type:"health"}, created:$now}'
)" > /dev/null 2>&1 && wlog "Health message created — if feed is empty, WS or dashboard has a problem" || wlog "ERROR: could not create health message"

round_count=0
while [ "$round_count" -lt "$MAX_ROUNDS" ]; do
  round_count=$((round_count + 1))
  local_round=$(($(next_round_number) + 1))

  wlog "── Round $local_round ──"
  round_id=$(create_round "$local_round")
  worker_update "{\"current_round\":\"$round_id\",\"rounds_completed\":$round_count}"

  # Run round-shift agents synchronously (execution_order >= 0)
  while IFS= read -r agent_json; do
    [ -z "$agent_json" ] && continue

    agent_id=$(echo "$agent_json" | jq -r '.id')
    agent_name=$(echo "$agent_json" | jq -r '.name')
    local_exec_order=$(echo "$agent_json" | jq -r '.execution_order // 0')

    # Skip trigger-only agents (execution_order < 0)
    if [ "$local_exec_order" -lt 0 ] 2>/dev/null; then
      continue
    fi

    if ! check_cooldown "$agent_json"; then
      wlog "  ⏳ $agent_name: cooling down"
      continue
    fi

    run_agent_sync "$agent_id"
    mark_agent_done "$round_id" "$agent_id"
  done <<< "$(get_agents)"

  worker_update '{"current_agent":null}'

  # Check if all tasks done
  open_count=$(get_open_tasks | jq length)
  if [ "$open_count" -eq 0 ]; then
    complete_round "$round_id" "All tasks complete!"
    wlog "✓ ALL TASKS COMPLETE"
    worker_update '{"status":"idle"}'
    break
  fi

  complete_round "$round_id" "$open_count tasks remaining"
  wlog "→ $open_count tasks still open"

  if [ "$LOOP" = false ]; then
    wlog "(use --loop to continue)"
    break
  fi

  # Event-driven poll: spawn triggered agents between rounds
  wlog "Polling for triggers..."
  worker_update '{"status":"running"}'

  poll_count=0
  while [ "$poll_count" -lt 6 ]; do
    poll_count=$((poll_count + 1))

    while IFS= read -r agent_json; do
      [ -z "$agent_json" ] && continue
      a_id=$(echo "$agent_json" | jq -r '.id')
      a_name=$(echo "$agent_json" | jq -r '.name')

      if check_agent_triggers "$a_id" "$agent_json" && check_cooldown "$agent_json"; then
        wlog "  ⚡ $a_name triggered"
        # Spawn in background — doesn't block other triggers
        spawn_agent "$a_id"
      fi
    done <<< "$(get_agents)"

    worker_update '{"status":"running"}'
    sleep $POLL_INTERVAL
  done

  wlog "Next round..."
done

wlog "═══ Done: $round_count round(s) ═══"
worker_update '{"status":"idle"}'
show_status
