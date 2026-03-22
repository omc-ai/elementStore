// =====================================================================
// HEALTH CHECK - Polling + indicator
// =====================================================================

let _healthInterval = null;

async function checkHealth() {
    const indicator = document.getElementById('healthIndicator');
    if (!indicator) return;

    const dot = indicator.querySelector('.health-dot');
    const text = indicator.querySelector('.health-text');
    const start = performance.now();

    try {
        const result = await api('GET', '/health');
        const ms = Math.round(performance.now() - start);

        dot.className = 'health-dot health-ok';
        text.textContent = `${ms}ms`;
        indicator.title = `${result.service || 'elementStore'} v${result.version || '?'} — ${ms}ms`;
        indicator.dataset.status = 'ok';
        indicator.dataset.version = result.version || '';
        indicator.dataset.responseTime = ms;
    } catch (e) {
        dot.className = 'health-dot health-fail';
        text.textContent = 'Offline';
        indicator.title = 'Disconnected: ' + e.message;
        indicator.dataset.status = 'fail';
    }
}

function startHealthPolling(intervalMs) {
    checkHealth();
    _healthInterval = setInterval(checkHealth, intervalMs || 30000);
}

function stopHealthPolling() {
    if (_healthInterval) { clearInterval(_healthInterval); _healthInterval = null; }
}

function showHealthDetails() {
    const indicator = document.getElementById('healthIndicator');
    if (!indicator) return;

    const status = indicator.dataset.status || 'unknown';
    const version = indicator.dataset.version || '?';
    const rt = indicator.dataset.responseTime || '?';

    const isOk = status === 'ok';
    const msg = isOk
        ? `Status: Connected\nVersion: ${version}\nResponse time: ${rt}ms`
        : `Status: Disconnected\nCheck server logs for errors.`;

    alert(msg);
}

// =====================================================================
// AGENT STATUS INDICATORS
// =====================================================================

let _agentStatusInterval = null;

/**
 * Classify agent activity based on last_run timestamp and is_active flag.
 *  running  — is currently executing (last_run within 5 min AND run_count actively incrementing — best-effort via last_run freshness)
 *  recent   — ran within 60 minutes
 *  idle     — active flag true but last_run > 60 min ago
 *  inactive — is_active false
 */
function _agentStatusClass(agent) {
    if (!agent.is_active) return 'agent-inactive';
    if (!agent.last_run) return 'agent-idle';
    const ageMs = Date.now() - new Date(agent.last_run).getTime();
    const ageMins = ageMs / 60000;
    if (ageMins < 5) return 'agent-running';
    if (ageMins < 60) return 'agent-recent';
    return 'agent-idle';
}

function _agentStatusLabel(cls) {
    return { 'agent-running': 'Running', 'agent-recent': 'Recent', 'agent-idle': 'Idle', 'agent-inactive': 'Inactive' }[cls] || '?';
}

async function checkAgentStatus() {
    const bar = document.getElementById('agentStatusBar');
    const dotsEl = document.getElementById('agentDots');
    if (!bar || !dotsEl) return;

    try {
        const agents = await api('GET', '/store/ai:agent');
        if (!Array.isArray(agents) || agents.length === 0) {
            bar.style.display = 'none';
            return;
        }

        // Sort by execution_order then name
        agents.sort((a, b) => (a.execution_order || 99) - (b.execution_order || 99));

        const dots = agents.map(agent => {
            const cls = _agentStatusClass(agent);
            const lastRun = agent.last_run ? new Date(agent.last_run).toLocaleTimeString() : 'never';
            const tip = `${agent.name} — ${_agentStatusLabel(cls)}\nLast run: ${lastRun}\nRuns: ${agent.run_count || 0}`;
            return `<span class="agent-dot ${cls}" title="${esc(tip)}" onclick="openAgentDialog('${esc(agent.id)}')"></span>`;
        }).join('');

        dotsEl.innerHTML = dots;
        bar.style.display = 'inline-flex';
    } catch (_) {
        bar.style.display = 'none';
    }
}

function startAgentStatusPolling(intervalMs) {
    checkAgentStatus();
    _agentStatusInterval = setInterval(checkAgentStatus, intervalMs || 30000);
}

function stopAgentStatusPolling() {
    if (_agentStatusInterval) { clearInterval(_agentStatusInterval); _agentStatusInterval = null; }
}

/**
 * Navigate to ai:agent class objects in the admin, highlighting the clicked agent.
 * Uses classListOpenObjects to open the object list for the ai:agent class.
 */
function openAgentDialog(agentId) {
    if (typeof classListOpenObjects === 'function') {
        classListOpenObjects('ai:agent');
    }
}
