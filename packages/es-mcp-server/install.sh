#!/usr/bin/env bash
#
# install.sh — Install elementStore MCP server + /es skill into Claude Code
#
# Usage:
#   bash install.sh                              # uses default ES_URL
#   bash install.sh http://my-server/elementStore # custom URL
#   bash install.sh --uninstall                  # remove from Claude Code
#   bash install.sh --agent agent:cto            # use a specific agent
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ES_URL="${ES_URL:-http://arc3d.master.local/elementStore}"
AGENT_ID="agent:owner"
MCP_JSON="$HOME/.mcp.json"
SKILL_DIR="$HOME/.claude/skills/es"
SETTINGS_LOCAL="$HOME/.claude/settings.local.json"

# ── Parse args ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --uninstall) UNINSTALL=1; shift ;;
    --agent) AGENT_ID="$2"; shift 2 ;;
    --url) ES_URL="$2"; shift 2 ;;
    http*) ES_URL="$1"; shift ;;
    *) shift ;;
  esac
done

# ── Colors ──
R='\033[0;31m' G='\033[0;32m' B='\033[0;34m' Y='\033[0;33m' N='\033[0m' DIM='\033[2m'

# ── Uninstall ──
if [[ "${UNINSTALL:-}" == "1" ]]; then
  echo -e "${B}Removing elementStore from Claude Code...${N}"

  # Remove MCP server entry
  if [[ -f "$MCP_JSON" ]]; then
    node -e "
      const fs = require('fs');
      const cfg = JSON.parse(fs.readFileSync('$MCP_JSON', 'utf8'));
      if (cfg.mcpServers?.elementStore) {
        delete cfg.mcpServers.elementStore;
        fs.writeFileSync('$MCP_JSON', JSON.stringify(cfg, null, 2));
        console.log('  Removed MCP server from ~/.mcp.json');
      }
    "
  fi

  # Remove skill
  if [[ -d "$SKILL_DIR" ]]; then
    rm -rf "$SKILL_DIR"
    echo -e "  Removed /es skill"
  fi

  # Remove from enabledMcpjsonServers
  if [[ -f "$SETTINGS_LOCAL" ]]; then
    node -e "
      const fs = require('fs');
      const cfg = JSON.parse(fs.readFileSync('$SETTINGS_LOCAL', 'utf8'));
      const arr = cfg.enabledMcpjsonServers || [];
      const idx = arr.indexOf('elementStore');
      if (idx !== -1) { arr.splice(idx, 1); fs.writeFileSync('$SETTINGS_LOCAL', JSON.stringify(cfg, null, 2)); console.log('  Removed from enabled servers'); }
    "
  fi

  echo -e "${G}✓ Uninstalled. Restart Claude Code to apply.${N}"
  exit 0
fi

# ── Install ──
echo -e "${B}╭─────────────────────────────────────────╮${N}"
echo -e "${B}│  elementStore → Claude Code installer    │${N}"
echo -e "${B}╰─────────────────────────────────────────╯${N}"
echo ""
echo -e "  ${DIM}Server:${N}  $SCRIPT_DIR"
echo -e "  ${DIM}ES URL:${N}  $ES_URL"
echo -e "  ${DIM}Agent:${N}   $AGENT_ID"
echo ""

# ── 1. Install npm dependencies ──
if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
  echo -e "${Y}Installing dependencies...${N}"
  cd "$SCRIPT_DIR" && npm install --production 2>&1 | tail -2
  echo ""
fi

# ── 2. Add MCP server to ~/.mcp.json ──
echo -e "Adding MCP server..."
mkdir -p "$(dirname "$MCP_JSON")"
node -e "
  const fs = require('fs');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync('$MCP_JSON', 'utf8')); } catch {}
  if (!cfg.mcpServers) cfg.mcpServers = {};

  cfg.mcpServers.elementStore = {
    command: 'node',
    args: [
      '${SCRIPT_DIR}/src/index.js',
      '--url', '${ES_URL}',
      '--agent', '${AGENT_ID}'
    ],
    env: { ES_URL: '${ES_URL}' },
    disabled: false,
    autoApprove: []
  };

  fs.writeFileSync('$MCP_JSON', JSON.stringify(cfg, null, 2));
  console.log('  ✓ ~/.mcp.json updated');
"

# ── 3. Enable in settings.local.json ──
echo -e "Enabling server..."
mkdir -p "$(dirname "$SETTINGS_LOCAL")"
node -e "
  const fs = require('fs');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync('$SETTINGS_LOCAL', 'utf8')); } catch {}
  if (!cfg.enabledMcpjsonServers) cfg.enabledMcpjsonServers = [];
  if (!cfg.enabledMcpjsonServers.includes('elementStore')) {
    cfg.enabledMcpjsonServers.push('elementStore');
  }
  fs.writeFileSync('$SETTINGS_LOCAL', JSON.stringify(cfg, null, 2));
  console.log('  ✓ settings.local.json updated');
"

# ── 4. Install /es skill ──
echo -e "Installing /es skill..."
mkdir -p "$SKILL_DIR"
cp "$SCRIPT_DIR/skills/es/SKILL.md" "$SKILL_DIR/SKILL.md"
echo -e "  ✓ /es skill installed at $SKILL_DIR"

# ── 5. Health check ──
echo ""
echo -e "${DIM}Checking elementStore connectivity...${N}"
HEALTH=$(curl -sf "$ES_URL/health" 2>/dev/null | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('status','?'))" 2>/dev/null || echo "unreachable")
if [[ "$HEALTH" == "ok" ]]; then
  echo -e "  ${G}✓ elementStore is up${N}"
else
  echo -e "  ${Y}⚠ elementStore unreachable at $ES_URL (server may need to be started)${N}"
fi

# ── Done ──
echo ""
echo -e "${G}╭─────────────────────────────────────────╮${N}"
echo -e "${G}│  ✓ elementStore installed!               │${N}"
echo -e "${G}╰─────────────────────────────────────────╯${N}"
echo ""
echo -e "  ${B}What's available after restart:${N}"
echo ""
echo -e "  ${DIM}Slash commands:${N}"
echo -e "    /es                    Overview + status"
echo -e "    /es classes            All classes by namespace"
echo -e "    /es agents             Team agents"
echo -e "    /es features           Feature progress matrix"
echo -e "    /es ai:agent           List objects of a class"
echo -e "    /es agent:owner        Get a specific object"
echo -e "    /es props ai:task      Show class schema"
echo ""
echo -e "  ${DIM}@ resources:${N}"
echo -e "    @elementStore:es://classes     All classes"
echo -e "    @elementStore:es://agents      All agents"
echo -e "    @elementStore:es://ns/ai       AI namespace classes"
echo -e "    @elementStore:es://ns/mcp      MCP namespace classes"
echo ""
echo -e "  ${DIM}MCP tools (9):${N}"
echo -e "    es_health, es_classes, es_class_props, es_query,"
echo -e "    es_create, es_update, es_delete, es_find, es_action"
echo ""
echo -e "  ${Y}Restart Claude Code to activate.${N}"
