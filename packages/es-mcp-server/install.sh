#!/usr/bin/env bash
#
# install.sh — Install elementStore MCP server into Claude Code
#
# Usage:
#   bash install.sh                              # uses default ES_URL
#   bash install.sh http://my-server/elementStore # custom URL
#   bash install.sh --uninstall                  # remove from Claude Code
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ES_URL="${1:-${ES_URL:-http://arc3d.master.local/elementStore}}"
SETTINGS_FILE="$HOME/.claude/settings.json"

# ── Colors ──
R='\033[0;31m' G='\033[0;32m' B='\033[0;34m' Y='\033[0;33m' N='\033[0m'

if [[ "${1:-}" == "--uninstall" ]]; then
  echo -e "${B}Removing elementStore MCP server from Claude Code...${N}"
  if [[ -f "$SETTINGS_FILE" ]]; then
    # Remove the elementStore entry from mcpServers
    node -e "
      const fs = require('fs');
      const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
      if (settings.mcpServers?.elementStore) {
        delete settings.mcpServers.elementStore;
        fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2));
        console.log('Removed elementStore from Claude Code settings.');
      } else {
        console.log('elementStore not found in Claude Code settings.');
      }
    "
  fi
  exit 0
fi

echo -e "${B}Installing elementStore MCP server for Claude Code${N}"
echo -e "  Server dir: ${SCRIPT_DIR}"
echo -e "  ES URL:     ${ES_URL}"
echo ""

# ── Install dependencies ──
if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
  echo -e "${Y}Installing npm dependencies...${N}"
  cd "$SCRIPT_DIR" && npm install --production 2>&1 | tail -3
  echo ""
fi

# ── Ensure settings dir exists ──
mkdir -p "$(dirname "$SETTINGS_FILE")"

# ── Write or update settings.json ──
node -e "
  const fs = require('fs');
  const path = '$SETTINGS_FILE';
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
  if (!settings.mcpServers) settings.mcpServers = {};

  settings.mcpServers.elementStore = {
    command: 'node',
    args: ['${SCRIPT_DIR}/src/index.js', '--url', '${ES_URL}'],
    env: {
      ES_URL: '${ES_URL}'
    }
  };

  fs.writeFileSync(path, JSON.stringify(settings, null, 2));
  console.log('Updated: ' + path);
"

echo ""
echo -e "${G}✓ elementStore MCP server installed!${N}"
echo ""
echo -e "  Tools available in Claude Code:"
echo -e "    es_health       — Check server connectivity"
echo -e "    es_classes      — List all classes"
echo -e "    es_class_props  — Get class schema"
echo -e "    es_find         — Find object by ID"
echo -e "    es_query        — Query objects with filters"
echo -e "    es_create       — Create object (any class)"
echo -e "    es_update       — Update object"
echo -e "    es_delete       — Delete object"
echo -e "    es_action       — Execute @action"
echo -e "    + per-class CRUD tools (auto-discovered)"
echo ""
echo -e "  Restart Claude Code to activate."
