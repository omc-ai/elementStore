#!/usr/bin/env bash
# =============================================================================
# es-push.sh — Push a JSON file into any ElementStore instance.
#
# Supports two input formats:
#   1. Genesis format  { "classes": [ {...}, ... ] }
#      → POST /class for each class (creates or updates class + its props inline)
#
#   2. Data array      [ { "id": "...", "class_id": "...", ... }, ... ]
#      → Upsert each object via PUT /store/{class_id}/{id}
#         Falls back to POST /store/{class_id} if object doesn't exist yet.
#
# Usage:
#   es-push.sh --file <path.json> --url <http://host/elementStore> [OPTIONS]
#
# Options:
#   --file   <path>    Path to the JSON file to import (required)
#   --url    <url>     ElementStore base URL             (default: $ES_URL env var)
#   --token  <jwt>     Bearer token for auth             (default: $ES_TOKEN env var)
#   --force            For genesis: update even if object exists
#   --dry-run          Print what would be sent — no API calls
#   --help             Show this help
#
# Environment variables:
#   ES_URL      ElementStore base URL (e.g. http://arc3d.master.local/elementStore)
#   ES_TOKEN    JWT bearer token
#
# Examples:
#   es-push.sh --file db/@registry.genesis.json --url http://arc3d.master.local/elementStore
#   es-push.sh --file db/@api-project.json      --url http://arc3d.master.local/elementStore
#   ES_URL=http://localhost/elementStore es-push.sh --file db/@api-endpoint.json
# =============================================================================

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
info() { echo -e "${BLUE}ℹ${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }
step() { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }

# ── Defaults ─────────────────────────────────────────────────────────────────
FILE=""
URL="${ES_URL:-}"
TOKEN="${ES_TOKEN:-}"
FORCE=false
DRY_RUN=false
PASSED=0
FAILED=0
SKIPPED=0

# ── Argument parsing ──────────────────────────────────────────────────────────
usage() {
    grep '^#' "$0" | grep -v '^#!/' | sed 's/^# \{0,1\}//'
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --file)    FILE="$2";  shift 2 ;;
        --url)     URL="$2";   shift 2 ;;
        --token)   TOKEN="$2"; shift 2 ;;
        --force)   FORCE=true; shift   ;;
        --dry-run) DRY_RUN=true; shift ;;
        --help|-h) usage ;;
        *) err "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Validate ──────────────────────────────────────────────────────────────────
[[ -z "$FILE" ]]  && { err "Missing --file. Use --help for usage."; exit 1; }
[[ -z "$URL" ]]   && { err "Missing --url (or set ES_URL). Use --help for usage."; exit 1; }
[[ ! -f "$FILE" ]] && { err "File not found: $FILE"; exit 1; }
command -v jq   &>/dev/null || { err "jq is required: brew install jq"; exit 1; }
command -v curl &>/dev/null || { err "curl is required"; exit 1; }

URL="${URL%/}"  # strip trailing slash

# ── Auth header ───────────────────────────────────────────────────────────────
AUTH_HEADER=""
[[ -n "$TOKEN" ]] && AUTH_HEADER="-H \"Authorization: Bearer ${TOKEN}\""

# ── HTTP helpers ──────────────────────────────────────────────────────────────

# Execute a curl call, print result, return HTTP status code
# Usage: do_request METHOD endpoint body_json
do_request() {
    local method="$1"
    local endpoint="$2"
    local body="${3:-}"
    local full_url="${URL}${endpoint}"

    if [[ "$DRY_RUN" == true ]]; then
        echo -e "  ${YELLOW}[dry-run]${NC} ${method} ${full_url}"
        [[ -n "$body" ]] && echo "  $(echo "$body" | jq -c '.' 2>/dev/null || echo "$body")"
        echo "200"
        return
    fi

    local args=(-s -o /tmp/es_push_resp.txt -w "%{http_code}" -X "$method")
    args+=(-H "Content-Type: application/json")
    args+=(-H "X-Allow-Custom-Ids: true")
    [[ -n "$TOKEN" ]] && args+=(-H "Authorization: Bearer ${TOKEN}")
    [[ -n "$body" ]]  && args+=(-d "$body")

    local http_code
    http_code=$(curl "${args[@]}" "$full_url" 2>/dev/null)
    echo "$http_code"
}

get_response() { cat /tmp/es_push_resp.txt 2>/dev/null || echo '{}'; }

# Upsert a single object: PUT first, POST on 404
upsert_object() {
    local class_id="$1"
    local obj_id="$2"
    local body="$3"
    local label="${class_id}/${obj_id}"

    local encoded_class
    encoded_class=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$class_id" 2>/dev/null \
                    || echo "$class_id")
    local encoded_id
    encoded_id=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$obj_id" 2>/dev/null \
                 || echo "$obj_id")

    local http_code
    http_code=$(do_request "PUT" "/store/${encoded_class}/${encoded_id}" "$body")

    if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
        ok "Updated  ${label}"
        ((PASSED++))
    elif [[ "$http_code" == "404" ]]; then
        # Object doesn't exist — create it
        http_code=$(do_request "POST" "/store/${encoded_class}" "$body")
        if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
            ok "Created  ${label}"
            ((PASSED++))
        else
            err "Failed   ${label} (POST ${http_code}): $(get_response | jq -r '.error // .' 2>/dev/null)"
            ((FAILED++))
        fi
    else
        err "Failed   ${label} (PUT ${http_code}): $(get_response | jq -r '.error // .' 2>/dev/null)"
        ((FAILED++))
    fi
}

# Push a class (with its props inline)
push_class() {
    local class_id="$1"
    local body="$2"

    local encoded_class
    encoded_class=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$class_id" 2>/dev/null \
                    || echo "$class_id")

    local http_code
    http_code=$(do_request "POST" "/class" "$body")

    if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
        ok "Class    ${class_id}"
        ((PASSED++))
    else
        err "Failed   class ${class_id} (${http_code}): $(get_response | jq -r '.error // .' 2>/dev/null)"
        ((FAILED++))
    fi
}

# ── Detect format and import ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}es-push${NC} — ElementStore Import"
echo -e "  file : ${CYAN}${FILE}${NC}"
echo -e "  url  : ${CYAN}${URL}${NC}"
[[ "$DRY_RUN" == true ]] && echo -e "  mode : ${YELLOW}DRY RUN${NC}"
echo ""

JSON=$(cat "$FILE")

# Check connectivity first (unless dry-run)
if [[ "$DRY_RUN" == false ]]; then
    info "Checking elementStore connectivity..."
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${URL}/health" 2>/dev/null || echo "000")
    if [[ "$HTTP" != "200" ]]; then
        err "Cannot reach ${URL}/health (HTTP ${HTTP})"
        err "Check the URL or start the elementStore server."
        exit 1
    fi
    ok "Connected to ${URL}"
fi

# ── Genesis format: { "classes": [...] } ─────────────────────────────────────
if echo "$JSON" | jq -e 'type == "object" and has("classes")' &>/dev/null; then
    step "Genesis format detected"

    # Count
    CLASS_COUNT=$(echo "$JSON" | jq '.classes | length')
    OBJECT_COUNT=$(echo "$JSON" | jq 'if has("objects") then .objects | length else 0 end')
    info "Classes: ${CLASS_COUNT}  |  Objects: ${OBJECT_COUNT}"

    # Push classes
    step "Pushing classes..."
    while IFS= read -r class_obj; do
        class_id=$(echo "$class_obj" | jq -r '.id')
        push_class "$class_id" "$class_obj"
    done < <(echo "$JSON" | jq -c '.classes[]')

    # Push objects (if present)
    if echo "$JSON" | jq -e 'has("objects")' &>/dev/null; then
        step "Pushing objects..."
        while IFS= read -r obj; do
            obj_class=$(echo "$obj" | jq -r '.class_id')
            obj_id=$(echo "$obj" | jq -r '.id')
            [[ "$obj_class" == "null" || "$obj_id" == "null" ]] && { warn "Skipping object without id/class_id"; ((SKIPPED++)); continue; }
            upsert_object "$obj_class" "$obj_id" "$obj"
        done < <(echo "$JSON" | jq -c '.objects[]')
    fi

# ── Data array format: [ { "id": "...", "class_id": "...", ... } ] ───────────
elif echo "$JSON" | jq -e 'type == "array"' &>/dev/null; then
    TOTAL=$(echo "$JSON" | jq 'length')
    step "Data array format detected (${TOTAL} objects)"

    while IFS= read -r obj; do
        obj_class=$(echo "$obj" | jq -r '.class_id')
        obj_id=$(echo "$obj" | jq -r '.id')
        if [[ "$obj_class" == "null" || "$obj_id" == "null" ]]; then
            warn "Skipping object without id/class_id: $(echo "$obj" | jq -c '.' | cut -c1-80)"
            ((SKIPPED++))
            continue
        fi
        upsert_object "$obj_class" "$obj_id" "$obj"
    done < <(echo "$JSON" | jq -c '.[]')

# ── Single object format: { "id": "...", "class_id": "...", ... } ─────────────
elif echo "$JSON" | jq -e 'type == "object" and has("id") and has("class_id")' &>/dev/null; then
    step "Single object detected"
    obj_class=$(echo "$JSON" | jq -r '.class_id')
    obj_id=$(echo "$JSON" | jq -r '.id')
    upsert_object "$obj_class" "$obj_id" "$JSON"

else
    err "Unrecognised JSON format."
    err "Expected one of:"
    err "  - Genesis:      { \"classes\": [...] }"
    err "  - Data array:   [ { \"id\": \"...\", \"class_id\": \"...\", ... } ]"
    err "  - Single obj:   { \"id\": \"...\", \"class_id\": \"...\", ... }"
    exit 1
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo -e "─────────────────────────────────"
echo -e " ${GREEN}✓ Pushed  :${NC} ${PASSED}"
[[ $SKIPPED -gt 0 ]] && echo -e " ${YELLOW}⚠ Skipped :${NC} ${SKIPPED}"
[[ $FAILED  -gt 0 ]] && echo -e " ${RED}✗ Failed  :${NC} ${FAILED}"
echo -e "─────────────────────────────────"

[[ $FAILED -gt 0 ]] && exit 1
exit 0
