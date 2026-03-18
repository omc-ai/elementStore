#!/usr/bin/env node
/**
 * ElementStore MCP Server — entry point
 *
 * Connects to a live elementStore, discovers all classes, and exposes
 * them as MCP tools via stdio transport.
 *
 * Modes:
 *   --mode generic   (default) 9 generic tools + class catalog as resource
 *   --mode typed     Per-class CRUD tools for all discovered classes
 *   --mode filter    Per-class tools only for --classes list
 *
 * Usage:
 *   ES_URL=http://localhost/elementStore node src/index.js
 *   node src/index.js --url http://localhost/elementStore
 *   node src/index.js --url http://localhost/elementStore --mode typed --system-classes
 *   node src/index.js --url http://localhost/elementStore --mode filter --classes ai:agent,ai:task,es:feature
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { EsClient } from './es-client.js';
import { generateClassTools, generateGenericTools } from './tool-generator.js';
import { ES_SERVER_INSTRUCTIONS } from './instructions.js';

// ── Parse args ──
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return args[idx + 1];
}
const hasFlag = (name) => args.includes(`--${name}`);

const esUrl = getArg('url') || process.env.ES_URL || 'http://localhost/elementStore';
const mode = getArg('mode') || process.env.ES_MCP_MODE || 'generic';
const includeSystem = hasFlag('system-classes') || process.env.ES_INCLUDE_SYSTEM === '1';
const classFilter = (getArg('classes') || process.env.ES_MCP_CLASSES || '').split(',').filter(Boolean);
const token = getArg('token') || process.env.ES_TOKEN || null;

// ── Init client ──
const client = new EsClient(esUrl, { token });

// ── State ──
const tools = new Map();           // name → { definition, meta }
let discoveredClasses = [];         // full class list for resource

function registerTool(def) {
  tools.set(def.name, { definition: def, meta: def._meta });
}

// ── Discover classes → generate tools ──
async function discover() {
  // Always register generic tools
  for (const t of generateGenericTools()) registerTool(t);

  try {
    const classes = await client.listClasses();
    const classList = Array.isArray(classes) ? classes : (classes.data || []);
    discoveredClasses = classList.filter(c => includeSystem || !c.id.startsWith('@'));

    // In generic mode: no per-class tools, just generic + resource
    if (mode === 'generic') {
      console.error(`[es-mcp] Mode: generic — ${tools.size} generic tools + ${discoveredClasses.length} classes as resource`);
      return;
    }

    // Determine which classes get per-class tools
    let targetClasses = discoveredClasses;
    if (mode === 'filter' && classFilter.length > 0) {
      targetClasses = discoveredClasses.filter(c => classFilter.includes(c.id));
    }

    let count = 0;
    for (const classDef of targetClasses) {
      try {
        const props = await client.getClassProps(classDef.id);
        const propList = Array.isArray(props) ? props : (props.data || props.props || []);
        for (const t of generateClassTools(classDef, propList)) {
          registerTool(t);
          count++;
        }
      } catch (err) {
        console.error(`[es-mcp] Props failed for ${classDef.id}: ${err.message}`);
      }
    }
    console.error(`[es-mcp] Mode: ${mode} — ${targetClasses.length} classes → ${count} class tools + ${generateGenericTools().length} generic = ${tools.size} total`);
  } catch (err) {
    console.error(`[es-mcp] Discovery failed (${err.message}). Only generic tools available.`);
  }
}

// ── Execute a tool call ──
async function executeTool(name, params) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);

  const { classId, operation } = tool.meta;

  switch (operation) {
    case 'health':
      return client.health();

    case 'classes': {
      const cls = await client.listClasses();
      const list = Array.isArray(cls) ? cls : (cls.data || []);
      return list.map(c => ({ id: c.id, name: c.name, description: c.description }));
    }

    case 'class_props':
      return client.getClassProps(params.class_id);

    case 'find':
      return client.findObject(params.id);

    case 'query': {
      const { class_id, filter, ...pag } = params;
      return client.listObjects(class_id, { ...filter, ...pag });
    }

    case 'generic_create':
      return client.createObject(params.class_id, { ...params.data, class_id: params.class_id });

    case 'generic_update':
      return client.updateObject(params.class_id, params.id, params.data);

    case 'generic_delete':
      return client.deleteObject(params.class_id, params.id);

    case 'action':
      return client.executeAction(params.action_id, params.params || {});

    // Per-class CRUD
    case 'list': {
      const { filter, ...pag } = params;
      return client.listObjects(classId, { ...filter, ...pag });
    }

    case 'get':
      return client.getObject(classId, params.id);

    case 'create': {
      const { id: objId, ...fields } = params;
      const data = { ...fields, class_id: classId };
      if (objId) data.id = objId;
      return client.createObject(classId, data);
    }

    case 'update': {
      const { id: objId, ...fields } = params;
      return client.updateObject(classId, objId, fields);
    }

    case 'delete':
      return client.deleteObject(classId, params.id);

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// ── Create MCP server ──
const server = new Server(
  { name: 'elementStore', version: '0.1.0' },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

// Handle tools/list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const toolList = [];
  for (const [, { definition }] of tools) {
    const { _meta, ...def } = definition;
    toolList.push(def);
  }
  return { tools: toolList };
});

// Handle tools/call
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: params } = request.params;
  try {
    const result = await executeTool(name, params || {});
    return {
      content: [{
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${err.message}`,
      }],
      isError: true,
    };
  }
});

// Handle resources/list — expose class catalog
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'es://classes',
        name: 'ElementStore Class Catalog',
        description: `All ${discoveredClasses.length} discoverable classes with their names, descriptions, and IDs. Use with es_query/es_create/es_update tools.`,
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle resources/read
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  if (uri === 'es://classes') {
    const catalog = discoveredClasses.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
    }));
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(catalog, null, 2),
      }],
    };
  }
  throw new Error(`Unknown resource: ${uri}`);
});

// Handle prompts/list
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'elementstore-guide',
        description: 'How to use the elementStore MCP tools — class discovery, CRUD, querying, and task management.',
      },
    ],
  };
});

// Handle prompts/get
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === 'elementstore-guide') {
    return {
      description: 'ElementStore MCP usage guide',
      messages: [{
        role: 'user',
        content: { type: 'text', text: ES_SERVER_INSTRUCTIONS },
      }],
    };
  }
  throw new Error(`Unknown prompt: ${request.params.name}`);
});

// ── Main ──
async function main() {
  console.error(`[es-mcp] elementStore MCP Server starting...`);
  console.error(`[es-mcp] URL: ${esUrl}`);
  console.error(`[es-mcp] Mode: ${mode}`);

  // Discover classes before accepting connections
  await discover();

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[es-mcp] Server running on stdio`);
}

main().catch(err => {
  console.error(`[es-mcp] Fatal: ${err.message}`);
  process.exit(1);
});
