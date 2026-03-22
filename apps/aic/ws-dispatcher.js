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
function spawnAgent(agentId, msgId, force) {
  // Check if already running — but allow parallel runs for assistant (owner messages)
  if (runningAgents.has(agentId) && !force) {
    log(`  ⏳ ${agentId} already running, skipping`);
    return;
  }

  // Check if agent is active
  const config = agentConfigs.get(agentId);
  if (config && !config.is_active) {
    log(`  ⏸ ${agentId} is inactive, skipping`);
    return;
  }

  // Check cooldown (skip for forced spawns)
  if (!force) {
    const lastRun = agentCooldowns.get(agentId) || 0;
    const cooldown = config?.cooldown || 10000;
    const elapsed = Date.now() - lastRun;
    if (elapsed < cooldown) {
      log(`  ⏳ ${agentId} cooling down (${Math.ceil((cooldown - elapsed) / 1000)}s left)`);
      return;
    }
  }

  const agentName = config?.name || agentId;
  log(`▶ Spawning ${agentName} (${agentId}) for ${msgId || 'auto'}`);

  const args = [path.join(SCRIPT_DIR, 'agent-run.sh'), agentId];
  if (msgId) args.push(msgId);

  const logFile = `/tmp/aic-agent-${agentId.split(':')[1] || agentId}.log`;

  const child = execFile('bash', args, {
    env: { ...process.env, ES_URL },
    maxBuffer: 10 * 1024 * 1024,
    timeout: 1800000 // 30 min max per agent run
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

    // Owner message → assistant (always, even if assistant is busy)
    if (item.user_id === 'owner' && item.role === 'user') {
      const target = item.agent_id || 'agent:assistant';
      log(`  👤 Owner message → force-spawning ${target}`);
      spawnAgent(target, item.id, true);
      return;
    }
  }

  // ── Agent completed a response → autonomous orchestration loop ──
  if (item.class_id === 'ai:message' && item.status === 'complete' && item.role === 'assistant') {
    const fromAgent = item.agent_id || '';

    // Any non-coordinator/assistant agent completes → tell coordinator what happened
    if (fromAgent && fromAgent !== 'agent:coordinator' && fromAgent !== 'agent:assistant') {
      const contentPreview = (item.content || '').substring(0, 300);
      log(`  🔄 ${fromAgent} completed → notifying Coordinator`);
      createPendingMessage('agent:coordinator',
        `Agent ${fromAgent} just completed their work. Here's a summary:\n\n${contentPreview}${(item.content||'').length > 300 ? '...' : ''}\n\nCheck open tasks: curl -sf "${ES_URL}/query/ai:task?status=open&_limit=20"\nCheck findings: curl -sf "${ES_URL}/store/es:finding" | jq length\n\nDecide what's next. Create fix tasks for any findings that don't have tasks yet. Assign work. Keep the pipeline moving.`);
    }

    // Coordinator itself completes → check if there's still unfinished work
    if (fromAgent === 'agent:coordinator') {
      log(`  🔄 Coordinator completed — checking for remaining work...`);
      setTimeout(() => checkRemainingWork(), 5000);
    }
  }

  // ── Finding status changed to fixed/closed → close GitLab issue ──
  if (item.class_id === 'es:finding' && (item.status === 'fixed' || item.status === 'closed') && item.gitlab_iid) {
    log(`  ✅ Closing GitLab issue #${item.gitlab_iid}`);
    closeGitLabIssue(item.gitlab_iid);
  }

  // ── Task completed → check if linked findings should be closed ──
  if (item.class_id === 'ai:task' && (item.status === 'done' || item.status === 'verified')) {
    // Close any findings linked to this task
    if (item.finding_id) {
      esPut('/store/es:finding/' + encodeURIComponent(item.finding_id), { status: 'fixed' });
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

  // ── New finding → create GitLab issue + notify coordinator ──
  if (item.class_id === 'es:finding' && item.status === 'open') {
    log(`  🐛 New finding: ${item.id}`);
    // Auto-create GitLab issue if no issue exists yet
    if (!item.gitlab_issue) {
      createGitLabIssue(item);
    }
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

      // Also handle direct change format: { type: "changes", items: [...] }
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

// ─── GitLab Integration ──────────────────────────────────
const GITLAB_URL = 'https://git.agura.tech';
const GITLAB_TOKEN = process.env.GITLAB_TOKEN || 'sj_e7zLpxkS3NJA8ZwJE';
const GITLAB_PROJECT_ID = 123;

function createGitLabIssue(finding) {
  const severity = (finding.severity || 'medium').toUpperCase();
  const labels = ['aic-bot', finding.severity || 'medium', finding.category || 'bug'].join(',');

  let description = `## ${finding.name}\n\n`;
  if (finding.description) description += `${finding.description}\n\n`;
  if (finding.location) {
    const locs = Array.isArray(finding.location) ? finding.location : [finding.location];
    description += `**Location:** ${locs.join(', ')}\n\n`;
  }
  if (finding.fix) description += `**Suggested fix:** ${finding.fix}\n\n`;
  description += `---\n*Created by AIC agent from finding \`${finding.id}\`*`;

  const body = JSON.stringify({
    title: `[${severity}] ${finding.name}`,
    description,
    labels
  });

  const url = new URL(`${GITLAB_URL}/api/v4/projects/${GITLAB_PROJECT_ID}/issues`);
  const client = url.protocol === 'https:' ? https : http;

  const req = client.request({
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'POST',
    rejectUnauthorized: false,
    headers: {
      'PRIVATE-TOKEN': GITLAB_TOKEN,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try {
        const issue = JSON.parse(data);
        if (issue.iid) {
          log(`  📝 GitLab issue #${issue.iid}: ${finding.name}`);
          // Store the issue URL back on the finding
          esPut('/store/es:finding/' + encodeURIComponent(finding.id), {
            gitlab_issue: issue.web_url,
            gitlab_iid: issue.iid
          });
        }
      } catch (e) {}
    });
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

// PUT helper for updates
function esPut(path, body) {
  const url = new URL(ES_URL + path);
  const client = url.protocol === 'https:' ? https : http;
  const bodyStr = JSON.stringify(body);
  const req = client.request({
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
  });
  req.on('error', () => {});
  req.write(bodyStr);
  req.end();
}

function closeGitLabIssue(iid) {
  const body = JSON.stringify({ state_event: 'close', labels: 'aic-bot,fixed' });
  const url = new URL(`${GITLAB_URL}/api/v4/projects/${GITLAB_PROJECT_ID}/issues/${iid}`);
  const client = url.protocol === 'https:' ? https : http;
  const req = client.request({
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'PUT',
    rejectUnauthorized: false,
    headers: {
      'PRIVATE-TOKEN': GITLAB_TOKEN,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try {
        const issue = JSON.parse(data);
        log(`  ✅ GitLab issue #${iid} closed: ${issue.state}`);
      } catch (e) {}
    });
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

// ─── Autonomous work checker ─────────────────────────────
// Runs after coordinator completes to see if there's still work to do
function checkRemainingWork() {
  const client = ES_URL.startsWith('https') ? https : http;

  // Check open tasks
  const tasksUrl = new URL(ES_URL + '/query/ai:task?status=open&_limit=50');
  const inProgressUrl = new URL(ES_URL + '/query/ai:task?status=in_progress&_limit=50');

  Promise.all([
    new Promise((resolve) => {
      client.get(tasksUrl, (res) => {
        let data = ''; res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve([]); } });
      }).on('error', () => resolve([]));
    }),
    new Promise((resolve) => {
      client.get(inProgressUrl, (res) => {
        let data = ''; res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve([]); } });
      }).on('error', () => resolve([]));
    })
  ]).then(([openTasks, inProgressTasks]) => {
    const totalPending = openTasks.length + inProgressTasks.length;

    if (totalPending === 0) {
      log('  ✅ All work complete — no open or in-progress tasks');
      createPendingMessage('agent:assistant',
        'All tasks are complete. The team has finished the current workload. Inform the owner of the final status — summarize what was accomplished, how many findings were discovered, and what was fixed.');
      return;
    }

    // Check for stuck in_progress tasks (no agent running on them)
    inProgressTasks.forEach(task => {
      const assignedAgent = task.agent_id;
      if (assignedAgent && !runningAgents.has(assignedAgent)) {
        log(`  ⚠ Stuck task: ${task.id} (${task.name}) — in_progress but ${assignedAgent} is idle`);
        createPendingMessage(assignedAgent,
          `You have a stuck task that needs attention: "${task.name}" (${task.id}). It's marked in_progress but you're not working on it. Pick it up and complete it. Task details: ${task.description || 'Check the task in the store.'}`);
      }
    });

    // Trigger developers for open tasks — distribute across available devs
    const devAgents = ['agent:developer', 'agent:developer-2', 'agent:developer-3'];
    let devIdx = 0;
    openTasks.forEach(task => {
      const assignedAgent = task.agent_id || devAgents[devIdx % devAgents.length];
      if (!runningAgents.has(assignedAgent)) {
        log(`  📌 Open task needs pickup: ${task.id} → ${assignedAgent}`);
        createPendingMessage(assignedAgent,
          `Open task assigned to you: "${task.name}" (${task.id}). Priority: ${task.priority || 'P2'}. Pick it up and work on it. ${task.description || ''}`);
        devIdx++;
      }
    });

    log(`  📊 Remaining: ${openTasks.length} open, ${inProgressTasks.length} in_progress`);
  });
}

// Periodic check every 2 minutes for stuck work
setInterval(checkRemainingWork, 120000);

// ─── Status & stream endpoints ───────────────────────────
const fs = require('fs');

const statusServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: ws?.readyState === WebSocket.OPEN ? 'connected' : 'disconnected',
      running_agents: Object.fromEntries(runningAgents),
      agent_count: agentConfigs.size,
      uptime_s: Math.floor(process.uptime())
    }));
    return;
  }

  // /stream/:agentId — return the live stream output for a running agent
  const streamMatch = req.url.match(/^\/stream\/(.+)$/);
  if (streamMatch) {
    const agentId = decodeURIComponent(streamMatch[1]);
    const info = runningAgents.get(agentId);

    if (!info) {
      // Agent not running — try to return the last log
      const shortName = agentId.split(':')[1] || agentId;
      const logFile = `/tmp/aic-agent-${shortName}.log`;
      try {
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content.split('\n').slice(-100).join('\n');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'idle', agent_id: agentId, lines: lines.split('\n') }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'idle', agent_id: agentId, lines: ['Agent is idle. No recent log.'] }));
      }
      return;
    }

    // Agent is running — read the stream-json temp file
    const msgId = info.msgId || '';
    const pid = info.pid || '';

    // Find the temp file
    let streamContent = '';
    try {
      const files = fs.readdirSync('/tmp').filter(f => f.startsWith('aic-run-') && f.includes(String(pid)));
      if (files.length > 0) {
        streamContent = fs.readFileSync('/tmp/' + files[0], 'utf8');
      } else {
        // Try by msgId
        const byMsg = fs.readdirSync('/tmp').filter(f => f.startsWith('aic-run-') && msgId && f.includes(msgId));
        if (byMsg.length > 0) {
          streamContent = fs.readFileSync('/tmp/' + byMsg[0], 'utf8');
        }
      }
    } catch (e) {}

    // Parse stream-json into readable lines
    const lines = [];
    const elapsed = Math.floor((Date.now() - info.startedAt) / 1000);
    lines.push(`[agent: ${agentId}] [pid: ${pid}] [running: ${elapsed}s] [msg: ${msgId}]`);
    lines.push('');

    if (streamContent) {
      streamContent.split('\n').forEach(line => {
        if (!line.trim()) return;
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'assistant' && obj.message?.content) {
            obj.message.content.forEach(block => {
              if (block.type === 'text') {
                lines.push('[text] ' + block.text.substring(0, 200));
              } else if (block.type === 'tool_use') {
                lines.push('[tool] ' + block.name + '(' + JSON.stringify(block.input).substring(0, 150) + ')');
              }
            });
          } else if (obj.type === 'user' && obj.tool_use_result) {
            const stdout = (obj.tool_use_result.stdout || '').substring(0, 200);
            const stderr = (obj.tool_use_result.stderr || '').substring(0, 100);
            if (stdout) lines.push('[result] ' + stdout.replace(/\n/g, ' '));
            if (stderr) lines.push('[stderr] ' + stderr.replace(/\n/g, ' '));
          } else if (obj.type === 'result') {
            lines.push('[done] ' + (obj.result || '').substring(0, 200));
          }
        } catch (e) {}
      });
    } else {
      lines.push('Waiting for output...');
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'running', agent_id: agentId, elapsed_s: elapsed, lines }));
    return;
  }

  // /agents — list all agents with status
  if (req.url === '/agents') {
    const agents = [];
    agentConfigs.forEach((config, id) => {
      const running = runningAgents.get(id);
      agents.push({
        id,
        name: config.name,
        status: running ? 'running' : 'idle',
        pid: running?.pid,
        elapsed_s: running ? Math.floor((Date.now() - running.startedAt) / 1000) : 0,
        msgId: running?.msgId
      });
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(agents));
    return;
  }

  res.writeHead(404);
  res.end();
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
