#!/usr/bin/env bash
# =============================================================================
# es-view.sh — ElementStore data viewer for the command line
#
# Fetches data from an ElementStore API and renders it as formatted text:
# tables, cards, key-value lists, or cross-class pivot matrices.
#
# USAGE
#   es-view.sh <view> [options]
#
# VIEWS
#   table   <class>           Tabular list of objects (auto-detect columns)
#   card    <class> [id]      Detailed card per object (all fields)
#   matrix  <class> <row-field> <col-field> [val-field]
#                             Cross-class pivot table
#   raw     <class> [id]      Pretty-printed JSON (uses jq)
#
# OPTIONS
#   --url    <url>            ElementStore base URL  [$ES_URL]
#   --token  <jwt>            Bearer token           [$ES_TOKEN]
#   --filter <k=v>            Filter (repeatable)
#   --limit  <n>              Max records (default 200)
#   --cols   <a,b,c>          Columns to show in table view (comma-separated)
#   --col-width <n>           Max column width (default 30)
#   --sep    <char>           Column separator (default "  ")
#   --no-header               Skip header row in table view
#   --no-color                Disable ANSI colors
#   --title  <text>           Custom title displayed above output
#
# ENVIRONMENT
#   ES_URL      Default ElementStore base URL
#   ES_TOKEN    Default JWT bearer token
#
# EXAMPLES
#   # List all features as a table
#   es-view.sh table @feature --url http://arc3d.master.local/elementStore
#
#   # Show specific columns
#   es-view.sh table @feature --cols id,name,category,group,scope
#
#   # Detailed card for one object
#   es-view.sh card @app app:es-php-backend
#
#   # Filter + table
#   es-view.sh table @app_feature --filter application_id=app:es-php-backend --cols feature_id,progress,notes
#
#   # Cross-class pivot matrix: feature (rows) x app (cols), value = progress
#   es-view.sh matrix @app_feature feature_id application_id progress \
#     --url http://arc3d.master.local/elementStore
#
#   # Pretty JSON
#   es-view.sh raw @feature feat:object_crud
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'
GRAY='\033[0;37m'; DIM='\033[2m'; NC='\033[0m'

USE_COLOR=true
_c()    { [[ "$USE_COLOR" == true ]] && printf "%b" "$1" || true; }
_h()    { [[ "$USE_COLOR" == true ]] && printf "%b%s%b" "${BOLD}${CYAN}" "$1" "${NC}" || printf "%s" "$1"; }
_dim()  { [[ "$USE_COLOR" == true ]] && printf "%b%s%b" "${GRAY}" "$1" "${NC}" || printf "%s" "$1"; }
_ok()   { [[ "$USE_COLOR" == true ]] && printf "%b%s%b\n" "${GREEN}" "$1" "${NC}" || printf "%s\n" "$1"; }
_err()  { printf "%b✗ %s%b\n" "${RED}" "$1" "${NC}" >&2; exit 1; }
_warn() { printf "%b⚠ %s%b\n" "${YELLOW}" "$1" "${NC}" >&2; }

# ── Args ──────────────────────────────────────────────────────────────────────
VIEW=""
CLASS_ID=""
OBJECT_ID=""
ES_BASE="${ES_URL:-}"
ES_JWT="${ES_TOKEN:-}"
FILTERS=()
FILTERS+=("")   # dummy to avoid unbound in set -u; cleaned up in _build_qs
LIMIT=200
COLS=""
COL_WIDTH=30
SEP="  "
SHOW_HEADER=true
TITLE=""
MATRIX_ROW=""
MATRIX_COL=""
MATRIX_VAL="progress"

_usage() {
  grep '^#' "$0" | grep -v '^#!/' | sed 's/^# \{0,1\}//' | head -50
  exit 0
}

# Parse positional + flags
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)        _usage ;;
    --url)            ES_BASE="$2";    shift 2 ;;
    --token)          ES_JWT="$2";     shift 2 ;;
    --filter)         FILTERS+=("$2"); shift 2 ;;
    --limit)          LIMIT="$2";      shift 2 ;;
    --cols)           COLS="$2";       shift 2 ;;
    --col-width)      COL_WIDTH="$2";  shift 2 ;;
    --sep)            SEP="$2";        shift 2 ;;
    --no-header)      SHOW_HEADER=false; shift ;;
    --no-color)       USE_COLOR=false; shift ;;
    --title)          TITLE="$2";      shift 2 ;;
    -*)               _err "Unknown option: $1" ;;
    *)                POSITIONAL+=("$1"); shift ;;
  esac
done

[[ ${#POSITIONAL[@]} -gt 0 ]] && VIEW="${POSITIONAL[0]}"
[[ ${#POSITIONAL[@]} -gt 1 ]] && CLASS_ID="${POSITIONAL[1]}"
[[ ${#POSITIONAL[@]} -gt 2 ]] && OBJECT_ID="${POSITIONAL[2]}"  # or matrix row-field
[[ ${#POSITIONAL[@]} -gt 3 ]] && MATRIX_COL="${POSITIONAL[3]}"
[[ ${#POSITIONAL[@]} -gt 4 ]] && MATRIX_VAL="${POSITIONAL[4]}"

# For matrix: positional[2]=row-field, [3]=col-field, [4]=val-field
if [[ "$VIEW" == "matrix" ]]; then
  MATRIX_ROW="${POSITIONAL[2]:-}"
  MATRIX_COL="${POSITIONAL[3]:-}"
  MATRIX_VAL="${POSITIONAL[4]:-progress}"
  OBJECT_ID=""
fi

[[ -z "$VIEW" ]]     && _err "No view specified. Run with --help."
[[ -z "$CLASS_ID" ]] && _err "No class specified."
[[ -z "$ES_BASE" ]]  && _err "No ElementStore URL. Set --url or \$ES_URL."

ES_BASE="${ES_BASE%/}"

# ── HTTP helpers ───────────────────────────────────────────────────────────────
_auth_header() {
  [[ -n "$ES_JWT" ]] && echo "-H \"Authorization: Bearer $ES_JWT\"" || echo ""
}

_curl() {
  local url="$1"
  if [[ -n "$ES_JWT" ]]; then
    curl -sf -H "Authorization: Bearer $ES_JWT" "$url"
  else
    curl -sf "$url"
  fi
}

# Build query string for /query/{class}
_build_qs() {
  local qs="_limit=${LIMIT}"
  for f in "${FILTERS[@]}"; do
    [[ -n "$f" ]] && qs+="&${f}"
  done
  echo "$qs"
}

# Fetch a list of objects. Uses /query/{class} for filter/limit support.
_fetch_list() {
  local class="$1"
  local qs
  qs=$(_build_qs)
  _curl "${ES_BASE}/query/${class}?${qs}"
}

# Fetch a single object
_fetch_one() {
  local class="$1" id="$2"
  _curl "${ES_BASE}/store/${class}/${id}"
}

# ── Python renderer (inline) ──────────────────────────────────────────────────
# All display logic is in Python for clean unicode table handling.

_py() {
  python3 - "$@"
}

# ── VIEW: table ───────────────────────────────────────────────────────────────
_view_table() {
  local json="$1"
  _py \
    --json "$json" \
    --cols "$COLS" \
    --col-width "$COL_WIDTH" \
    --sep "$SEP" \
    --header "$SHOW_HEADER" \
    --color "$USE_COLOR" \
    --title "$TITLE" \
    --class-id "$CLASS_ID" \
    << 'PYEOF'
import sys, json, os

# Parse named args passed as --key value pairs
args = {}
key = None
for a in sys.argv[1:]:
    if a.startswith('--'):
        key = a[2:]
        args[key] = ''
    elif key:
        args[key] = a
        key = None

raw_json  = args.get('json', '[]')
cols_arg  = args.get('cols', '')
col_width = int(args.get('col-width', '30'))
sep       = args.get('sep', '  ')
show_hdr  = args.get('header', 'true').lower() != 'false'
use_color = args.get('color', 'true').lower() != 'false'
title     = args.get('title', '')
class_id  = args.get('class-id', '')

# ANSI helpers
BOLD  = '\033[1m'   if use_color else ''
CYAN  = '\033[0;36m' if use_color else ''
GRAY  = '\033[0;37m' if use_color else ''
DIM   = '\033[2m'   if use_color else ''
NC    = '\033[0m'   if use_color else ''

records = json.loads(raw_json)
if not isinstance(records, list):
    records = [records]
if not records:
    print(f"{GRAY}(no records){NC}")
    sys.exit(0)

# Determine columns
if cols_arg:
    cols = [c.strip() for c in cols_arg.split(',')]
else:
    # Auto-detect: union of all keys, id first, class_id/updated_at last
    seen = {}
    for r in records:
        for k in r.keys():
            seen[k] = True
    priority_first = ['id', 'name']
    priority_last  = ['class_id', 'created_at', 'updated_at']
    middle = [k for k in seen if k not in priority_first and k not in priority_last]
    cols = [k for k in priority_first if k in seen] + middle + [k for k in priority_last if k in seen]

def cell(val, width):
    """Format a value for display, truncated to width."""
    if val is None:
        return ''
    if isinstance(val, list):
        s = ', '.join(str(v) for v in val)
    elif isinstance(val, dict):
        s = json.dumps(val)
    else:
        s = str(val)
    if len(s) > width:
        s = s[:width-1] + '…'
    return s

# Compute column widths: max(header, content) capped at col_width
widths = {}
for c in cols:
    w = len(c)
    for r in records:
        v = cell(r.get(c), col_width)
        w = max(w, len(v))
    widths[c] = min(w, col_width)

def row_str(values, bold=False):
    parts = []
    for c in cols:
        v = values.get(c, '')
        v = cell(v, col_width) if not isinstance(v, str) else v
        if len(v) > col_width:
            v = v[:col_width-1] + '…'
        parts.append(v.ljust(widths[c]))
    line = sep.join(parts).rstrip()
    if bold:
        return f"{BOLD}{CYAN}{line}{NC}"
    return line

total_width = sum(widths.values()) + len(sep) * (len(cols) - 1)

# Title / header
if title:
    print(f"\n{BOLD}{title}{NC}")
elif class_id:
    print(f"\n{BOLD}{class_id}{NC}  {GRAY}({len(records)} records){NC}")

if show_hdr:
    hdr = {c: c for c in cols}
    print(row_str(hdr, bold=True))
    print(GRAY + '─' * total_width + NC)

for r in records:
    print(row_str(r))

print(GRAY + f"\n{len(records)} record(s)" + NC)
PYEOF
}

# ── VIEW: card ────────────────────────────────────────────────────────────────
_view_card() {
  local json="$1"
  _py \
    --json "$json" \
    --col-width "$COL_WIDTH" \
    --color "$USE_COLOR" \
    --title "$TITLE" \
    << 'PYEOF'
import sys, json

args = {}
key = None
for a in sys.argv[1:]:
    if a.startswith('--'):
        key = a[2:]
        args[key] = ''
    elif key:
        args[key] = a
        key = None

raw_json  = args.get('json', '[]')
col_width = int(args.get('col-width', '30'))
use_color = args.get('color', 'true').lower() != 'false'
title     = args.get('title', '')

BOLD  = '\033[1m'    if use_color else ''
CYAN  = '\033[0;36m' if use_color else ''
GRAY  = '\033[0;37m' if use_color else ''
GREEN = '\033[0;32m' if use_color else ''
NC    = '\033[0m'    if use_color else ''

records = json.loads(raw_json)
if not isinstance(records, list):
    records = [records]

def fmt_val(val):
    if val is None:
        return ''
    if isinstance(val, list):
        if not val:
            return '[]'
        return '\n' + '\n'.join(f"    • {v}" for v in val)
    if isinstance(val, dict):
        return json.dumps(val, indent=2)
    return str(val)

label_width = 20

for i, r in enumerate(records):
    obj_id = r.get('id', f'record {i+1}')
    sep_line = '─' * 60
    if title:
        print(f"\n{BOLD}{title}{NC}  {GRAY}{sep_line}{NC}")
    else:
        print(f"\n{BOLD}{CYAN}{obj_id}{NC}  {GRAY}{sep_line}{NC}")

    for k, v in r.items():
        if k == 'id':
            continue
        label = (k + ':').ljust(label_width)
        val_str = fmt_val(v)
        if val_str.startswith('\n'):
            print(f"  {GRAY}{label}{NC}{val_str}")
        else:
            print(f"  {GRAY}{label}{NC}{val_str}")

print()
PYEOF
}

# ── VIEW: matrix ──────────────────────────────────────────────────────────────
_view_matrix() {
  local json="$1"
  _py \
    --json "$json" \
    --row-field "$MATRIX_ROW" \
    --col-field "$MATRIX_COL" \
    --val-field "$MATRIX_VAL" \
    --col-width "$COL_WIDTH" \
    --color "$USE_COLOR" \
    --title "$TITLE" \
    << 'PYEOF'
import sys, json

args = {}
key = None
for a in sys.argv[1:]:
    if a.startswith('--'):
        key = a[2:]
        args[key] = ''
    elif key:
        args[key] = a
        key = None

raw_json  = args.get('json', '[]')
row_field = args.get('row-field', 'id')
col_field = args.get('col-field', 'class_id')
val_field = args.get('val-field', 'name')
col_width = int(args.get('col-width', '20'))
use_color = args.get('color', 'true').lower() != 'false'
title     = args.get('title', '')

BOLD  = '\033[1m'    if use_color else ''
CYAN  = '\033[0;36m' if use_color else ''
GRAY  = '\033[0;37m' if use_color else ''
GREEN = '\033[0;32m' if use_color else ''
YELL  = '\033[1;33m' if use_color else ''
NC    = '\033[0m'    if use_color else ''

records = json.loads(raw_json)
if not isinstance(records, list):
    records = [records]

# Build matrix: rows × cols → value
matrix = {}
rows_seen = {}
cols_seen = {}

def shorten(val, width):
    if val is None:
        return ''
    s = str(val)
    if len(s) > width:
        s = s[:width-1] + '…'
    return s

# Short labels for common progress values
PROG_SHORT = {
    'not_started': '-',
    'planned':     'plan',
    'in_progress': 'WIP',
    'partial':     'part',
    'implemented': 'IMPL',
    'tested':      'TEST',
}

PROG_COLOR = {
    'IMPL': GREEN,
    'TEST': GREEN,
    'part': YELL,
    'plan': CYAN,
    'WIP':  CYAN,
    '-':    GRAY,
}

def fmt_val(val):
    if isinstance(val, list):
        return ', '.join(str(v) for v in val) if val else '-'
    s = PROG_SHORT.get(str(val), str(val)) if val is not None else '-'
    return s

for r in records:
    row_key = r.get(row_field, '?')
    col_key = r.get(col_field, '?')
    val     = r.get(val_field)
    rows_seen[row_key] = True
    cols_seen[col_key] = True
    matrix.setdefault(row_key, {})[col_key] = fmt_val(val)

rows = sorted(rows_seen)
cols = sorted(cols_seen)

# Compute widths
row_label_w = max(len(row_field), max(len(shorten(r, 40)) for r in rows))
row_label_w = min(row_label_w, 40)

col_widths = {}
for c in cols:
    w = len(shorten(c, col_width))
    for r in rows:
        v = matrix.get(r, {}).get(c, '-')
        w = max(w, len(v))
    col_widths[c] = min(max(w, 4), col_width)

sep = '  '
total_w = row_label_w + sum(col_widths[c] + len(sep) for c in cols)

t = title if title else f"{row_field} × {col_field}  [value: {val_field}]"
print(f"\n{BOLD}{t}{NC}")
print(GRAY + '─' * total_w + NC)

# Header
hdr = ' ' * row_label_w
for c in cols:
    label = shorten(c, col_widths[c])
    hdr += sep + f"{BOLD}{CYAN}{label.rjust(col_widths[c])}{NC}"
print(hdr)
print(GRAY + '─' * total_w + NC)

# Data rows
for row_key in rows:
    label = shorten(row_key, row_label_w).ljust(row_label_w)
    line = f"{GRAY}{label}{NC}"
    for c in cols:
        val = matrix.get(row_key, {}).get(c, '-')
        color = PROG_COLOR.get(val, NC) if use_color else ''
        line += sep + f"{color}{val.rjust(col_widths[c])}{NC}"
    print(line)

print(GRAY + f"\n{len(rows)} rows × {len(cols)} cols" + NC)
PYEOF
}

# ── VIEW: raw ─────────────────────────────────────────────────────────────────
_view_raw() {
  local json="$1"
  if command -v jq &>/dev/null; then
    echo "$json" | jq .
  else
    echo "$json" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  # Fetch data
  local json
  if [[ -n "$OBJECT_ID" && "$VIEW" != "matrix" ]]; then
    json=$(_fetch_one "$CLASS_ID" "$OBJECT_ID")
    # Wrap single object in array for card view
    [[ "$VIEW" == "card" ]] && json="[$json]"
  else
    json=$(_fetch_list "$CLASS_ID")
  fi

  case "$VIEW" in
    table)  _view_table  "$json" ;;
    card)   _view_card   "$json" ;;
    matrix) _view_matrix "$json" ;;
    raw)    _view_raw    "$json" ;;
    *)      _err "Unknown view: $VIEW  (table|card|matrix|raw)" ;;
  esac
}

main
