#!/usr/bin/env bash
# =============================================================================
# es-features.sh — ElementStore feature catalog viewer
#
# Displays the feature registry grouped by category, with descriptions,
# implementation notes, and per-client status.
#
# USAGE
#   es-features.sh [options]
#
# MODES (default: catalog)
#   catalog                     Full feature list grouped by category
#   matrix                      Compact status matrix (feature × client)
#   detail <feature_id>         Single feature deep-dive
#   gaps [client]               Show missing/partial features (optionally per client)
#   stats                       Summary counts per client
#
# OPTIONS
#   --category <cat>            Filter by category (core|schema|data|integration|system)
#   --client   <app_id>         Filter by client app ID (e.g. app:es-client)
#   --progress <status>         Filter by progress (implemented|partial|not_started|planned)
#   --no-notes                  Hide detailed notes in catalog view
#   --no-color                  Disable ANSI colors
#   --json                      Output raw JSON instead of formatted text
#   --from-api                  Fetch from ES API instead of local .es/ files
#   --url      <url>            ES API base URL (implies --from-api)  [$ES_URL]
#   --token    <jwt>            Bearer token for API access            [$ES_TOKEN]
#
# DATA SOURCE
#   By default reads from local .es/ JSON files:
#     .es/@es-feature.json      Feature definitions
#     .es/@es-app_feature.json  Per-app implementation status
#     .es/@es-app.json          App definitions (for display names)
#   Use --from-api or --url to fetch from a running ElementStore server.
#
# EXAMPLES
#   # Full catalog with notes
#   es-features.sh
#
#   # Compact matrix
#   es-features.sh matrix
#
#   # Only core features
#   es-features.sh --category core
#
#   # Gaps for admin client
#   es-features.sh gaps app:es-admin
#
#   # Single feature detail
#   es-features.sh detail feat:object_crud
#
#   # Stats summary
#   es-features.sh stats
#
#   # Fetch from API instead of local files
#   es-features.sh matrix --url http://arc3d.master.local/elementStore
#
#   # Raw JSON output
#   es-features.sh --json --category core
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ES_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Args ─────────────────────────────────────────────────────────────────────
MODE="catalog"
CATEGORY=""
CLIENT=""
PROGRESS=""
SHOW_NOTES=true
USE_COLOR=true
OUTPUT_JSON=false
FROM_API=false
ES_BASE="${ES_URL:-}"
ES_JWT="${ES_TOKEN:-}"
FEATURE_ID=""

_usage() {
  grep '^#' "$0" | grep -v '^#!/' | sed 's/^# \{0,1\}//' | head -50
  exit 0
}

POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)       _usage ;;
    --category)      CATEGORY="$2";   shift 2 ;;
    --client)        CLIENT="$2";     shift 2 ;;
    --progress)      PROGRESS="$2";   shift 2 ;;
    --no-notes)      SHOW_NOTES=false; shift ;;
    --no-color)      USE_COLOR=false; shift ;;
    --json)          OUTPUT_JSON=true; shift ;;
    --from-api)      FROM_API=true;   shift ;;
    --url)           ES_BASE="$2"; FROM_API=true; shift 2 ;;
    --token)         ES_JWT="$2";     shift 2 ;;
    -*)              echo "Unknown option: $1" >&2; exit 1 ;;
    *)               POSITIONAL+=("$1"); shift ;;
  esac
done

[[ ${#POSITIONAL[@]} -gt 0 ]] && MODE="${POSITIONAL[0]}"
[[ ${#POSITIONAL[@]} -gt 1 ]] && FEATURE_ID="${POSITIONAL[1]}"

# For gaps mode, second positional can be client
if [[ "$MODE" == "gaps" && -n "$FEATURE_ID" && -z "$CLIENT" ]]; then
  CLIENT="$FEATURE_ID"
  FEATURE_ID=""
fi

# ── Data loading ─────────────────────────────────────────────────────────────
_curl() {
  local url="$1"
  if [[ -n "$ES_JWT" ]]; then
    curl -sf -H "Authorization: Bearer $ES_JWT" "$url"
  else
    curl -sf "$url"
  fi
}

load_data() {
  if [[ "$FROM_API" == true ]]; then
    [[ -z "$ES_BASE" ]] && { echo "No ES URL. Set --url or \$ES_URL." >&2; exit 1; }
    ES_BASE="${ES_BASE%/}"
    FEATURES_JSON=$(_curl "${ES_BASE}/query/es:feature?_limit=200")
    APP_FEATURES_JSON=$(_curl "${ES_BASE}/query/es:app_feature?_limit=200")
    APPS_JSON=$(_curl "${ES_BASE}/query/es:app?_limit=200")
  else
    FEATURES_JSON=$(cat "${ES_ROOT}/.es/@es-feature.json")
    APP_FEATURES_JSON=$(cat "${ES_ROOT}/.es/@es-app_feature.json")
    APPS_JSON=$(cat "${ES_ROOT}/.es/@es-app.json")
  fi
}

# ── Main renderer (Python) ───────────────────────────────────────────────────
render() {
  python3 - << 'PYEOF' \
    "$FEATURES_JSON" \
    "$APP_FEATURES_JSON" \
    "$APPS_JSON" \
    "$MODE" \
    "$CATEGORY" \
    "$CLIENT" \
    "$PROGRESS" \
    "$SHOW_NOTES" \
    "$USE_COLOR" \
    "$OUTPUT_JSON" \
    "$FEATURE_ID"
import sys, json

features_json    = sys.argv[1]
app_features_json = sys.argv[2]
apps_json        = sys.argv[3]
mode             = sys.argv[4]
filter_category  = sys.argv[5]
filter_client    = sys.argv[6]
filter_progress  = sys.argv[7]
show_notes       = sys.argv[8].lower() != 'false'
use_color        = sys.argv[9].lower() != 'false'
output_json      = sys.argv[10].lower() == 'true'
feature_id       = sys.argv[11]

features     = json.loads(features_json)
app_features = json.loads(app_features_json)
apps         = json.loads(apps_json)

# ── Color helpers ──
B    = '\033[1m'      if use_color else ''
CY   = '\033[0;36m'   if use_color else ''
YL   = '\033[1;33m'   if use_color else ''
GR   = '\033[0;32m'   if use_color else ''
RD   = '\033[0;31m'   if use_color else ''
GY   = '\033[0;37m'   if use_color else ''
DM   = '\033[2m'      if use_color else ''
NC   = '\033[0m'      if use_color else ''
BCY  = f'{B}{CY}'

# ── Lookups ──
feat_map = {f['id']: f for f in features}
app_map  = {a['id']: a for a in apps}

# Active apps only, ordered
app_order = ['app:es-php-backend', 'app:es-client-npm', 'app:es-admin', 'app:billing-backend', 'app:es-test-html']
app_short = {
    'app:es-php-backend':  'Server',
    'app:es-client-npm':   '@es-client',
    'app:es-admin':        'Admin',
    'app:billing-backend': 'Billing',
    'app:es-test-html':    'test.html'
}
active_apps = [a for a in app_order if a in {af['application_id'] for af in app_features}]

# Build matrix
matrix = {}
af_map = {}
for af in app_features:
    key = (af['feature_id'], af['application_id'])
    matrix[key] = af.get('progress', '')
    af_map[key] = af

# Progress symbols
sym = {'implemented':'✓','partial':'◐','not_started':'—','planned':'◯','in_progress':'▶','tested':'✔','deprecated':'✗'}
sym_plain = {'implemented':'DONE','partial':'PART','not_started':'--','planned':'PLAN','in_progress':'WIP','tested':'TEST','deprecated':'DEPR'}
sym_color = {'✓':GR,'◐':YL,'—':GY,'◯':CY,'▶':CY,'✔':GR,'✗':RD}

def psym(progress):
    if use_color:
        s = sym.get(progress, ' ')
        c = sym_color.get(s, NC)
        return f'{c}{s}{NC}'
    return sym_plain.get(progress, '  ')

# Category order
cat_order = ['core', 'schema', 'data', 'integration', 'system']

# Group features by category
by_cat = {}
for f in features:
    by_cat.setdefault(f.get('category', 'other'), []).append(f)

# Apply filters
def filter_features(feats):
    if filter_category:
        feats = [f for f in feats if f.get('category') == filter_category]
    if filter_client:
        feat_ids = {af['feature_id'] for af in app_features if af['application_id'] == filter_client}
        if filter_progress:
            feat_ids = {af['feature_id'] for af in app_features
                        if af['application_id'] == filter_client and af.get('progress') == filter_progress}
        feats = [f for f in feats if f['id'] in feat_ids]
    elif filter_progress:
        feat_ids = {af['feature_id'] for af in app_features if af.get('progress') == filter_progress}
        feats = [f for f in feats if f['id'] in feat_ids]
    return feats

def wrap_text(text, width, indent='    '):
    words = text.split()
    lines = []
    line = indent
    for w in words:
        if len(line) + len(w) + 1 > width:
            lines.append(line)
            line = indent + w
        else:
            line += (' ' if len(line) > len(indent) else '') + w
    if line.strip():
        lines.append(line)
    return '\n'.join(lines)

# ══════════════════════════════════════════════════════════════════════════════
# MODE: catalog
# ══════════════════════════════════════════════════════════════════════════════
if mode == 'catalog':
    all_feats = filter_features(features)
    if output_json:
        result = []
        for f in all_feats:
            entry = dict(f)
            entry['clients'] = {}
            for app in active_apps:
                key = (f['id'], app)
                if key in matrix:
                    entry['clients'][app_short[app]] = {'progress': matrix[key], 'notes': af_map[key].get('notes','')}
            result.append(entry)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        sys.exit(0)

    grouped = {}
    for f in all_feats:
        grouped.setdefault(f.get('category','other'), []).append(f)

    for cat in cat_order:
        feats = grouped.get(cat, [])
        if not feats:
            continue
        print(f'\n{BCY}━━━ {cat.upper()} ━━━{NC}')
        for f in feats:
            statuses = ''
            for app in active_apps:
                label = app_short[app]
                s = matrix.get((f['id'], app), '')
                statuses += f'  {label}:{psym(s)}'

            print(f'\n  {YL}{f["name"]}{NC}  {DM}[{f["id"]}]{NC}')
            print(f'  {f.get("description", "")}')
            if show_notes and f.get('notes'):
                print(f'{GY}{wrap_text(f["notes"], 105)}{NC}')
            print(f'  {statuses}')

# ══════════════════════════════════════════════════════════════════════════════
# MODE: matrix
# ══════════════════════════════════════════════════════════════════════════════
elif mode == 'matrix':
    all_feats = filter_features(features)
    if output_json:
        result = {}
        for f in all_feats:
            result[f['id']] = {app_short[a]: matrix.get((f['id'], a), '') for a in active_apps}
        print(json.dumps(result, indent=2, ensure_ascii=False))
        sys.exit(0)

    # Column widths
    name_w = max(len(f.get('name','')) for f in all_feats) if all_feats else 20
    name_w = min(name_w, 32)
    col_w = max(len(app_short[a]) for a in active_apps)
    col_w = max(col_w, 4)

    # Header
    hdr = f'{"Feature":<{name_w}s} {"Cat":<12s}'
    for a in active_apps:
        hdr += f' {app_short[a]:>{col_w}s}'
    print(f'\n{B}{hdr}{NC}')
    print(GY + '─' * len(hdr) + NC)

    prev_cat = None
    for f in sorted(all_feats, key=lambda x: (cat_order.index(x.get('category','other')) if x.get('category','other') in cat_order else 99, x['id'])):
        cat = f.get('category', 'other')
        if cat != prev_cat:
            if prev_cat is not None:
                print()
            prev_cat = cat
        name = f.get('name', f['id'])
        if len(name) > name_w:
            name = name[:name_w-1] + '…'
        row = f'{name:<{name_w}s} {cat:<12s}'
        for a in active_apps:
            s = matrix.get((f['id'], a), '')
            row += f' {psym(s):>{col_w + (len(psym(s)) - 1 if use_color else 0)}s}'
        print(row)

    # Totals
    print(f'\n{GY}Totals:{NC}')
    for a in active_apps:
        entries = [af for af in app_features if af['application_id'] == a]
        done = sum(1 for e in entries if e.get('progress') == 'implemented')
        part = sum(1 for e in entries if e.get('progress') == 'partial')
        ns   = sum(1 for e in entries if e.get('progress') == 'not_started')
        print(f'  {app_short[a]:>12s}: {GR}{done} done{NC}, {YL}{part} partial{NC}, {GY}{ns} not started{NC} / {len(entries)} total')

# ══════════════════════════════════════════════════════════════════════════════
# MODE: detail
# ══════════════════════════════════════════════════════════════════════════════
elif mode == 'detail':
    if not feature_id:
        print(f'{RD}Usage: es-features.sh detail <feature_id>{NC}', file=sys.stderr)
        sys.exit(1)
    f = feat_map.get(feature_id)
    if not f:
        print(f'{RD}Feature not found: {feature_id}{NC}', file=sys.stderr)
        sys.exit(1)

    if output_json:
        entry = dict(f)
        entry['clients'] = {}
        for a in active_apps:
            key = (f['id'], a)
            if key in af_map:
                entry['clients'][app_short[a]] = dict(af_map[key])
        print(json.dumps(entry, indent=2, ensure_ascii=False))
        sys.exit(0)

    print(f'\n{BCY}{"─" * 70}{NC}')
    print(f'{B}{YL}{f["name"]}{NC}  {DM}[{f["id"]}]{NC}')
    print(f'{BCY}{"─" * 70}{NC}')
    print(f'  {GY}Category:{NC}    {f.get("category", "—")}')
    print(f'  {GY}Group:{NC}       {f.get("group", "—")}')
    print(f'  {GY}Scope:{NC}       {f.get("scope", "—")}')
    eps = f.get('api_endpoints', [])
    if eps:
        print(f'  {GY}Endpoints:{NC}   {", ".join(eps)}')
    deps = f.get('depends_on', [])
    if deps:
        print(f'  {GY}Depends on:{NC}  {", ".join(deps)}')
    print(f'\n  {GY}Description:{NC}')
    print(f'  {f.get("description", "")}')
    if f.get('notes'):
        print(f'\n  {GY}Implementation Notes:{NC}')
        print(f'{GY}{wrap_text(f["notes"], 100, "  ")}{NC}')

    print(f'\n  {B}Per-Client Status:{NC}')
    for a in active_apps:
        key = (f['id'], a)
        af = af_map.get(key)
        if not af:
            print(f'    {app_short[a]:>12s}: {GY}(no entry){NC}')
            continue
        p = af.get('progress', '')
        impl = af.get('implemented_in', [])
        notes = af.get('notes', '')
        print(f'    {app_short[a]:>12s}: {psym(p)} {p}')
        if impl:
            print(f'                   {DM}Files: {", ".join(impl)}{NC}')
        if notes:
            print(f'                   {GY}{notes[:120]}{"…" if len(notes)>120 else ""}{NC}')

# ══════════════════════════════════════════════════════════════════════════════
# MODE: gaps
# ══════════════════════════════════════════════════════════════════════════════
elif mode == 'gaps':
    target_apps = [filter_client] if filter_client else active_apps
    all_feats = filter_features(features) if filter_category else features

    if output_json:
        result = {}
        for a in target_apps:
            gaps = []
            for f in all_feats:
                key = (f['id'], a)
                p = matrix.get(key, 'missing')
                if p in ('not_started', 'partial', 'missing', 'planned'):
                    gaps.append({'feature_id': f['id'], 'name': f.get('name',''), 'progress': p})
            result[app_short.get(a, a)] = gaps
        print(json.dumps(result, indent=2, ensure_ascii=False))
        sys.exit(0)

    for a in target_apps:
        gaps = []
        for f in all_feats:
            key = (f['id'], a)
            p = matrix.get(key, 'missing')
            if p in ('not_started', 'partial', 'missing', 'planned'):
                gaps.append((f, p))
        if not gaps:
            print(f'\n  {GR}{app_short.get(a, a)}: No gaps!{NC}')
            continue
        print(f'\n  {B}{app_short.get(a, a)}{NC} — {YL}{len(gaps)} gaps{NC}:')
        for f, p in gaps:
            print(f'    {psym(p)} {f.get("name", f["id"]):<35s} {DM}[{f["id"]}]{NC}  {p}')

# ══════════════════════════════════════════════════════════════════════════════
# MODE: stats
# ══════════════════════════════════════════════════════════════════════════════
elif mode == 'stats':
    total_feats = len(features)

    if output_json:
        result = {'total_features': total_feats, 'clients': {}}
        for a in active_apps:
            entries = [af for af in app_features if af['application_id'] == a]
            counts = {}
            for e in entries:
                p = e.get('progress', 'unknown')
                counts[p] = counts.get(p, 0) + 1
            result['clients'][app_short[a]] = {'total': len(entries), **counts}
        print(json.dumps(result, indent=2, ensure_ascii=False))
        sys.exit(0)

    print(f'\n{B}ElementStore Feature Registry — {total_feats} features{NC}\n')

    # Per-category count
    for cat in cat_order:
        count = len(by_cat.get(cat, []))
        if count:
            print(f'  {cat:<14s} {count} features')

    print(f'\n{B}Per-Client Progress:{NC}\n')
    hdr = f'  {"Client":>12s}  {"Done":>5s}  {"Part":>5s}  {"N/S":>5s}  {"Plan":>5s}  {"Total":>5s}  {"Coverage":>8s}'
    print(f'{B}{hdr}{NC}')
    print(f'  {GY}{"─" * (len(hdr) - 2)}{NC}')
    for a in active_apps:
        entries = [af for af in app_features if af['application_id'] == a]
        done = sum(1 for e in entries if e.get('progress') == 'implemented')
        part = sum(1 for e in entries if e.get('progress') == 'partial')
        ns   = sum(1 for e in entries if e.get('progress') == 'not_started')
        plan = sum(1 for e in entries if e.get('progress') in ('planned', 'in_progress'))
        total = len(entries)
        cov = f'{(done/total*100):.0f}%' if total else '—'
        print(f'  {app_short[a]:>12s}  {GR}{done:>5d}{NC}  {YL}{part:>5d}{NC}  {GY}{ns:>5d}{NC}  {CY}{plan:>5d}{NC}  {total:>5d}  {cov:>8s}')

else:
    print(f'{RD}Unknown mode: {mode}{NC}', file=sys.stderr)
    print('Modes: catalog, matrix, detail, gaps, stats', file=sys.stderr)
    sys.exit(1)
PYEOF
}

# ── Main ─────────────────────────────────────────────────────────────────────
load_data
render
