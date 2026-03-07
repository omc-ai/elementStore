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
