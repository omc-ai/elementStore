#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# es-action-tool.sh — Execute an @action object from ElementStore
#
# Agents call this via Bash tool to run any @action (API call, CLI,
# function, composite) that's been bound to them via action_tools[].
#
# Usage:
#   bash es-action-tool.sh <action_id> [json_params]
#   bash es-action-tool.sh act:cwm-list-servers '{"datacenter":"EU"}'
#   bash es-action-tool.sh act:cwm-power-on '{"name":"myserver"}'
#
# Environment:
#   ES_URL      - ElementStore base URL (default: http://arc3d.master.local/elementStore)
#   ES_TOKEN    - Bearer token for admin auth (required by /action/*/execute endpoint)
#
# Output: JSON result from the action, pretty-printed.
# Errors: non-zero exit + error message on stderr.
#
# ═══════════════════════════════════════════════════════════════════

set -uo pipefail

ACTION_ID="${1:-}"
PARAMS="${2:-{}}"
ES_URL="${ES_URL:-http://arc3d.master.local/elementStore}"
ES_TOKEN="${ES_TOKEN:-}"

if [ -z "$ACTION_ID" ]; then
  echo "Usage: $0 <action_id> [json_params]" >&2
  echo "  action_id   - @action object ID (e.g. act:cwm-list-servers)" >&2
  echo "  json_params - JSON object of action parameters (default: {})" >&2
  echo "" >&2
  echo "Environment:" >&2
  echo "  ES_URL    - ElementStore base URL" >&2
  echo "  ES_TOKEN  - Bearer token for admin auth (required)" >&2
  exit 1
fi

# Validate JSON params
if ! echo "$PARAMS" | jq empty 2>/dev/null; then
  echo "Error: json_params is not valid JSON: $PARAMS" >&2
  exit 1
fi

# Encode action ID for URL (replace : with %3A)
ACTION_URL=$(echo "$ACTION_ID" | sed 's/:/%3A/g')

# Build auth header
AUTH_HEADER=""
if [ -n "$ES_TOKEN" ]; then
  AUTH_HEADER="-H 'Authorization: Bearer $ES_TOKEN'"
fi

# Execute the action via ES REST API
RESPONSE=$(curl -sf \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Disable-Ownership: true' \
  ${ES_TOKEN:+-H "Authorization: Bearer $ES_TOKEN"} \
  "$ES_URL/action/$ACTION_URL/execute" \
  -d "$PARAMS" 2>/dev/null)

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "Error: Failed to call ES API (curl exit $EXIT_CODE)" >&2
  echo "URL: $ES_URL/action/$ACTION_URL/execute" >&2
  echo "Hint: Set ES_TOKEN env var with a valid admin Bearer token" >&2
  exit $EXIT_CODE
fi

# Check for ES error response
if echo "$RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
  ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error')
  echo "Action error: $ERROR_MSG" >&2
  # Provide helpful hint for auth errors
  if echo "$ERROR_MSG" | grep -q "auth\|token\|Admin"; then
    echo "Hint: Set ES_TOKEN env var with a valid admin Bearer token" >&2
  fi
  exit 1
fi

# Print result as formatted JSON
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
