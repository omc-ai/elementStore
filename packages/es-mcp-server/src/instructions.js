/**
 * Instructions builder — constructs the MCP server prompt dynamically
 * from the agent object, its tool bindings, team agents, and class catalog.
 *
 * The agent's prompt from elementStore is the PRIMARY source of truth.
 * This module wraps it with MCP tool context and team awareness.
 */

/**
 * Build the full agent instructions from elementStore data.
 *
 * @param {object|null} agent - The ai:agent object (e.g. agent:owner)
 * @param {object[]} allAgents - All ai:agent objects
 * @param {object[]} aiTools - All ai:tool objects
 * @param {object[]} classes - Discovered class list
 * @returns {string} Complete instructions for the MCP prompt
 */
export function buildAgentInstructions(agent, allAgents, aiTools, classes) {
  const sections = [];

  // ── Header ──
  sections.push(`# ElementStore MCP Server — ${agent?.title || agent?.name || 'Agent'}`);
  sections.push(`Connected to: elementStore`);
  sections.push(`Agent: ${agent?.id || 'unknown'} (${agent?.title || agent?.name || 'unnamed'})`);
  sections.push('');

  // ── Agent's own prompt (from the store — this is the primary directive) ──
  if (agent?.prompt) {
    sections.push('## Agent Directive (from elementStore)');
    sections.push('');
    sections.push(agent.prompt);
    sections.push('');
  }

  // ── MCP Tools available ──
  sections.push('## MCP Tools');
  sections.push('');
  sections.push('You have these elementStore tools available via MCP:');
  sections.push('');
  sections.push('| Tool | Purpose |');
  sections.push('|------|---------|');
  sections.push('| es_health | Check server connectivity |');
  sections.push('| es_classes | List all classes (id, name, description) |');
  sections.push('| es_class_props | Get property schema for a class |');
  sections.push('| es_query | Query objects with filters, sort, pagination |');
  sections.push('| es_create | Create object (class_id + data) |');
  sections.push('| es_update | Update object (class_id, id, data) |');
  sections.push('| es_delete | Delete object |');
  sections.push('| es_find | Find object by ID across all classes |');
  sections.push('| es_action | Execute an @action |');
  sections.push('');

  // ── Tool bindings (from ai:tool objects) ──
  if (aiTools.length > 0) {
    sections.push('## Registered Tool Bindings (ai:tool)');
    sections.push('');
    sections.push('These are the defined tool capabilities with their class bindings:');
    sections.push('');
    for (const tool of aiTools) {
      if (!tool.enabled) continue;
      const actions = (tool.allowed_actions || [])
        .map(a => {
          if (a.type === 'class') return `${a.ref_class_id} [${(a.actions || []).join(',')}]`;
          if (a.type === 'class_action') return `${a.ref_class_id}.${a.action}`;
          return JSON.stringify(a);
        })
        .join(', ');
      sections.push(`- **${tool.id}** (${tool.category || 'general'}): ${tool.description || ''}`);
      if (actions) sections.push(`  Bindings: ${actions}`);
    }
    sections.push('');
  }

  // ── Team agents ──
  if (allAgents.length > 0) {
    sections.push('## Team Agents');
    sections.push('');
    sections.push('All registered agents in the system:');
    sections.push('');
    sections.push('| ID | Title | Active | Domain |');
    sections.push('|----|-------|--------|--------|');
    for (const a of allAgents) {
      const domain = Array.isArray(a.domain) ? a.domain.join(', ') : (a.domain || '-');
      sections.push(`| ${a.id} | ${a.title || a.name} | ${a.is_active ? 'yes' : 'no'} | ${domain} |`);
    }
    sections.push('');
  }

  // ── Class catalog summary ──
  if (classes.length > 0) {
    // Group by namespace
    const groups = {};
    for (const c of classes) {
      const ns = c.id.includes(':') ? c.id.split(':')[0] : 'core';
      if (!groups[ns]) groups[ns] = [];
      groups[ns].push(c);
    }

    sections.push('## Available Classes');
    sections.push('');
    sections.push(`${classes.length} classes across ${Object.keys(groups).length} namespaces:`);
    sections.push('');
    for (const [ns, cls] of Object.entries(groups).sort()) {
      const names = cls.map(c => c.id).join(', ');
      sections.push(`- **${ns}** (${cls.length}): ${names}`);
    }
    sections.push('');
  }

  // ── Core rules (always present) ──
  sections.push('## Core Rules');
  sections.push('');
  sections.push('1. **All operations through the store** — use es_* tools for every read/write. Never bypass.');
  sections.push('2. **Check schema first** — call es_class_props before creating/updating objects.');
  sections.push('3. **Use es_query with filters** — never list entire classes without need.');
  sections.push('4. **Object IDs follow namespace:name** — e.g. agent:cto, feat:mcp_server, task:fix-login.');
  sections.push('5. **Task lifecycle** — create ai:task objects for work items (open → in_progress → done).');
  sections.push('6. **Feature tracking** — every feature tracked as @feature + @app_feature objects.');
  sections.push('7. **Agent awareness** — check which agent handles a domain before acting outside yours.');
  sections.push('8. **Display with field selection** — when showing query results, use `X-Response-Format: text` header and `X-Fields` to select only relevant columns. Never dump full schema.');
  sections.push('');

  return sections.join('\n');
}
