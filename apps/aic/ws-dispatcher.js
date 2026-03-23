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

// ─── Token loading ──────────────────────────────────────
const fs = require('fs');
const TOKEN_FILE = process.env.ES_TOKEN_FILE || require('os').homedir() + '/.es/token.json';
let ES_TOKEN = process.env.ES_TOKEN || '';

function loadCachedToken() {
  if (ES_TOKEN) return;
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    if (data.accessToken) { ES_TOKEN = data.accessToken; log('Loaded token from ' + TOKEN_FILE); }
  } catch { /* no cached token */ }
}
loadCachedToken();

// ─── State ───────────────────────────────────────────────
const runningAgents = new Map();   // agent_id → { pid, startedAt, msgId }
const agentCooldowns = new Map();  // agent_id → lastCompletedAt (ms)
const agentConfigs = new Map();    // agent_id → { cooldown, tools, ... }
// F3 — Stuck detection: tracks output hashes to detect agent loops
const agentStuckState = new Map(); // agent_id → { lastHash, loopCount, lastProgressAt }
const STUCK_LOOP_THRESHOLD = 3;    // N identical outputs → stuck
const STUCK_TIMEOUT_MS = 20 * 60 * 1000; // 20 min with no progress → stuck
let reconnectDelay = RECONNECT_DELAY;
let ws = null;

// ─── Logging ─────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// ─── F3: Stuck detection helpers ─────────────────────────
const crypto = require('crypto');

function hashOutput(text) {
  // Normalize whitespace + lowercase before hashing to avoid false positives
  const normalized = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha1').update(normalized).digest('hex').substring(0, 12);
}

function checkStuck(agentId, outputText) {
  const hash = hashOutput(outputText);
  const state = agentStuckState.get(agentId) || { lastHash: null, loopCount: 0, lastProgressAt: Date.now() };

  if (state.lastHash === hash) {
    state.loopCount++;
    log(`  🔁 F3 Stuck[${agentId}]: loop ${state.loopCount}/${STUCK_LOOP_THRESHOLD} (hash=${hash})`);
  } else {
    // Progress detected — reset
    state.loopCount = 0;
    state.lastProgressAt = Date.now();
    state.lastHash = hash;
  }
  state.lastHash = hash;
  agentStuckState.set(agentId, state);
  return state.loopCount >= STUCK_LOOP_THRESHOLD;
}

function reportStuckAgent(agentId) {
  const config = agentConfigs.get(agentId);
  const agentName = config?.name || agentId;
  log(`  🚨 F3 STUCK AGENT: ${agentName} — reporting finding + notifying coordinator`);

  esPost('/store/es:finding', {
    class_id: 'es:finding',
    name: `Stuck agent: ${agentName}`,
    description: `Agent ${agentId} has produced identical output ${STUCK_LOOP_THRESHOLD} consecutive runs. Possible infinite loop or blocked task. Manual intervention or task reset required.`,
    severity: 'high',
    category: 'stuck',
    agent_id: agentId,
    status: 'open'
  });

  createPendingMessage('agent:coordinator',
    `⚠️ F3 STUCK DETECTION: Agent ${agentId} (${agentName}) appears to be in a loop — identical output for ${STUCK_LOOP_THRESHOLD} consecutive runs.\n\nPossible causes: blocked task, circular dependency, or repeating failed attempt.\n\nPlease:\n1. Review the agent's recent messages\n2. Reset or reassign their current task\n3. Check for any blocking findings\n\nQuery recent: curl -sf "${ES_URL}/query/ai:message?agent_id=${agentId}&_sort=created&_order=desc&_limit=5"`);

  // Reset stuck counter after reporting
  agentStuckState.set(agentId, { lastHash: null, loopCount: 0, lastProgressAt: Date.now() });
}

// ─── Load agent configs from store ───────────────────────
function loadAgentConfigs() {
  const url = new URL(ES_URL + '/store/ai:agent');
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: {} };
    if (ES_TOKEN) opts.headers['Authorization'] = 'Bearer ' + ES_TOKEN;
    client.get(opts, (res) => {
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

  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(bodyStr)
  };
  if (ES_TOKEN) headers['Authorization'] = 'Bearer ' + ES_TOKEN;

  const req = client.request({
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers
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
    env: { ...process.env, ES_URL, ...(ES_TOKEN ? { ES_TOKEN } : {}) },
    maxBuffer: 10 * 1024 * 1024,
    timeout: 1800000 // 30 min max per agent run
  }, (error, stdout, stderr) => {
    runningAgents.delete(agentId);
    agentCooldowns.set(agentId, Date.now());

    if (error) {
      if (error.killed) {
        log(`  ✗ ${agentName} killed (timeout)`);
        // F3: timeout counts as a stuck signal for non-assistant agents
        if (agentId !== 'agent:assistant') {
          const state = agentStuckState.get(agentId) || { lastHash: null, loopCount: 0, lastProgressAt: Date.now() };
          state.loopCount++;
          agentStuckState.set(agentId, state);
          if (state.loopCount >= STUCK_LOOP_THRESHOLD) reportStuckAgent(agentId);
        }
      } else {
        log(`  ✗ ${agentName} error: ${error.message}`);
      }
    } else {
      log(`  ✓ ${agentName} completed`);
      // F3: Check for stuck loops in non-assistant agents
      if (agentId !== 'agent:assistant' && stdout) {
        const isStuck = checkStuck(agentId, stdout);
        if (isStuck) reportStuckAgent(agentId);
      }
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
  if (item.class_id === 'es:finding' && (item.status === 'fixed' || item.status === 'closed' || item.status === 'resolved') && item.gitlab_iid) {
    log(`  ✅ Closing GitLab issue #${item.gitlab_iid}`);
    closeGitLabIssue(item.gitlab_iid);
  }

  // ── Task completed → check if linked findings should be closed ──
  if (item.class_id === 'ai:task' && (item.status === 'done' || item.status === 'verified')) {
    // Close any findings linked to this task
    if (item.finding_id) {
      esPut('/store/es:finding/' + encodeURIComponent(item.finding_id), { status: 'fixed' });
    }

    // F1 DAG Planning: unlock dependent tasks when a task completes
    if (item.dag_id) {
      log(`  🔗 F1 DAG: ${item.id} done — checking for unblocked dependents in ${item.dag_id}`);
      unlockDagDependents(item.id, item.dag_id);
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

// ─── F1: DAG Planning — unlock dependent tasks ───────────
function esGet(path, callback) {
  const url = new URL(ES_URL + path);
  const client = url.protocol === 'https:' ? https : http;
  client.get({ hostname: url.hostname, port: url.port || 80, path: url.pathname + url.search,
    headers: { 'X-Disable-Ownership': 'true' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => { try { callback(JSON.parse(data)); } catch(e) { callback(null); } });
  }).on('error', () => callback(null));
}

function unlockDagDependents(completedTaskId, dagId) {
  // Query all tasks in this DAG that depend on completedTaskId
  esGet(`/query/ai:task?dag_id=${encodeURIComponent(dagId)}&_limit=50`, (tasks) => {
    if (!tasks || !Array.isArray(tasks)) return;

    tasks.forEach(task => {
      if (!task.depends_on || !Array.isArray(task.depends_on)) return;
      if (!task.depends_on.includes(completedTaskId)) return;
      if (task.status !== 'open' && task.status !== 'blocked') return;

      // Check if ALL dependencies are now done
      const allDone = task.depends_on.every(depId => {
        const dep = tasks.find(t => t.id === depId);
        return dep && (dep.status === 'done' || dep.status === 'verified');
      });

      if (allDone) {
        log(`  🔓 F1 DAG: unlocking task ${task.id} (all deps done)`);
        esPut(`/store/ai:task/${encodeURIComponent(task.id)}`, {
          status: 'assigned',
          blocked_by: []
        });
        // Notify the assigned agent
        if (task.agent_id) {
          createPendingMessage(task.agent_id,
            `🔓 DAG task unblocked: ${task.id} — "${task.name}". All dependencies completed. Ready to start.`);
        }
      } else {
        // Update remaining blockers
        const remaining = task.depends_on.filter(depId => {
          const dep = tasks.find(t => t.id === depId);
          return !dep || (dep.status !== 'done' && dep.status !== 'verified');
        });
        esPut(`/store/ai:task/${encodeURIComponent(task.id)}`, { blocked_by: remaining });
      }
    });
  });
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
        res.on('end', () => { try { const r = JSON.parse(data); resolve(Array.isArray(r) ? r : []); } catch(e) { resolve([]); } });
      }).on('error', () => resolve([]));
    }),
    new Promise((resolve) => {
      client.get(inProgressUrl, (res) => {
        let data = ''; res.on('data', c => data += c);
        res.on('end', () => { try { const r = JSON.parse(data); resolve(Array.isArray(r) ? r : []); } catch(e) { resolve([]); } });
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

// ─── Scheduled task runner ───────────────────────────────

// Match a single cron field ("*", "5", "*/5", "1-5", "1,2,3")
function cronFieldMatches(field, value) {
  if (field === '*') return true;
  if (field.includes('/')) {
    const [range, step] = field.split('/');
    const s = parseInt(step);
    if (range === '*') return value % s === 0;
    const start = parseInt(range.split('-')[0]);
    return value >= start && (value - start) % s === 0;
  }
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start && value <= end;
  }
  if (field.includes(',')) {
    return field.split(',').map(Number).includes(value);
  }
  return parseInt(field) === value;
}

// Check if a 5-field cron expression matches a given Date
function cronMatches(expr, date) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, dom, month, dow] = parts;
  return cronFieldMatches(min, date.getMinutes()) &&
         cronFieldMatches(hour, date.getHours()) &&
         cronFieldMatches(dom, date.getDate()) &&
         cronFieldMatches(month, date.getMonth() + 1) &&
         cronFieldMatches(dow, date.getDay());
}

// Parse interval expressions: "30m", "2h", "1d"
function parseIntervalMs(expr) {
  const m = (expr || '').match(/^(\d+)(m|h|d)$/);
  if (!m) return null;
  const n = parseInt(m[1]);
  const unit = m[2];
  if (unit === 'm') return n * 60000;
  if (unit === 'h') return n * 3600000;
  if (unit === 'd') return n * 86400000;
  return null;
}

// Query tasks with schedule_enabled set and fire any that are due
function checkScheduledTasks() {
  // Fetch all tasks and filter client-side (boolean queries are unreliable in the store)
  const url = new URL(ES_URL + '/query/ai:task?_limit=200');
  const client = url.protocol === 'https:' ? https : http;

  client.get(url, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      let allTasks;
      try { allTasks = JSON.parse(data); } catch (e) { return; }
      if (!Array.isArray(allTasks)) return;

      // Filter to only enabled scheduled tasks
      const tasks = allTasks.filter(t => t.schedule_enabled && t.schedule);
      if (tasks.length === 0) return;

      const now = new Date();

      tasks.forEach(task => {
        if (!task.schedule) return;

        const schedule = task.schedule.trim();
        const lastRun = task.schedule_last_run ? new Date(task.schedule_last_run) : null;
        let isDue = false;

        const intervalMs = parseIntervalMs(schedule);
        if (intervalMs !== null) {
          // Interval format: "30m", "2h", "1d"
          if (!lastRun || (now - lastRun) >= intervalMs) {
            isDue = true;
          }
        } else {
          // Standard 5-field cron
          isDue = cronMatches(schedule, now);
          // Prevent double-firing within the same minute
          if (isDue && lastRun) {
            const sameMinute =
              lastRun.getFullYear() === now.getFullYear() &&
              lastRun.getMonth()    === now.getMonth()    &&
              lastRun.getDate()     === now.getDate()     &&
              lastRun.getHours()    === now.getHours()    &&
              lastRun.getMinutes()  === now.getMinutes();
            if (sameMinute) isDue = false;
          }
        }

        if (!isDue) return;

        log(`⏰ Scheduled: ${task.id} — "${task.name}" (${schedule})`);

        // Record last run timestamp immediately to prevent double-fire
        esPut('/store/ai:task/' + encodeURIComponent(task.id), {
          schedule_last_run: now.toISOString()
        });

        // Notify the assigned agent (or coordinator as fallback)
        const agentId = task.agent_id || 'agent:coordinator';
        createPendingMessage(agentId,
          `Scheduled task triggered: "${task.name}" (${task.id}). Schedule: ${schedule}. Execute this task now.`);
      });
    });
  }).on('error', (e) => {
    log(`Schedule check error: ${e.message}`);
  });
}

// Check schedules every minute
setInterval(checkScheduledTasks, 60000);

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

  // Run schedule check at startup (pick up any tasks that fired while offline)
  setTimeout(checkScheduledTasks, 3000);

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

  // Never crash on unhandled errors — log and continue
  process.on('uncaughtException', (err) => {
    log(`UNCAUGHT ERROR: ${err.message}`);
    console.error(err.stack);
  });
  process.on('unhandledRejection', (err) => {
    log(`UNHANDLED REJECTION: ${err?.message || err}`);
  });
}

main();
