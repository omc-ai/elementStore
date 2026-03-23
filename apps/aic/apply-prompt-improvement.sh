#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# apply-prompt-improvement.sh — CEO approves an agent prompt proposal
#
# Usage:
#   ./apply-prompt-improvement.sh <proposal_id>        # approve & apply
#   ./apply-prompt-improvement.sh <proposal_id> reject  # reject
#   ./apply-prompt-improvement.sh list                  # list pending
#
# The script:
#   1. Fetches the proposal from elementStore
#   2. Shows the proposed addition
#   3. Appends it to the target prompt file (apps/aic/prompts/<file>)
#   4. Updates proposal status → approved/rejected
# ═══════════════════════════════════════════════════════════════════

set -uo pipefail

ES_URL="${ES_URL:-http://arc3d.master.local/elementStore}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPTS_DIR="$SCRIPT_DIR/prompts"

ESH='-H X-Disable-Ownership:true'
es_get()    { curl -sf -H 'X-Disable-Ownership: true' "$ES_URL/query/ai:prompt_proposal?id=$(echo "$1" | sed 's/:/%3A/g')&_limit=1" 2>/dev/null | jq -c '.[0] // empty' 2>/dev/null || true; }
es_update() { curl -sf -X PUT -H 'Content-Type: application/json' -H 'X-Disable-Ownership: true' "$ES_URL/store/ai:prompt_proposal/$1" -d "$2" 2>/dev/null; }
es_query()  { curl -sf -H 'X-Disable-Ownership: true' "$ES_URL/query/ai:prompt_proposal?$1" 2>/dev/null | jq '.' 2>/dev/null; }

NOW() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

# ── List pending proposals ──────────────────────────────────────
if [ "${1:-}" = "list" ] || [ -z "${1:-}" ]; then
  echo ""
  echo "═══ Pending Prompt Proposals ═══════════════════════════════"
  pending=$(curl -sf -H 'X-Disable-Ownership: true' "$ES_URL/query/ai:prompt_proposal?status=pending&_limit=20" 2>/dev/null)
  count=$(echo "$pending" | jq 'length' 2>/dev/null || echo 0)

  if [ "$count" -eq 0 ]; then
    echo "  No pending proposals."
    echo ""
    exit 0
  fi

  echo "$pending" | jq -r '.[] | "  ID: \(.id)\n  Agent: \(.agent_id // "?")\n  File: \(.prompt_file // "?")\n  Rationale: \(.rationale // "?")\n  Created: \(.created // "?")\n  Proposed:\n\(.proposed_addition // "(none)")\n  ───"'
  echo ""
  echo "  Approve: $0 <id>"
  echo "  Reject:  $0 <id> reject"
  echo ""
  exit 0
fi

PROPOSAL_ID="$1"
ACTION="${2:-approve}"

# ── Fetch proposal ───────────────────────────────────────────────
echo "[$(date '+%H:%M:%S')] Fetching proposal: $PROPOSAL_ID"
PROPOSAL=$(es_get "$PROPOSAL_ID")

if [ -z "$PROPOSAL" ] || [ "$PROPOSAL" = "null" ]; then
  echo "ERROR: Proposal not found: $PROPOSAL_ID"
  exit 1
fi

agent_id=$(echo "$PROPOSAL" | jq -r '.agent_id // "?"')
prompt_file=$(echo "$PROPOSAL" | jq -r '.prompt_file // "?"')
rationale=$(echo "$PROPOSAL" | jq -r '.rationale // "?"')
proposed_text=$(echo "$PROPOSAL" | jq -r '.proposed_addition // ""')
status=$(echo "$PROPOSAL" | jq -r '.status // "?"')

if [ "$status" != "pending" ]; then
  echo "ERROR: Proposal status is '$status' (not pending). Cannot process."
  exit 1
fi

echo ""
echo "═══ Prompt Proposal ════════════════════════════════════════"
echo "  ID:      $PROPOSAL_ID"
echo "  Agent:   $agent_id"
echo "  File:    $prompt_file"
echo "  Rationale: $rationale"
echo ""
echo "  Proposed addition:"
echo "─────────────────────────────────────────────────────────────"
echo "$proposed_text"
echo "─────────────────────────────────────────────────────────────"
echo ""

if [ "$ACTION" = "reject" ]; then
  echo "Rejecting proposal..."
  es_update "$PROPOSAL_ID" "$(jq -n \
    --arg now "$(NOW)" \
    '{status:"rejected", reviewed_by:"agent:owner", reviewed_at:$now}')"
  echo "✗ Proposal rejected."
  exit 0
fi

# ── Apply to prompt file ─────────────────────────────────────────
TARGET_FILE="$PROMPTS_DIR/$prompt_file"

if [ ! -f "$TARGET_FILE" ]; then
  echo "ERROR: Prompt file not found: $TARGET_FILE"
  echo "Available files:"
  ls "$PROMPTS_DIR/"
  exit 1
fi

echo "Applying to $TARGET_FILE ..."

# Append the proposed text with a separator
{
  echo ""
  echo "---"
  echo "<!-- Improvement approved $(date -u '+%Y-%m-%d') from proposal $PROPOSAL_ID -->"
  printf '%s\n' "$proposed_text"
} >> "$TARGET_FILE"

echo "✓ Applied to $TARGET_FILE"

# ── Update proposal status ────────────────────────────────────────
es_update "$PROPOSAL_ID" "$(jq -n \
  --arg now "$(NOW)" \
  '{status:"approved", reviewed_by:"agent:owner", reviewed_at:$now}')" > /dev/null 2>&1

echo "✓ Proposal $PROPOSAL_ID marked as approved"
echo ""
echo "The prompt file has been updated. The change will take effect on the next agent run."
