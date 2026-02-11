// =====================================================================
// ACTIONS - Export, history, reset database
// =====================================================================

async function exportData() {
    try {
        showToast('Exporting data...', 'success');
        const result = await api('POST', '/export');

        if (result.is_new) {
            showToast(`Export created: ${result.hash}`, 'success');
        } else {
            showToast(`Data unchanged. Using existing export: ${result.hash}`, 'success');
        }

        window.open(API_BASE + result.url, '_blank');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function showExportHistory() {
    document.getElementById('historyModal').classList.add('active');
    document.getElementById('historyBody').innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';

    try {
        const exports = await api('GET', '/exports');

        if (exports.length === 0) {
            document.getElementById('historyBody').innerHTML = `
                <div class="export-empty">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    <h3>No exports yet</h3>
                    <p>Click "Export" to create your first backup</p>
                </div>
            `;
            return;
        }

        let html = '<ul class="export-list">';
        for (const exp of exports) {
            const date = exp.exported_at ? new Date(exp.exported_at).toLocaleString() : 'Unknown';
            const size = formatBytes(exp.size);
            html += `
                <li class="export-item">
                    <span class="export-hash">${exp.hash}</span>
                    <div class="export-info">
                        <div class="export-date">${date}</div>
                        <div class="export-stats">${exp.stats.classes} classes, ${exp.stats.total_objects} objects</div>
                    </div>
                    <span class="export-size">${size}</span>
                    <div class="export-actions">
                        <a href="${API_BASE}${exp.url}" class="btn btn-primary btn-xs" download>Download</a>
                        <button class="btn btn-ghost btn-xs" onclick="copyExportLink('${exp.hash}')">Copy Link</button>
                        <button class="btn btn-danger btn-xs" onclick="deleteExport('${exp.hash}')">Delete</button>
                    </div>
                </li>
            `;
        }
        html += '</ul>';
        document.getElementById('historyBody').innerHTML = html;
    } catch (err) {
        document.getElementById('historyBody').innerHTML = `<div class="export-empty"><p style="color:#ef4444">${err.message}</p></div>`;
    }
}

function closeHistoryModal() {
    document.getElementById('historyModal').classList.remove('active');
}

function copyExportLink(hash) {
    const url = window.location.origin + API_BASE + '/export/' + hash;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Link copied to clipboard', 'success');
    }).catch(() => {
        prompt('Copy this link:', url);
    });
}

async function deleteExport(hash) {
    if (!confirm(`Delete export ${hash}?`)) return;
    try {
        await api('DELETE', `/export/${hash}`);
        showToast('Export deleted', 'success');
        showExportHistory();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function resetDatabase() {
    if (!confirm('\u26a0\ufe0f RESET DATABASE?\n\nThis will delete ALL user data and reload seed data.\n\nThis action cannot be undone!')) return;
    if (!confirm('Are you REALLY sure? Type "RESET" in the next prompt to confirm.')) return;

    const confirmation = prompt('Type RESET to confirm:');
    if (confirmation !== 'RESET') {
        showToast('Reset cancelled', 'error');
        return;
    }

    try {
        showToast('Resetting database...', 'success');
        const result = await api('POST', '/reset');
        showToast(`Database reset. Cleared: ${result.classes.join(', ')}`, 'success');

        // Refresh the classes tab
        const classesTab = tabManager?.tabs?.get('classes');
        if (classesTab?.controller?.load) {
            classesTab.controller.load();
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}
