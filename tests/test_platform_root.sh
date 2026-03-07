#!/usr/bin/env bash
# =============================================================================
# Integration Test: Platform Root → ElementStore round-trip
#
# Tests the full lifecycle:
#   1. Init — delete + reload platform_root via es-cli init
#   2. Verify — class definitions have genesis_file and genesis_dir
#   3. Update class — modify @project, verify genesis write-back
#   4. Update object — modify @installation, verify seed write-back
#   5. Restore — clean up test artifacts
#
# USAGE:
#   bash tests/test_platform_root.sh
#   ES_URL=http://other-host/elementStore bash tests/test_platform_root.sh
#
# PREREQUISITES:
#   - ElementStore API running (Docker or local)
#   - platform_root/.es/ directory exists with genesis + seed files
#   - jq, curl installed
# =============================================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ES_CLI="${SCRIPT_DIR}/../util/es-cli.sh"
ES_URL="${ES_URL:-http://arc3d.master.local/elementStore}"
AGURA_DEV="${AGURA_DEV:-/Users/asi/OrbStack/docker/volumes/agura_code}"
PLATFORM_ROOT="${AGURA_DEV}/platform_root"
PLATFORM_ES_DIR="${PLATFORM_ROOT}/.es"

# Server-side path (inside Docker container)
SERVER_ES_DIR="/var/www/platform_root/.es"

# ── Colors & helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

PASS=0; FAIL=0; SKIP=0
_pass() { echo -e "  ${GREEN}PASS${NC} $*"; ((PASS++)) || true; }
_fail() { echo -e "  ${RED}FAIL${NC} $*"; ((FAIL++)) || true; }
_skip() { echo -e "  ${YELLOW}SKIP${NC} $*"; ((SKIP++)) || true; }
_step() { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }
_info() { echo -e "  ${BLUE}ℹ${NC} $*"; }

# Wait for Docker volume writes to sync to macOS host (OrbStack delay)
# Named volumes use filesystem-level sync that may take 1-3s to propagate
_wait_sync() { sleep 3; }

# ── Preflight checks ────────────────────────────────────────────────────────
command -v jq   &>/dev/null || { echo "ERROR: jq required"; exit 1; }
command -v curl &>/dev/null || { echo "ERROR: curl required"; exit 1; }
[[ -f "$ES_CLI" ]]          || { echo "ERROR: es-cli not found at ${ES_CLI}"; exit 1; }
[[ -d "$PLATFORM_ES_DIR" ]] || { echo "ERROR: platform_root .es/ not found at ${PLATFORM_ES_DIR}"; exit 1; }

# Check API connectivity
_step "Preflight: checking API at ${ES_URL}"
health_code=$(curl -s -o /dev/null -w "%{http_code}" "${ES_URL}/health" 2>/dev/null || echo "000")
if [[ "$health_code" != "200" ]]; then
    echo "ERROR: Cannot reach ${ES_URL}/health (HTTP ${health_code})"
    exit 1
fi
_pass "API reachable"

# Ensure PHP-FPM (www-data) can write to platform_root .es/ files
# The PHP process runs as www-data but files may be owned by root
ES_CONTAINER="${ES_CONTAINER:-elementstore_php83}"
_info "Ensuring write permissions on ${SERVER_ES_DIR} (container: ${ES_CONTAINER})"
docker exec "$ES_CONTAINER" chown -R www-data:www-data "$SERVER_ES_DIR" 2>/dev/null || _info "Could not fix permissions — write-back tests may fail"

# ── Backup files ─────────────────────────────────────────────────────────────
# Backup ALL .es/ JSON files inside the container BEFORE T1 — API deletes
# trigger seedDeleteBack which empties seed data files on disk.
# We backup inside the container to avoid OrbStack host↔container sync delays.
CONTAINER_BACKUP="/tmp/es_test_backup_$$"
docker exec "$ES_CONTAINER" mkdir -p "$CONTAINER_BACKUP"
docker exec "$ES_CONTAINER" sh -c "cp ${SERVER_ES_DIR}/*.json ${CONTAINER_BACKUP}/"
trap 'docker exec "$ES_CONTAINER" rm -rf "$CONTAINER_BACKUP" 2>/dev/null; true' EXIT

# Also keep a host-side backup for T3/T5 file restore checks
BACKUP_DIR="/tmp/es_test_backup_$$"
mkdir -p "$BACKUP_DIR/es"
for f in "${PLATFORM_ES_DIR}"/*.json; do
    [[ -f "$f" ]] && cp "$f" "$BACKUP_DIR/es/"
done

# =============================================================================
# T1. INIT — Clean + reload platform_root via es-cli
# =============================================================================
_step "T1. Init — clean + reload platform_root via es-cli"

# Step 1a: Delete existing registry classes (if any)
_info "Deleting existing registry classes..."
del_output=$("$ES_CLI" delete --class-filter "@" --force --include-class-def --url "$ES_URL" 2>&1) || true
del_count=$(echo "$del_output" | grep -c "Deleted" || echo "0")
_info "Cleaned ${del_count} items"

# Step 1b: Restore seed files inside container (avoids OrbStack sync delays)
docker exec "$ES_CONTAINER" sh -c "cp ${CONTAINER_BACKUP}/*.json ${SERVER_ES_DIR}/"

# Step 1c: Load genesis via es init (reload only)
init_output=$("$ES_CLI" init --es-dir "$SERVER_ES_DIR" --url "$ES_URL" --force 2>&1) || true
echo "$init_output" | sed 's/^/  │ /'

# Check for success marker (strip ANSI codes)
clean_output=$(echo "$init_output" | sed 's/\x1b\[[0-9;]*m//g')
if echo "$clean_output" | grep -q "Loaded.*classes"; then
    loaded_line=$(echo "$clean_output" | grep "Loaded.*classes")
    _pass "es init: ${loaded_line##*✓ }"
else
    _fail "es init did not report success"
    echo "$clean_output" | tail -5 | sed 's/^/  │ /'
fi

# Verify: @project class exists
proj_code=$(curl -s -o /tmp/es_proj_$$.json -w "%{http_code}" \
    -H "X-Allow-Custom-Ids: true" "${ES_URL}/class/%40project" 2>/dev/null || echo "000")
if [[ "$proj_code" == "200" ]]; then
    _pass "@project class loaded"
else
    _fail "@project class not found (HTTP ${proj_code})"
fi

# Verify: @project objects exist
proj_obj_code=$(curl -s -o /tmp/es_proj_objs_$$.json -w "%{http_code}" \
    -H "X-Allow-Custom-Ids: true" "${ES_URL}/store/%40project" 2>/dev/null || echo "000")
if [[ "$proj_obj_code" == "200" ]]; then
    proj_count=$(jq 'length' /tmp/es_proj_objs_$$.json 2>/dev/null || echo "0")
    if [[ "$proj_count" -gt 0 ]]; then
        _pass "@project has ${proj_count} objects"
    else
        _fail "@project has 0 objects"
    fi
else
    _fail "Could not list @project objects (HTTP ${proj_obj_code})"
fi

# =============================================================================
# T2. VERIFY — Class definitions have genesis_file and genesis_dir
# =============================================================================
_step "T2. Verify — class definitions have genesis metadata"

for cls in @project @installation @repository; do
    enc_cls=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$cls', safe=''))" 2>/dev/null || echo "$cls")
    class_def=$(curl -s -H "X-Allow-Custom-Ids: true" "${ES_URL}/class/${enc_cls}" 2>/dev/null)

    gf=$(echo "$class_def" | jq -r '.genesis_file // empty')
    gd=$(echo "$class_def" | jq -r '.genesis_dir // empty')

    if [[ -n "$gf" ]]; then
        _pass "${cls} genesis_file = ${gf}"
    else
        _fail "${cls} missing genesis_file"
    fi

    if [[ -n "$gd" ]]; then
        _pass "${cls} genesis_dir = ${gd}"
    else
        _fail "${cls} missing genesis_dir"
    fi
done

# =============================================================================
# T3. UPDATE CLASS — modify @project, verify genesis write-back
# =============================================================================
_step "T3. Update class — test genesis file write-back"

# Get current @project class definition
proj_class=$(curl -s -H "X-Allow-Custom-Ids: true" "${ES_URL}/class/%40project" 2>/dev/null)

# Add a test property
modified_class=$(echo "$proj_class" | jq '.props += [{"id":"@project._test_prop","class_id":"@prop","key":"_test_prop","label":"Test Prop","data_type":"string"}]')

# PUT the modified class
put_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "X-Allow-Custom-Ids: true" \
    "${ES_URL}/class" \
    -d "$modified_class" 2>/dev/null || echo "000")

if [[ "$put_code" == "200" || "$put_code" == "201" ]]; then
    _pass "Class @project updated via API (HTTP ${put_code})"
else
    _fail "Class @project update failed (HTTP ${put_code})"
fi

# Verify write-back: check inside container first, then host
# Verify write-back inside the container (authoritative check — host sync may lag)
container_has=$(docker exec "$ES_CONTAINER" grep -c "_test_prop" "${SERVER_ES_DIR}/@registry.genesis.json" 2>/dev/null | tr -d '[:space:]' || echo "0")
if [[ "$container_has" -gt 0 ]]; then
    _pass "Genesis write-back: _test_prop written to @registry.genesis.json"
else
    _fail "Genesis write-back: _test_prop NOT found in @registry.genesis.json"
fi

# Restore original genesis file (write via container to avoid sync issues)
docker exec "$ES_CONTAINER" sh -c "cat ${SERVER_ES_DIR}/@registry.genesis.json" > /dev/null  # ensure accessible
cat "${BACKUP_DIR}/es/@registry.genesis.json" > "${PLATFORM_ES_DIR}/@registry.genesis.json"
_info "Restored @registry.genesis.json from backup"

# =============================================================================
# T4. UPDATE OBJECT — modify @installation, verify seed write-back
# =============================================================================
_step "T4. Update object — test seed file write-back"

# Check if @installation seed file and objects exist
if [[ ! -f "${PLATFORM_ES_DIR}/@installation.json" ]]; then
    _skip "No @installation.json found — skipping seed write-back test"
else
    # Get first installation object ID
    install_list=$(curl -s -H "X-Allow-Custom-Ids: true" "${ES_URL}/store/%40installation" 2>/dev/null)
    first_id=$(echo "$install_list" | jq -r '.[0].id // empty')

    if [[ -z "$first_id" ]]; then
        _skip "No @installation objects found — skipping seed write-back test"
    else
        _info "Testing with @installation/${first_id}"
        enc_id=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$first_id', safe=''))" 2>/dev/null || echo "$first_id")

        # Get the object
        install_obj=$(curl -s -H "X-Allow-Custom-Ids: true" \
            "${ES_URL}/store/%40installation/${enc_id}" 2>/dev/null)

        # Modify a DEFINED property (domain) — validate() only processes defined props
        original_domain=$(echo "$install_obj" | jq -r '.domain // empty')
        modified_obj=$(echo "$install_obj" | jq '.domain = "INTEGRATION_TEST_MARKER"')

        # PUT the modified object
        put_code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
            -H "Content-Type: application/json" \
            -H "X-Allow-Custom-Ids: true" \
            "${ES_URL}/store/%40installation/${enc_id}" \
            -d "$modified_obj" 2>/dev/null || echo "000")

        if [[ "$put_code" == "200" || "$put_code" == "201" ]]; then
            _pass "Object @installation/${first_id} updated via API"
        else
            _fail "Object update failed (HTTP ${put_code})"
        fi

        # Verify write-back inside the container (authoritative check)
        container_has=$(docker exec "$ES_CONTAINER" grep -c "INTEGRATION_TEST_MARKER" "${SERVER_ES_DIR}/@installation.json" 2>/dev/null | tr -d '[:space:]' || echo "0")
        if [[ "$container_has" -gt 0 ]]; then
            _pass "Seed write-back: marker written to @installation.json"
        else
            _fail "Seed write-back: marker NOT found in @installation.json"
        fi

        # Restore seed file from initial backup
        cat "${BACKUP_DIR}/es/@installation.json" > "${PLATFORM_ES_DIR}/@installation.json"
        _info "Restored @installation.json from backup"
    fi
fi

# =============================================================================
# T5. CLEAN UP — restore all files and delete test data from ES
# =============================================================================
_step "T5. Clean up"

# Restore all seed/genesis files from initial backup
for f in "$BACKUP_DIR"/es/*; do
    [[ -f "$f" ]] && cat "$f" > "${PLATFORM_ES_DIR}/$(basename "$f")"
done
_pass "Files restored"

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo -e "═══════════════════════════════════════"
echo -e " ${BOLD}Integration Test Results${NC}"
echo -e "═══════════════════════════════════════"
[[ $PASS -gt 0 ]] && echo -e " ${GREEN}PASS : ${PASS}${NC}"
[[ $SKIP -gt 0 ]] && echo -e " ${YELLOW}SKIP : ${SKIP}${NC}"
[[ $FAIL -gt 0 ]] && echo -e " ${RED}FAIL : ${FAIL}${NC}"
echo -e "═══════════════════════════════════════"

rm -f /tmp/es_proj_$$.json /tmp/es_proj_objs_$$.json

[[ $FAIL -gt 0 ]] && exit 1
exit 0
