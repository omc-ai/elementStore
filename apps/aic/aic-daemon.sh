#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# aic-daemon.sh — Cross-platform self-managing AIC service
#
# Auto-restarts on failure. Works on macOS, Linux, WSL.
# Registers itself as ai:worker in elementStore.
# Run once — it stays alive until explicitly stopped.
#
# Usage:
#   ./aic-daemon.sh start       # Start daemon (backgrounds itself)
#   ./aic-daemon.sh stop        # Stop daemon
#   ./aic-daemon.sh status      # Check if running
#   ./aic-daemon.sh restart     # Stop + start
#   ./aic-daemon.sh install     # Add to shell profile for auto-start
# ═══════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="/tmp/aic-daemon.pid"
LOG_FILE="/tmp/aic-daemon.log"
ES_URL="${ES_URL:-http://arc3d.master.local/elementStore}"
MAX_RESTARTS=100
RESTART_DELAY=10

is_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null
}

do_start() {
  if is_running; then
    echo "AIC daemon already running (PID $(cat "$PID_FILE"))"
    return 0
  fi

  echo "Starting AIC daemon..."
  nohup bash "$SCRIPT_DIR/aic-daemon.sh" _run > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "AIC daemon started (PID $!)"
  echo "Log: tail -f $LOG_FILE"
}

do_stop() {
  if ! is_running; then
    echo "AIC daemon not running"
    rm -f "$PID_FILE"
    return 0
  fi
  local pid=$(cat "$PID_FILE")
  echo "Stopping AIC daemon (PID $pid)..."
  kill "$pid" 2>/dev/null
  # Also kill child processes
  pkill -P "$pid" 2>/dev/null
  pkill -f "agent-run.sh" 2>/dev/null
  rm -f "$PID_FILE"
  echo "Stopped"
}

do_status() {
  if is_running; then
    local pid=$(cat "$PID_FILE")
    echo "AIC daemon: RUNNING (PID $pid)"
    echo "Log: $LOG_FILE"
    # Check agent processes
    local agents=$(ps aux | grep "agent-run.sh" | grep -v grep | wc -l | tr -d ' ')
    echo "Agent workers: $agents running"
    # Check from store
    curl -sf "$ES_URL/store/ai:worker" 2>/dev/null | python3 -c "
import json,sys
for w in json.load(sys.stdin):
    print(f'  {w.get(\"id\",\"?\"):25s} status={w.get(\"status\",\"?\")} rounds={w.get(\"rounds_completed\",0)}')
" 2>/dev/null || true
  else
    echo "AIC daemon: STOPPED"
  fi
}

do_install() {
  local shell_rc=""
  if [ -n "$ZSH_VERSION" ] || [ -f ~/.zshrc ]; then
    shell_rc=~/.zshrc
  elif [ -f ~/.bashrc ]; then
    shell_rc=~/.bashrc
  elif [ -f ~/.bash_profile ]; then
    shell_rc=~/.bash_profile
  fi

  if [ -z "$shell_rc" ]; then
    echo "Could not detect shell RC file"
    return 1
  fi

  local alias_line="alias aic='bash $SCRIPT_DIR/aic-daemon.sh'"
  local auto_line="# Auto-start AIC daemon"
  local start_line="[ -z \"\$(pgrep -f aic-daemon.sh)\" ] && bash $SCRIPT_DIR/aic-daemon.sh start 2>/dev/null &"

  if ! grep -q "aic-daemon" "$shell_rc" 2>/dev/null; then
    echo "" >> "$shell_rc"
    echo "$alias_line" >> "$shell_rc"
    echo "$auto_line" >> "$shell_rc"
    echo "$start_line" >> "$shell_rc"
    echo "Added to $shell_rc:"
    echo "  alias: aic start|stop|status|restart"
    echo "  auto-start on shell open"
  else
    echo "Already installed in $shell_rc"
  fi
}

# Internal: the actual run loop with auto-restart
do_run() {
  local restart_count=0

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] AIC daemon started (PID $$)"

  # Register daemon in store
  curl -sf -X POST "$ES_URL/store/ai:worker" \
    -H 'Content-Type: application/json' \
    -H 'X-Allow-Custom-Ids: true' \
    -d "{\"id\":\"worker:daemon\",\"class_id\":\"ai:worker\",\"name\":\"AIC Daemon\",\"status\":\"running\",\"pid\":$$,\"started\":\"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\",\"last_heartbeat\":\"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\",\"rounds_completed\":0,\"es_url\":\"$ES_URL\"}" > /dev/null 2>&1

  while [ "$restart_count" -lt "$MAX_RESTARTS" ]; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting server.sh (attempt $((restart_count + 1)))"

    # Run the actual server
    bash "$SCRIPT_DIR/server.sh" --loop --max 999

    local exit_code=$?
    restart_count=$((restart_count + 1))

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] server.sh exited with code $exit_code (restart $restart_count/$MAX_RESTARTS)"

    # Update store
    curl -sf -X PUT "$ES_URL/store/ai:worker/worker:daemon" \
      -H 'Content-Type: application/json' \
      -d "{\"status\":\"restarting\",\"last_heartbeat\":\"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\",\"rounds_completed\":$restart_count}" > /dev/null 2>&1

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restarting in ${RESTART_DELAY}s..."
    sleep $RESTART_DELAY
  done

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Max restarts reached. Daemon exiting."
  curl -sf -X PUT "$ES_URL/store/ai:worker/worker:daemon" \
    -H 'Content-Type: application/json' \
    -d '{"status":"stopped"}' > /dev/null 2>&1
}

# ─── Main ─────────────────────────────────────────────────
case "${1:-status}" in
  start)   do_start ;;
  stop)    do_stop ;;
  status)  do_status ;;
  restart) do_stop; sleep 1; do_start ;;
  install) do_install ;;
  _run)    do_run ;;
  *)       echo "Usage: $0 {start|stop|status|restart|install}" ;;
esac
