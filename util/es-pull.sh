#!/usr/bin/env bash
# =============================================================================
# es-pull.sh — Pull data from an ElementStore instance into local JSON files.
#
# Modes:
#   --class <@class-id>   Export all objects of one class to a JSON file
#   --all                 Export all non-system classes (one file each) into --out-dir
#   --genesis             Export the full genesis snapshot (GET /genesis/data)
#
# Usage:
#   es-pull.sh --class @api-project --url http://host/elementStore [--out file.json]
#   es-pull.sh --all     --url http://host/elementStore [--out-dir ./db]
#   es-pull.sh --genesis --url http://host/elementStore [--out genesis.json]
#
# Options:
#   --class   <id>      Class ID to export (e.g. @api-project)
#   --all               Export every non-system class
#   --genesis           Export full genesis snapshot via GET /genesis/data
#   --url    <url>      ElementStore base URL  (default: $ES_URL env var)
#   --token  <jwt>      Bearer token           (default: $ES_TOKEN env var)
#   --out    <file>     Output file  (used with --class or --genesis)
#   --out-dir <dir>     Output directory       (used with --all, default: .)
#   --dry-run           Print what would be fetched without writing files
#   --help              Show this help
#
# Environment variables:
#   ES_URL      ElementStore base URL
#   ES_TOKEN    JWT bearer token
#
# Examples:
#   es-pull.sh --class @api-project --url http://arc3d.master.local/elementStore --out db/@api-project.json
#   es-pull.sh --all     --url http://arc3d.master.local/elementStore --out-dir db/
#   es-pull.sh --genesis --url http://arc3d.master.local/elementStore --out db/@registry.genesis.json
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
info() { echo -e "${BLUE}ℹ${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }
step() { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }

# ── Defaults ──────────────────────────────────────────────────────────────────
MODE=""
CLASS_ID=""
URL="${ES_URL:-}"
TOKEN="${ES_TOKEN:-}"
OUT_FILE=""
OUT_DIR="."
DRY_RUN=false
PULLED=0

# ── Argument parsing ──────────────────────────────────────────────────────────
usage() {
    grep '^#' "$0" | grep -v '^#!/' | sed 's/^# \{0,1\}//'
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --class)    MODE="class"; CLASS_ID="$2"; shift 2 ;;
        --all)      MODE="all";   shift ;;
        --genesis)  MODE="genesis"; shift ;;
        --url)      URL="$2";    shift 2 ;;
        --token)    TOKEN="$2";  shift 2 ;;
        --out)      OUT_FILE="$2"; shift 2 ;;
        --out-dir)  OUT_DIR="$2";  shift 2 ;;
        --dry-run)  DRY_RUN=true; shift ;;
        --help|-h)  usage ;;
        *) err "Unknown option: $1"; exit 1 ;;
    esac
done

[[ -z "$MODE" ]] && { err "Specify --class <id>, --all, or --genesis. Use --help."; exit 1; }
[[ -z "$URL" ]]  && { err "Missing --url (or set ES_URL). Use --help."; exit 1; }
command -v jq   &>/dev/null || { err "jq is required: brew install jq"; exit 1; }
command -v curl &>/dev/null || { err "curl is required"; exit 1; }

URL="${URL%/}"

# ── HTTP helper ───────────────────────────────────────────────────────────────
do_get() {
    local endpoint="$1"
    local full_url="${URL}${endpoint}"

    if [[ "$DRY_RUN" == true ]]; then
        echo -e "  ${YELLOW}[dry-run]${NC} GET ${full_url}"
        echo "[]"
        return
    fi

    local args=(-s -H "Accept: application/json")
    [[ -n "$TOKEN" ]] && args+=(-H "Authorization: Bearer ${TOKEN}")

    curl "${args[@]}" "$full_url"
}

write_file() {
    local path="$1"
    local content="$2"
    if [[ "$DRY_RUN" == true ]]; then
        warn "[dry-run] would write: ${path}"
        return
    fi
    mkdir -p "$(dirname "$path")"
    echo "$content" | jq '.' > "$path"
    ok "Written: ${path}"
    ((PULLED++))
}

# ── Header ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}es-pull${NC} — ElementStore Export"
echo -e "  mode : ${CYAN}${MODE}${NC}"
echo -e "  url  : ${CYAN}${URL}${NC}"
[[ "$DRY_RUN" == true ]] && echo -e "  mode : ${YELLOW}DRY RUN${NC}"
echo ""

# Check connectivity
if [[ "$DRY_RUN" == false ]]; then
    info "Checking elementStore connectivity..."
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${URL}/health" 2>/dev/null || echo "000")
    if [[ "$HTTP" != "200" ]]; then
        err "Cannot reach ${URL}/health (HTTP ${HTTP})"
        exit 1
    fi
    ok "Connected to ${URL}"
fi

# ── Mode: single class ────────────────────────────────────────────────────────
if [[ "$MODE" == "class" ]]; then
    step "Fetching class: ${CLASS_ID}"
    encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$CLASS_ID" 2>/dev/null || echo "$CLASS_ID")
    data=$(do_get "/store/${encoded}")

    # Default output file
    [[ -z "$OUT_FILE" ]] && OUT_FILE="${OUT_DIR}/${CLASS_ID}.json"

    COUNT=$(echo "$data" | jq 'length' 2>/dev/null || echo "?")
    info "Objects: ${COUNT}"
    write_file "$OUT_FILE" "$data"

# ── Mode: all classes ─────────────────────────────────────────────────────────
elif [[ "$MODE" == "all" ]]; then
    step "Fetching class list..."
    classes=$(do_get "/class")
    class_ids=$(echo "$classes" | jq -r '.[] | select(.id | startswith("@") | not) | .id' 2>/dev/null || echo "")
    all_ids=$(echo "$classes" | jq -r '.[].id' 2>/dev/null || echo "")

    # Use all classes if no non-system ones
    [[ -z "$class_ids" ]] && class_ids="$all_ids"

    COUNT=$(echo "$class_ids" | grep -c . || true)
    info "Classes to export: ${COUNT}"

    while IFS= read -r cid; do
        [[ -z "$cid" ]] && continue
        encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$cid" 2>/dev/null || echo "$cid")
        data=$(do_get "/store/${encoded}")
        n=$(echo "$data" | jq 'length' 2>/dev/null || echo "?")
        info "  ${cid}: ${n} objects"
        write_file "${OUT_DIR}/${cid}.json" "$data"
    done <<< "$class_ids"

# ── Mode: genesis snapshot ────────────────────────────────────────────────────
elif [[ "$MODE" == "genesis" ]]; then
    step "Fetching genesis data..."
    data=$(do_get "/genesis/data")

    [[ -z "$OUT_FILE" ]] && OUT_FILE="${OUT_DIR}/@genesis-export.json"
    write_file "$OUT_FILE" "$data"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "─────────────────────────────────"
echo -e " ${GREEN}✓ Files written: ${PULLED}${NC}"
echo -e "─────────────────────────────────"
exit 0
