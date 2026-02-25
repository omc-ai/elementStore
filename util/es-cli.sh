#!/usr/bin/env bash
# =============================================================================
# es.sh — Universal ElementStore CLI
#
# COMMANDS (grouped by aliases):
#   set | setObject | upsert        Create or update one or more objects
#   get | getObject                 Fetch a single object
#   list | query                    List / search objects with filters & pagination
#   find                            Find object by ID across all classes
#   push                            Bulk import: storage → storage
#   pull                            Bulk export: storage → storage
#   classes                         List all class IDs
#   health                          Connectivity check
#
# STORAGE DESCRIPTORS  (used in --url, --from, --to)
#   http://host/path               ElementStore HTTP API
#   https://host/path              ElementStore HTTPS API
#   ./relative/file.json           Local JSON file   (read or write)
#   /absolute/file.json            Local JSON file
#   file:./relative/file.json      Explicit local file prefix (same as above)
#
# USAGE
#   es.sh <command> [options]
#
# OPTIONS
#   --url    <storage>     Default storage (read & write). $ES_URL if omitted.
#   --from   <storage>     Source storage  (overrides --url for reads)
#   --to     <storage>     Target storage  (overrides --url for writes)
#   --class  <class-id>    Target class  (e.g. @api-project)
#   --id     <id>          Object ID     (e.g. api-project.haat)
#   --data   <json>        Inline JSON payload (for set)
#   --file   <path>        JSON file to read from (for set/push)
#   --out    <path>        Write output to file instead of stdout
#   --out-dir <dir>        Output directory (for pull --all)
#   --filter <k=v>         Filter  (repeatable; maps to ?k=v query params)
#   --limit  <n>           Max objects to return  (maps to ?_limit)
#   --offset <n>           Skip first N objects   (maps to ?_offset)
#   --sort   <field>       Sort by field           (maps to ?_sort)
#   --order  <asc|desc>    Sort direction          (maps to ?_order, default asc)
#   --related              Resolve relation fields on get
#   --force                Pass force=true on genesis / class operations
#   --token  <jwt>         Bearer token. $ES_TOKEN if omitted.
#   --dry-run              Show what would happen, no API calls
#   -v | --verbose         Show HTTP request/response details
#   -h | --help            Show this help
#
# ENVIRONMENT
#   ES_URL      Default ElementStore base URL
#   ES_TOKEN    Default JWT bearer token
#
# EXAMPLES
#   # Health check
#   es.sh health --url http://arc3d.master.local/elementStore
#
#   # Get one object
#   es.sh get --class @api-project --id api-project.haat
#
#   # List with filter and pagination
#   es.sh list --class @api-endpoint --filter api_project_id=api-project.haat --limit 20 --sort name
#
#   # Create / update one object (inline)
#   es.sh set --class @api-project --data '{"id":"api-project.demo","name":"Demo","base_url":"http://demo.local"}'
#
#   # Create / update from file (single object or array)
#   es.sh set --file db/@api-project.json
#
#   # Push genesis (classes + seed data) into elementStore
#   es.sh push --from db/@registry.genesis.json --to http://arc3d.master.local/elementStore
#
#   # Genesis "seed" section uses storage descriptors (resolved relative to genesis file):
#   #   { "classes": [...], "seed": [
#   #       { "storage": "./@api-project.json" },        # data array → push objects
#   #       { "storage": "./projects/haat/@genesis.json" } # sub-genesis → recurse
#   #   ]}
#   # Sub-genesis files can have their own seed[], enabling per-project data trees.
#
#   # Push data file into elementStore
#   es.sh push --from db/@api-endpoint.json --to http://arc3d.master.local/elementStore
#
#   # Pull one class to file
#   es.sh pull --class @api-project --from http://arc3d.master.local/elementStore --to db/@api-project.json
#
#   # Pull all classes into a directory
#   es.sh pull --all --from http://arc3d.master.local/elementStore --to-dir db/
#
#   # Sync between two elementStores
#   es.sh push --class @api-project --from http://staging/elementStore --to http://prod/elementStore
#
#   # Find object by ID across all classes
#   es.sh find --id api-project.haat
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; GRAY='\033[0;37m'; NC='\033[0m'

_ok()   { echo -e "${GREEN}✓${NC} $*"; }
_info() { echo -e "${BLUE}ℹ${NC} $*"; }
_warn() { echo -e "${YELLOW}⚠${NC} $*"; }
_err()  { echo -e "${RED}✗${NC} $*" >&2; }
_step() { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }
_dim()  { [[ "$VERBOSE" == true ]] && echo -e "${GRAY}  $*${NC}" >&2 || true; }

# ── Global state ──────────────────────────────────────────────────────────────
CMD=""
URL_DEFAULT="${ES_URL:-}"
FROM_STORAGE=""
TO_STORAGE=""
CLASS_ID=""
OBJECT_ID=""
DATA_INLINE=""
DATA_FILE=""
OUT_FILE=""
OUT_DIR="."
FILTERS=()
LIMIT=""
OFFSET=""
SORT_FIELD=""
SORT_ORDER=""
RESOLVE_RELATED=false
FORCE=false
DRY_RUN=false
VERBOSE=false
PUSH_ALL=false
PUSH_GENESIS=false
TOKEN="${ES_TOKEN:-}"

PASS=0; FAIL=0; SKIP=0

# ── Usage ─────────────────────────────────────────────────────────────────────
usage() {
    # Print only the top header block: skip shebang, stop at first non-comment non-blank line
    awk 'NR==1{next} /^[^#[:space:]]/{exit} {sub(/^# ?/,""); print}' "$0"
    exit 0
}

# ── Argument parsing ──────────────────────────────────────────────────────────
[[ $# -eq 0 ]] && usage

CMD="$1"; shift
[[ "$CMD" == "--help" || "$CMD" == "-h" || "$CMD" == "help" ]] && usage

while [[ $# -gt 0 ]]; do
    case $1 in
        --url)      URL_DEFAULT="$2";   shift 2 ;;
        --from)     FROM_STORAGE="$2";  shift 2 ;;
        --to)       TO_STORAGE="$2";    shift 2 ;;
        --class)    CLASS_ID="$2";      shift 2 ;;
        --id)       OBJECT_ID="$2";     shift 2 ;;
        --data)     DATA_INLINE="$2";   shift 2 ;;
        --file)     DATA_FILE="$2";     shift 2 ;;
        --out)      OUT_FILE="$2";      shift 2 ;;
        --out-dir)  OUT_DIR="$2";       shift 2 ;;
        --filter)   FILTERS+=("$2");    shift 2 ;;
        --limit)    LIMIT="$2";         shift 2 ;;
        --offset)   OFFSET="$2";        shift 2 ;;
        --sort)     SORT_FIELD="$2";    shift 2 ;;
        --order)    SORT_ORDER="$2";    shift 2 ;;
        --token)    TOKEN="$2";         shift 2 ;;
        --related)  RESOLVE_RELATED=true; shift ;;
        --all)      PUSH_ALL=true;      shift ;;
        --genesis)  PUSH_GENESIS=true;  shift ;;
        --force)    FORCE=true;         shift ;;
        --dry-run)  DRY_RUN=true;       shift ;;
        -v|--verbose) VERBOSE=true;     shift ;;
        -h|--help)  usage ;;
        *) _err "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Normalise command aliases ─────────────────────────────────────────────────
case "$CMD" in
    set|setObject|upsert)   CMD="set" ;;
    get|getObject)          CMD="get" ;;
    list|query)             CMD="list" ;;
    find)                   CMD="find" ;;
    push)                   CMD="push" ;;
    pull)                   CMD="pull" ;;
    classes)                CMD="classes" ;;
    health)                 CMD="health" ;;
    *) _err "Unknown command: ${CMD}. Run es.sh --help for usage."; exit 1 ;;
esac

# ── Dependency check ──────────────────────────────────────────────────────────
command -v jq   &>/dev/null || { _err "jq required: brew install jq"; exit 1; }
command -v curl &>/dev/null || { _err "curl required"; exit 1; }

# ── Storage helpers ───────────────────────────────────────────────────────────

# Detect if a storage descriptor is a local file path
_is_file() {
    local s="$1"
    [[ "$s" == file:* || "$s" == ./* || "$s" == ../* || "$s" == /* ]] && return 0
    # No http prefix and not empty → treat as file
    [[ -n "$s" && "$s" != http://* && "$s" != https://* ]] && return 0
    return 1
}

# Strip file: prefix → bare path
_file_path() {
    echo "${1#file:}"
}

# Strip trailing slash from URL
_url() {
    echo "${1%/}"
}

# Resolve effective read (--from) and write (--to) storages
_read_storage() {
    echo "${FROM_STORAGE:-$URL_DEFAULT}"
}
_write_storage() {
    echo "${TO_STORAGE:-$URL_DEFAULT}"
}

# URL-encode a string via python3 (always available on macOS/Linux)
_urlencode() {
    python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$1" 2>/dev/null || echo "$1"
}

# Build query string from filters + pagination
_build_query() {
    local params=()
    for f in "${FILTERS[@]+"${FILTERS[@]}"}"; do
        local k="${f%%=*}"
        local v="${f#*=}"
        params+=("$(printf '%s=%s' "$(_urlencode "$k")" "$(_urlencode "$v")")")
    done
    [[ -n "$LIMIT"      ]] && params+=("_limit=${LIMIT}")
    [[ -n "$OFFSET"     ]] && params+=("_offset=${OFFSET}")
    [[ -n "$SORT_FIELD" ]] && params+=("_sort=${SORT_FIELD}")
    [[ -n "$SORT_ORDER" ]] && params+=("_order=${SORT_ORDER}")
    local qs
    qs=$(IFS='&'; echo "${params[*]+"${params[*]}"}")
    [[ -n "$qs" ]] && echo "?${qs}" || echo ""
}

# ── HTTP helpers ──────────────────────────────────────────────────────────────
_RESP_FILE="/tmp/es_cli_$$.json"
trap 'rm -f "$_RESP_FILE"' EXIT

# Execute curl; prints HTTP status code to stdout, body to $_RESP_FILE
_http() {
    local method="$1"
    local url="$2"
    local body="${3:-}"

    _dim "${method} ${url}"
    [[ -n "$body" ]] && _dim "  body: $(echo "$body" | jq -c '.' 2>/dev/null | cut -c1-120)"

    if [[ "$DRY_RUN" == true ]]; then
        echo -e "${YELLOW}[dry-run]${NC} ${method} ${url}" >&2
        [[ -n "$body" ]] && echo "  $(echo "$body" | jq -c '.' 2>/dev/null | cut -c1-200)" >&2
        echo '{}' > "$_RESP_FILE"
        echo "200"
        return
    fi

    local args=(-s -o "$_RESP_FILE" -w "%{http_code}" -X "$method")
    args+=(-H "Content-Type: application/json")
    args+=(-H "Accept: application/json")
    args+=(-H "X-Allow-Custom-Ids: true")
    [[ -n "$TOKEN" ]] && args+=(-H "Authorization: Bearer ${TOKEN}")
    [[ -n "$body"  ]] && args+=(-d "$body")

    curl "${args[@]}" "$url" 2>/dev/null
}

_resp()      { cat "$_RESP_FILE" 2>/dev/null || echo '{}'; }
_resp_err()  { _resp | jq -r '.error // .message // .' 2>/dev/null | head -1; }
_resp_pp()   { _resp | jq '.' 2>/dev/null || _resp; }

# ── Storage read: fetch from ES API or local file ─────────────────────────────
_storage_read_class() {
    local storage="$1"
    local class="$2"
    local qs="${3:-}"

    if _is_file "$storage"; then
        local path
        path=$(_file_path "$storage")
        [[ ! -f "$path" ]] && { _err "File not found: ${path}"; return 1; }
        cat "$path"
    else
        local base
        base=$(_url "$storage")
        local enc
        enc=$(_urlencode "$class")
        local code
        code=$(_http "GET" "${base}/store/${enc}${qs}")
        if [[ "$code" != "200" ]]; then
            _err "GET ${base}/store/${enc} → HTTP ${code}: $(_resp_err)"
            return 1
        fi
        _resp
    fi
}

_storage_read_one() {
    local storage="$1"
    local class="$2"
    local id="$3"

    if _is_file "$storage"; then
        local path
        path=$(_file_path "$storage")
        [[ ! -f "$path" ]] && { _err "File not found: ${path}"; return 1; }
        local obj
        obj=$(jq --arg id "$id" '
            if type == "array" then .[] | select(.id == $id)
            elif type == "object" then if .id == $id then . else empty end
            else empty end
        ' "$path" 2>/dev/null | head -1)
        [[ -z "$obj" ]] && { _err "Object not found: ${id} in ${path}"; return 1; }
        echo "$obj"
    else
        local base enc_c enc_id
        base=$(_url "$storage")
        enc_c=$(_urlencode "$class")
        enc_id=$(_urlencode "$id")
        local code
        code=$(_http "GET" "${base}/store/${enc_c}/${enc_id}")
        if [[ "$code" != "200" ]]; then
            _err "GET → HTTP ${code}: $(_resp_err)"
            return 1
        fi
        _resp
    fi
}

# ── Storage write: upsert to ES API or local file ─────────────────────────────

# Upsert a single object into an ES API endpoint
_api_upsert() {
    local base="$1"
    local class="$2"
    local id="$3"
    local body="$4"
    local label="${class}/${id}"

    local enc_c enc_id
    enc_c=$(_urlencode "$class")
    enc_id=$(_urlencode "$id")

    local code
    code=$(_http "PUT" "${base}/store/${enc_c}/${enc_id}" "$body")

    if [[ "$code" == "200" || "$code" == "201" ]]; then
        _ok "Updated  ${label}"; ((PASS++)) || true
    elif [[ "$code" == "404" ]]; then
        code=$(_http "POST" "${base}/store/${enc_c}" "$body")
        if [[ "$code" == "200" || "$code" == "201" ]]; then
            _ok "Created  ${label}"; ((PASS++)) || true
        else
            _err "Failed   ${label} (POST ${code}): $(_resp_err)"; ((FAIL++)) || true
        fi
    else
        _err "Failed   ${label} (PUT ${code}): $(_resp_err)"; ((FAIL++)) || true
    fi
}

# Push a class definition (with props inline) to ES API
_api_push_class() {
    local base="$1"
    local class_id="$2"
    local body="$3"
    local code
    code=$(_http "POST" "${base}/class" "$body")
    if [[ "$code" == "200" || "$code" == "201" ]]; then
        _ok "Class    ${class_id}"; ((PASS++)) || true
    else
        _err "Failed   class ${class_id} (${code}): $(_resp_err)"; ((FAIL++)) || true
    fi
}

# Write objects to a local file (upsert into array)
_file_upsert() {
    local path="$1"
    local objects_json="$2"   # JSON array of objects

    if [[ "$DRY_RUN" == true ]]; then
        _warn "[dry-run] would write to: ${path}"
        return
    fi

    mkdir -p "$(dirname "$path")"

    local existing="[]"
    [[ -f "$path" ]] && existing=$(cat "$path")

    # Merge: update existing by id, append new
    local merged
    merged=$(jq -n \
        --argjson existing "$existing" \
        --argjson new "$objects_json" '
        ($existing | if type == "array" then . else [] end) as $base |
        ($new | if type == "array" then . else [.] end) as $incoming |
        $incoming | reduce .[] as $obj (
            $base;
            if any(.[]; .id == $obj.id) then
                map(if .id == $obj.id then $obj else . end)
            else
                . + [$obj]
            end
        )
    ' 2>/dev/null)

    echo "$merged" | jq '.' > "$path"
    local count
    count=$(echo "$objects_json" | jq 'if type=="array" then length else 1 end')
    _ok "Written ${count} object(s) → ${path}"; ((PASS++)) || true
}

# ── Dispatch: route objects to correct storage ────────────────────────────────
_write_objects() {
    local storage="$1"
    local objects_json="$2"   # must be a JSON array
    local hint_class="${3:-}" # optional class hint for file naming

    if _is_file "$storage"; then
        local path
        path=$(_file_path "$storage")
        _file_upsert "$path" "$objects_json"
    else
        local base
        base=$(_url "$storage")
        local total
        total=$(echo "$objects_json" | jq 'length')
        while IFS= read -r obj; do
            local oc oid
            oc=$(echo "$obj"  | jq -r '.class_id')
            oid=$(echo "$obj" | jq -r '.id')
            [[ "$oc" == "null" || -z "$oc" ]] && { _warn "Skipping (no class_id)"; ((SKIP++)) || true; continue; }
            [[ "$oid" == "null" || -z "$oid" ]] && { _warn "Skipping (no id)"; ((SKIP++)) || true; continue; }
            _api_upsert "$base" "$oc" "$oid" "$obj"
        done < <(echo "$objects_json" | jq -c '.[]')
    fi
}

# ── Storage descriptor parsing ────────────────────────────────────────────────
#
# A seed storage descriptor can be:
#   String shorthand:   "./path.json"  → cast to { type: "json_file", url: "./path.json" }
#   Object (full form): { "type": "json_file", "url": "./path.json" }
#
# Supported types:
#   json_file     — local JSON file (default for file paths)
#   http          — remote HTTP/HTTPS URL
#   elementStore  — remote elementStore API (requires class_id on seed entry)
#

# Parse a seed entry's storage field → outputs "type url" on stdout
# Input: raw JSON of the seed entry, e.g. {"storage":"./data.json"} or {"storage":{"type":"http","url":"..."}}
_parse_seed_storage() {
    local seed_entry_json="$1"
    local raw_storage
    raw_storage=$(echo "$seed_entry_json" | jq -r '.storage')

    # Check if storage is an object (jq returns "object" for type)
    local storage_type_check
    storage_type_check=$(echo "$seed_entry_json" | jq -r '.storage | type')

    if [[ "$storage_type_check" == "object" ]]; then
        # Full descriptor object
        local stype surl
        stype=$(echo "$seed_entry_json" | jq -r '.storage.type // "json_file"')
        surl=$(echo "$seed_entry_json" | jq -r '.storage.url // ""')
        echo "${stype} ${surl}"
    else
        # String shorthand → auto-detect type from URL pattern
        if [[ "$raw_storage" == http://* || "$raw_storage" == https://* ]]; then
            echo "http ${raw_storage}"
        else
            echo "json_file ${raw_storage}"
        fi
    fi
}

# Resolve a file-type URL relative to a base directory.
_resolve_file_url() {
    local url="$1"
    local base_dir="${2:-}"

    # Strip file: prefix
    local bare="${url#file:}"

    # Absolute paths pass through
    [[ "$bare" == /* ]] && { echo "$bare"; return; }

    # Relative path: resolve against base_dir
    if [[ -n "$base_dir" ]]; then
        echo "${base_dir}/${bare}"
    else
        echo "$bare"
    fi
}

_write_genesis() {
    local storage="$1"
    local genesis_json="$2"
    local genesis_dir="${3:-}"   # directory containing the genesis file (for seed resolution)

    if _is_file "$storage"; then
        local path
        path=$(_file_path "$storage")
        if [[ "$DRY_RUN" == true ]]; then
            _warn "[dry-run] would write genesis → ${path}"; return
        fi
        mkdir -p "$(dirname "$path")"
        echo "$genesis_json" | jq '.' > "$path"
        _ok "Written genesis → ${path}"; ((PASS++)) || true
    else
        local base
        base=$(_url "$storage")

        # Push classes (if any — sub-genesis files may have only seed)
        if echo "$genesis_json" | jq -e 'has("classes") and (.classes | length > 0)' &>/dev/null; then
            local class_count
            class_count=$(echo "$genesis_json" | jq '.classes | length')
            _step "Pushing ${class_count} class(es)..."
            while IFS= read -r cls; do
                local cid
                cid=$(echo "$cls" | jq -r '.id')
                _api_push_class "$base" "$cid" "$cls"
            done < <(echo "$genesis_json" | jq -c '.classes[] // empty')
        fi

        # Push objects (optional inline section)
        if echo "$genesis_json" | jq -e 'has("objects")' &>/dev/null; then
            local obj_count
            obj_count=$(echo "$genesis_json" | jq '.objects | length')
            _step "Pushing ${obj_count} object(s)..."
            local objects
            objects=$(echo "$genesis_json" | jq '.objects')
            _write_objects "$base" "$objects"
        fi

        # Process seed entries — typed storage descriptors referencing data or sub-genesis files
        # Each entry has a "storage" field that is either:
        #   - string shorthand: "./path.json" (auto-cast to {type:"json_file", url:"./path.json"})
        #   - full object:      {"type":"json_file","url":"./path.json"}
        if echo "$genesis_json" | jq -e 'has("seed") and (.seed | length > 0)' &>/dev/null; then
            local seed_count
            seed_count=$(echo "$genesis_json" | jq '.seed | length')
            _step "Processing ${seed_count} seed source(s)..."
            while IFS= read -r seed_entry; do
                # Parse the storage descriptor → "type url"
                local parsed stype surl
                parsed=$(_parse_seed_storage "$seed_entry")
                stype="${parsed%% *}"
                surl="${parsed#* }"

                case "$stype" in
                    json_file)
                        # Resolve relative file path from genesis directory
                        local seed_path
                        seed_path=$(_resolve_file_url "$surl" "$genesis_dir")
                        if [[ ! -f "$seed_path" ]]; then
                            _warn "Seed not found: ${seed_path}"; ((SKIP++)) || true; continue
                        fi
                        local seed_json seed_dir
                        seed_json=$(cat "$seed_path")
                        seed_dir=$(dirname "$seed_path")

                        # Detect format: genesis (recurse) vs data array vs single object
                        if echo "$seed_json" | jq -e 'type == "object" and (has("classes") or has("seed"))' &>/dev/null; then
                            _info "Seed genesis: ${surl}"
                            _write_genesis "$storage" "$seed_json" "$seed_dir"
                        elif echo "$seed_json" | jq -e 'type == "array"' &>/dev/null; then
                            local n
                            n=$(echo "$seed_json" | jq 'length')
                            _info "Seed data: ${surl} (${n} objects)"
                            _write_objects "$storage" "$seed_json"
                        elif echo "$seed_json" | jq -e 'type == "object" and has("id")' &>/dev/null; then
                            _info "Seed data: ${surl} (1 object)"
                            _write_objects "$storage" "$(echo "$seed_json" | jq '[.]')"
                        else
                            _warn "Seed unknown format: ${surl}"; ((SKIP++)) || true
                        fi
                        ;;

                    http|elementStore)
                        # Remote storage — pull class data and push to target
                        _info "Seed remote (${stype}): ${surl}"
                        local remote_class
                        remote_class=$(echo "$seed_entry" | jq -r '.class_id // ""')
                        if [[ -n "$remote_class" ]]; then
                            local data
                            data=$(_storage_read_class "$surl" "$remote_class" "") || { ((SKIP++)) || true; continue; }
                            _write_objects "$storage" "$data"
                        else
                            _warn "Remote seed requires class_id: ${surl}"; ((SKIP++)) || true
                        fi
                        ;;

                    *)
                        _warn "Unknown seed storage type: ${stype}"; ((SKIP++)) || true
                        ;;
                esac
            done < <(echo "$genesis_json" | jq -c '.seed[] // empty')
        fi
    fi
}

# ── Check connectivity ────────────────────────────────────────────────────────
_check_connectivity() {
    local storage="$1"
    _is_file "$storage" && return 0   # files are always "reachable"

    local base
    base=$(_url "$storage")
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "${base}/health" 2>/dev/null || echo "000")
    if [[ "$code" != "200" ]]; then
        _err "Cannot reach ${base}/health (HTTP ${code})"
        return 1
    fi
    _ok "Connected → ${base}"
}

# ── Output helper: print or write to file ─────────────────────────────────────
_output() {
    local data="$1"
    local label="${2:-result}"
    if [[ -n "$OUT_FILE" ]]; then
        mkdir -p "$(dirname "$OUT_FILE")"
        echo "$data" | jq '.' > "$OUT_FILE"
        _ok "Written: ${OUT_FILE}"
    else
        echo "$data" | jq '.'
    fi
}

# =============================================================================
# COMMANDS
# =============================================================================

# ── health ────────────────────────────────────────────────────────────────────
cmd_health() {
    local s
    s=$(_read_storage)
    [[ -z "$s" ]] && { _err "No storage specified (--url or ES_URL)"; exit 1; }
    _is_file "$s" && { _info "Storage is a local file — no connectivity check needed"; exit 0; }
    local base
    base=$(_url "$s")
    _info "Checking ${base}..."
    local code
    code=$(curl -s -o "$_RESP_FILE" -w "%{http_code}" "${base}/health" 2>/dev/null || echo "000")
    if [[ "$code" == "200" ]]; then
        _ok "Healthy"; _resp_pp
    else
        _err "HTTP ${code}"; _resp_pp; exit 1
    fi
}

# ── classes ───────────────────────────────────────────────────────────────────
cmd_classes() {
    local s
    s=$(_read_storage)
    [[ -z "$s" ]] && { _err "No storage specified (--url or ES_URL)"; exit 1; }

    if _is_file "$s"; then
        local path
        path=$(_file_path "$s")
        jq -r '.[].class_id // empty' "$path" 2>/dev/null | sort -u
        return
    fi

    local base code
    base=$(_url "$s")
    code=$(_http "GET" "${base}/class")
    [[ "$code" != "200" ]] && { _err "HTTP ${code}: $(_resp_err)"; exit 1; }

    if [[ -n "$OUT_FILE" ]]; then
        _resp | jq '[.[].id]' > "$OUT_FILE"; _ok "Written: ${OUT_FILE}"
    else
        _resp | jq -r '.[].id'
    fi
}

# ── get ───────────────────────────────────────────────────────────────────────
cmd_get() {
    [[ -z "$CLASS_ID"  ]] && { _err "Missing --class"; exit 1; }
    [[ -z "$OBJECT_ID" ]] && { _err "Missing --id";    exit 1; }

    local s
    s=$(_read_storage)
    [[ -z "$s" ]] && { _err "No storage (--url/--from or ES_URL)"; exit 1; }

    _check_connectivity "$s" || exit 1

    local data
    data=$(_storage_read_one "$s" "$CLASS_ID" "$OBJECT_ID") || exit 1

    # --related: also fetch each relation field's target
    if [[ "$RESOLVE_RELATED" == true ]] && ! _is_file "$s"; then
        local base
        base=$(_url "$s")
        local enc_c enc_id
        enc_c=$(_urlencode "$CLASS_ID")
        enc_id=$(_urlencode "$OBJECT_ID")

        # Get class props to find relation fields
        local code
        code=$(_http "GET" "${base}/class/${enc_c}/props")
        if [[ "$code" == "200" ]]; then
            local rel_keys
            rel_keys=$(_resp | jq -r '.[] | select(.data_type == "relation") | .key' 2>/dev/null)
            for key in $rel_keys; do
                local rel_code rel_data
                rel_code=$(_http "GET" "${base}/store/${enc_c}/${enc_id}/${key}?mode=resolve")
                if [[ "$rel_code" == "200" ]]; then
                    rel_data=$(_resp)
                    data=$(echo "$data" | jq --arg k "$key" --argjson v "$rel_data" '. + {($k + "__resolved"): $v}')
                fi
            done
        fi
    fi

    _output "$data"
}

# ── list / query ──────────────────────────────────────────────────────────────
cmd_list() {
    [[ -z "$CLASS_ID" ]] && { _err "Missing --class"; exit 1; }

    local s
    s=$(_read_storage)
    [[ -z "$s" ]] && { _err "No storage (--url/--from or ES_URL)"; exit 1; }

    _check_connectivity "$s" || exit 1

    local qs
    qs=$(_build_query)

    # Use /query/ for filter+sort, /store/ otherwise
    local data
    if _is_file "$s"; then
        data=$(_storage_read_class "$s" "$CLASS_ID" "") || exit 1
        # Apply filters locally
        for f in "${FILTERS[@]+"${FILTERS[@]}"}"; do
            local k="${f%%=*}" v="${f#*=}"
            data=$(echo "$data" | jq --arg k "$k" --arg v "$v" '[.[] | select(.[$k] == $v)]')
        done
        [[ -n "$SORT_FIELD" ]] && data=$(echo "$data" | jq --arg f "$SORT_FIELD" 'sort_by(.[$f])')
        [[ -n "$LIMIT"      ]] && data=$(echo "$data" | jq --argjson n "$LIMIT"  '.[:$n]')
    else
        local base enc_c endpoint
        base=$(_url "$s")
        enc_c=$(_urlencode "$CLASS_ID")
        if [[ ${#FILTERS[@]} -gt 0 || -n "$SORT_FIELD" || -n "$LIMIT" ]]; then
            endpoint="/query/${enc_c}${qs}"
        else
            endpoint="/store/${enc_c}"
        fi
        local code
        code=$(_http "GET" "${base}${endpoint}")
        [[ "$code" != "200" ]] && { _err "HTTP ${code}: $(_resp_err)"; exit 1; }
        data=$(_resp)
    fi

    _output "$data"
}

# ── find ──────────────────────────────────────────────────────────────────────
cmd_find() {
    [[ -z "$OBJECT_ID" ]] && { _err "Missing --id"; exit 1; }

    local s
    s=$(_read_storage)
    [[ -z "$s" ]] && { _err "No storage (--url/--from or ES_URL)"; exit 1; }

    if _is_file "$s"; then
        local path
        path=$(_file_path "$s")
        local obj
        obj=$(jq --arg id "$OBJECT_ID" '[.[] | select(.id == $id)] | first // empty' "$path" 2>/dev/null)
        [[ -z "$obj" ]] && { _err "Not found: ${OBJECT_ID}"; exit 1; }
        _output "$obj"; return
    fi

    _check_connectivity "$s" || exit 1
    local base enc code
    base=$(_url "$s")
    enc=$(_urlencode "$OBJECT_ID")
    code=$(_http "GET" "${base}/find/${enc}")
    [[ "$code" != "200" ]] && { _err "HTTP ${code}: $(_resp_err)"; exit 1; }
    _output "$(_resp)"
}

# ── set / upsert ──────────────────────────────────────────────────────────────
cmd_set() {
    local payload=""

    # Resolve payload: inline > file > stdin
    if [[ -n "$DATA_INLINE" ]]; then
        payload="$DATA_INLINE"
    elif [[ -n "$DATA_FILE" ]]; then
        [[ ! -f "$DATA_FILE" ]] && { _err "File not found: ${DATA_FILE}"; exit 1; }
        payload=$(cat "$DATA_FILE")
    else
        _err "Provide --data '<json>' or --file <path>"; exit 1
    fi

    local s
    s=$(_write_storage)
    [[ -z "$s" ]] && { _err "No target storage (--url/--to or ES_URL)"; exit 1; }

    _check_connectivity "$s" || exit 1

    # Resolve genesis directory for seed file resolution
    local _genesis_dir=""
    [[ -n "$DATA_FILE" ]] && _genesis_dir="$(dirname "$DATA_FILE")"

    # Detect payload type and dispatch
    if echo "$payload" | jq -e 'type == "object" and (has("classes") or has("seed"))' &>/dev/null; then
        _write_genesis "$s" "$payload" "$_genesis_dir"
    elif echo "$payload" | jq -e 'type == "array"' &>/dev/null; then
        _write_objects "$s" "$payload"
    elif echo "$payload" | jq -e 'type == "object" and has("id") and has("class_id")' &>/dev/null; then
        local objs
        objs=$(echo "$payload" | jq '[.]')
        _write_objects "$s" "$objs"
    else
        _err "Unrecognised payload format. Expected genesis, array, or single object."; exit 1
    fi
}

# ── push ──────────────────────────────────────────────────────────────────────
cmd_push() {
    local from
    from="${FROM_STORAGE:-${DATA_FILE:-$URL_DEFAULT}}"
    local to
    to="${TO_STORAGE:-$URL_DEFAULT}"

    [[ -z "$from" ]] && { _err "Specify source: --from <storage> or --file <path>"; exit 1; }
    [[ -z "$to"   ]] && { _err "Specify target: --to <storage> or --url / ES_URL"; exit 1; }

    _check_connectivity "$to" || exit 1

    # If source is a file, read and dispatch by format
    if _is_file "$from"; then
        local path
        path=$(_file_path "$from")
        [[ ! -f "$path" ]] && { _err "File not found: ${path}"; exit 1; }
        local json
        json=$(cat "$path")
        _info "Reading: ${path}"

        if echo "$json" | jq -e 'type == "object" and (has("classes") or has("seed"))' &>/dev/null; then
            _write_genesis "$to" "$json" "$(dirname "$path")"
        elif echo "$json" | jq -e 'type == "array"' &>/dev/null; then
            _step "Pushing $(echo "$json" | jq 'length') object(s)..."
            _write_objects "$to" "$json"
        else
            _err "Unrecognised JSON format in ${path}"; exit 1
        fi

    # If source is an ES API, pull class(es) and push to target
    else
        [[ -z "$CLASS_ID" && "$PUSH_ALL" == false ]] && {
            _err "Specify --class <id> or --all when source is an ElementStore URL"; exit 1
        }
        _check_connectivity "$from" || exit 1
        local base_from
        base_from=$(_url "$from")

        if [[ "$PUSH_ALL" == true ]]; then
            local code
            code=$(_http "GET" "${base_from}/class")
            [[ "$code" != "200" ]] && { _err "Could not list classes"; exit 1; }
            local class_ids
            class_ids=$(_resp | jq -r '.[] | select(.id | startswith("@") | not) | .id')
            while IFS= read -r cid; do
                [[ -z "$cid" ]] && continue
                _step "Class: ${cid}"
                local data
                data=$(_storage_read_class "$from" "$cid" "") || continue
                _write_objects "$to" "$data"
            done <<< "$class_ids"
        else
            local qs data
            qs=$(_build_query)
            data=$(_storage_read_class "$from" "$CLASS_ID" "$qs") || exit 1
            _step "Pushing $(echo "$data" | jq 'length') object(s) of ${CLASS_ID}..."
            _write_objects "$to" "$data"
        fi
    fi
}

# ── pull ──────────────────────────────────────────────────────────────────────
cmd_pull() {
    local from
    from="${FROM_STORAGE:-$URL_DEFAULT}"

    [[ -z "$from" ]] && { _err "Specify source: --from <storage> or ES_URL"; exit 1; }
    _check_connectivity "$from" || exit 1

    local to
    to="${TO_STORAGE:-}"

    # -- genesis
    if [[ "$PUSH_GENESIS" == true ]]; then
        _is_file "$from" && { _err "--genesis requires a remote ElementStore source"; exit 1; }
        local base code
        base=$(_url "$from")
        code=$(_http "GET" "${base}/genesis/data")
        [[ "$code" != "200" ]] && { _err "HTTP ${code}: $(_resp_err)"; exit 1; }
        local data
        data=$(_resp)
        if [[ -n "$to" ]]; then
            _write_genesis "$to" "$data"
        elif [[ -n "$OUT_FILE" ]]; then
            echo "$data" | jq '.' > "$OUT_FILE"; _ok "Written: ${OUT_FILE}"
        else
            echo "$data" | jq '.'
        fi
        return
    fi

    # -- all classes
    if [[ "$PUSH_ALL" == true ]]; then
        _is_file "$from" && { _err "--all requires a remote ElementStore source"; exit 1; }
        local base code
        base=$(_url "$from")
        code=$(_http "GET" "${base}/class")
        [[ "$code" != "200" ]] && { _err "Could not list classes"; exit 1; }
        local class_ids
        class_ids=$(_resp | jq -r '.[] | select(.id | startswith("@") | not) | .id')
        while IFS= read -r cid; do
            [[ -z "$cid" ]] && continue
            _info "Pulling ${cid}..."
            local enc data
            enc=$(_urlencode "$cid")
            code=$(_http "GET" "${base}/store/${enc}")
            [[ "$code" != "200" ]] && { _warn "Skipped ${cid} (HTTP ${code})"; continue; }
            data=$(_resp)
            local dest
            if [[ -n "$to" ]]; then
                if _is_file "$to"; then
                    dest="${to%/}/${cid}.json"
                    dest="${dest#file:}"
                    _write_objects "$dest" "$data"
                else
                    _write_objects "$to" "$data"
                fi
            else
                dest="${OUT_DIR}/${cid}.json"
                echo "$data" | jq '.' > "$dest"
                _ok "Written: ${dest}"
            fi
        done <<< "$class_ids"
        return
    fi

    # -- single class
    [[ -z "$CLASS_ID" ]] && { _err "Specify --class <id>, --all, or --genesis"; exit 1; }

    local qs data
    qs=$(_build_query)
    data=$(_storage_read_class "$from" "$CLASS_ID" "$qs") || exit 1

    if [[ -n "$to" ]]; then
        _write_objects "$to" "$data"
    elif [[ -n "$OUT_FILE" ]]; then
        echo "$data" | jq '.' > "$OUT_FILE"; _ok "Written: ${OUT_FILE}"
    else
        _output "$data"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

case "$CMD" in
    health)  cmd_health  ;;
    classes) cmd_classes ;;
    get)     cmd_get     ;;
    list)    cmd_list    ;;
    find)    cmd_find    ;;
    set)     cmd_set     ;;
    push)    cmd_push    ;;
    pull)    cmd_pull    ;;
esac

# ── Summary (only shown when multiple ops happened) ───────────────────────────
if [[ $((PASS + FAIL + SKIP)) -gt 1 ]]; then
    echo ""
    echo -e "─────────────────────────────────"
    [[ $PASS -gt 0 ]] && echo -e " ${GREEN}✓ OK      : ${PASS}${NC}"
    [[ $SKIP -gt 0 ]] && echo -e " ${YELLOW}⚠ Skipped : ${SKIP}${NC}"
    [[ $FAIL -gt 0 ]] && echo -e " ${RED}✗ Failed  : ${FAIL}${NC}"
    echo -e "─────────────────────────────────"
fi

[[ $FAIL -gt 0 ]] && exit 1
exit 0
