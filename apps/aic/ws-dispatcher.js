#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// ws-dispatcher.js — Event-driven agent dispatch via WebSocket
//
// Replaces the 5-minute polling loop in server.sh.
// Connects to elementStore WebSocket, subscribes to ai:message and
// ai:task changes, spawns agent-run.sh immediately when work arrives.
//
// Usage:
//   node ws-dispatcher.js
//   ES_URL=http://... WS_URL=ws://... node ws-dispatcher.js
// ═══════════════════════════════════════════════════════════════════

const WebSocket = require('ws');
const { execFile } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');

// ─── Config ──────────────────────────────────────────────
const ES_URL = process.env.ES_URL || 'http://arc3d.master.local/elementStore';
const WS_URL = process.env.WS_URL || ES_URL.replace(/^http/, 'ws') + '/ws';
const SCRIPT_DIR = __dirname;
const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_DELAY = 30000;

// ─── State ───────────────────────────────────────────────
const runningAgents = new Map();   // agent_id → { pid, startedAt, msgId }
const agentCooldowns = new Map();  // agent_id → lastCompletedAt (ms)
const agentConfigs = new Map();    // agent_id → { cooldown, tools, ... }
let reconnectDelay = RECONNECT_DELAY;
let ws = null;

// ─── Logging ─────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// ─── Load agent configs from store ───────────────────────
function loadAgentConfigs() {
  const url = new URL(ES_URL + '/store/ai:agent');
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    client.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const agents = JSON.parse(data);
          agents.forEach(agent => {
            agentConfigs.set(agent.id, {
              name: agent.name || '?',
              cooldown: (agent.behavior?.cooldown || 10) * 1000,
              tools: agent.tools || [],
              execution_order: agent.execution_order || 0,
              is_active: agent.is_active !== false
            });
          });
          log(`Loaded ${agentConfigs.size} agent configs`);
        } catch (e) {
          log(`Failed to parse agent configs: ${e.message}`);
        }
        resolve();
      });
    }).on('error', (e) => {
      log(`Failed to load agent configs: ${e.message}`);
      resolve();
    });
  });
}

// ─── ES API helpers ──────────────────────────────────────
function esPost(path, body) {
  const url = new URL(ES_URL + path);
  const client = url.protocol === 'https:' ? https : http;
  const bodyStr = JSON.stringify(body);

  const req = client.request({
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr)
    }
  });
  req.on('error', () => {}); // fire-and-forget
  req.write(bodyStr);
  req.end();
}

function createPendingMessage(agentId, content) {
  esPost('/store/ai:message', {
    class_id: 'ai:message',
    user_id: 'system',
    agent_id: 'system',
    to_agents: [agentId],
    role: 'user',
    content: content,
    status: 'pending',
    created: new Date().toISOString()
  });
}

// ─── Agent spawning ──────────────────────────────────────
function spawnAgent(agentId, msgId) {
  // Check if already running
  if (runningAgents.has(agentId)) {
    log(`  ⏳ ${agentId} already running, skipping`);
    return;
  }

  // Check if agent is active
  const config = agentConfigs.get(agentId);
  if (config && !config.is_active) {
    log(`  ⏸ ${agentId} is inactive, skipping`);
    return;
  }

  // Check cooldown
  const lastRun = agentCooldowns.get(agentId) || 0;
  const cooldown = config?.cooldown || 10000;
  const elapsed = Date.now() - lastRun;
  if (elapsed < cooldown) {
    log(`  ⏳ ${agentId} cooling down (${Math.ceil((cooldown - elapsed) / 1000)}s left)`);
    return;
  }

  const agentName = config?.name || agentId;
  log(`▶ Spawning ${agentName} (${agentId}) for ${msgId || 'auto'}`);

  const args = [path.join(SCRIPT_DIR, 'agent-run.sh'), agentId];
  if (msgId) args.push(msgId);

  const logFile = `/tmp/aic-agent-${agentId.split(':')[1] || agentId}.log`;

  const child = execFile('bash', args, {
    env: { ...process.env, ES_URL },
    maxBuffer: 10 * 1024 * 1024,
    timeout: 600000 // 10 min max per agent run
  }, (error, stdout, stderr) => {
    runningAgents.delete(agentId);
    agentCooldowns.set(agentId, Date.now());

    if (error) {
      if (error.killed) {
        log(`  ✗ ${agentName} killed (timeout)`);
      } else {
        log(`  ✗ ${agentName} error: ${error.message}`);
      }
    } else {
      log(`  ✓ ${agentName} completed`);
    }
  });

  runningAgents.set(agentId, {
    pid: child.pid,
    startedAt: Date.now(),
    msgId
  });
}

// ─── Event handling ──────────────────────────────────────
function handleChange(item) {
  if (!item || !item.id) return;

  // ── Pending message with to_agents → dispatch to target agent ──
  if (item.class_id === 'ai:message' && item.status === 'pending') {
    // Direct agent targeting
    if (item.to_agents && Array.isArray(item.to_agents)) {
      item.to_agents.forEach(agentId => {
        spawnAgent(agentId, item.id);
      });
      return;
    }

    // Owner message → assistant
    if (item.user_id === 'owner' && item.role === 'user') {
      const target = item.agent_id || 'agent:assistant';
      spawnAgent(target, item.id);
      return;
    }
  }

  // ── Task status changes → route to next agent ──
  if (item.class_id === 'ai:task') {
    // Task marked for review → notify reviewer
    if (item.status === 'review') {
      log(`  📋 Task ${item.id} ready for review`);
      createPendingMessage('agent:reviewer',
        `Task ready for review: ${item.id} — "${item.name || 'unnamed'}". Please verify the work.`);
    }

    // Task verified → notify coordinator
    if (item.status === 'verified') {
      log(`  ✅ Task ${item.id} verified`);
      createPendingMessage('agent:coordinator',
        `Task verified: ${item.id} — "${item.name || 'unnamed'}". Mark as done or assign follow-up.`);
    }

    // Task failed/rejected → reassign to developer
    if (item.status === 'failed' || item.status === 'assigned') {
      // Only trigger developer if this is a reassignment (has retry_count)
      if (item.retry_count && item.retry_count > 0) {
        log(`  🔄 Task ${item.id} reassigned (retry ${item.retry_count})`);
        createPendingMessage('agent:developer',
          `Task needs rework: ${item.id} — "${item.name || 'unnamed'}". Retry ${item.retry_count}/3.`);
      }
    }

    // New task assigned to developer → notify developer
    if (item.status === 'assigned' && item.agent_id === 'agent:developer' && !item.retry_count) {
      log(`  📌 New task assigned: ${item.id}`);
      createPendingMessage('agent:developer',
        `New task assigned to you: ${item.id} — "${item.name || 'unnamed'}". Priority: ${item.priority || 'P2'}.`);
    }
  }

  // ── New finding → notify coordinator ──
  if (item.class_id === 'es:finding' && item.status === 'open') {
    log(`  🐛 New finding: ${item.id}`);
    createPendingMessage('agent:coordinator',
      `New finding reported: ${item.id} — "${item.name || item.description || 'unnamed'}". Severity: ${item.severity || 'medium'}.`);
  }
}

// ─── WebSocket connection ────────────────────────────────
function connect() {
  const wsUrl = WS_URL + '?user_id=aic-dispatcher';
  log(`Connecting to ${wsUrl}...`);

  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    log('Connected to WebSocket');
    reconnectDelay = RECONNECT_DELAY;

    // Subscribe to classes we care about
    const subscriptions = ['ai:message', 'ai:task', 'es:finding'];
    subscriptions.forEach(cls => {
      ws.send(JSON.stringify({ action: 'subscribe', class_id: cls }));
      log(`  Subscribed to ${cls}`);
    });
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // elementStore broadcasts: { class_id: "@changes", items: [...] }
      if ((msg.class_id === '@changes' || msg.type === 'changes') && msg.items) {
        msg.items.forEach(handleChange);
      }

      // Respond to server heartbeat pings
      if (msg.event === 'ping') {
        ws.send(JSON.stringify({ action: 'ping' }));
      }

      if (msg.event === 'subscribed') {
        // Subscription confirmed
      }
    } catch (e) {
      // Ignore parse errors
    }
  });

  ws.on('close', () => {
    log(`Disconnected. Reconnecting in ${reconnectDelay / 1000}s...`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
    // Close handler will trigger reconnect
  });
}

// ─── Status endpoint ─────────────────────────────────────
// Simple HTTP server for daemon to check dispatcher health
const statusServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: ws?.readyState === WebSocket.OPEN ? 'connected' : 'disconnected',
      running_agents: Object.fromEntries(runningAgents),
      agent_count: agentConfigs.size,
      uptime_s: Math.floor(process.uptime())
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

// ─── Main ────────────────────────────────────────────────
async function main() {
  log('═══════════════════════════════════════');
  log('  AIC Dispatcher (event-driven)');
  log(`  ES:  ${ES_URL}`);
  log(`  WS:  ${WS_URL}`);
  log('═══════════════════════════════════════');

  // Load agent configs
  await loadAgentConfigs();

  // Start health endpoint
  const STATUS_PORT = process.env.DISPATCHER_PORT || 3102;
  statusServer.listen(STATUS_PORT, '127.0.0.1', () => {
    log(`Health endpoint: http://127.0.0.1:${STATUS_PORT}/health`);
  });

  // Connect to WebSocket
  connect();

  // Periodic config reload (every 5 minutes)
  setInterval(loadAgentConfigs, 300000);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    log('SIGTERM received, shutting down...');
    if (ws) ws.close();
    statusServer.close();

    // Kill running agents
    runningAgents.forEach((info, agentId) => {
      try { process.kill(info.pid); } catch (e) {}
    });

    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('SIGINT received, shutting down...');
    if (ws) ws.close();
    statusServer.close();
    process.exit(0);
  });
}

main();
