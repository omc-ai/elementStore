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
                    <span class="export-hash">${esc(exp.hash)}</span>
                    <div class="export-info">
                        <div class="export-date">${date}</div>
                        <div class="export-stats">${esc(String(exp.stats.classes))} classes, ${esc(String(exp.stats.total_objects))} objects</div>
                    </div>
                    <span class="export-size">${esc(size)}</span>
                    <div class="export-actions">
                        <a href="${API_BASE}${esc(exp.url)}" class="btn btn-primary btn-xs" download>Download</a>
                        <button class="btn btn-ghost btn-xs" onclick="copyExportLink('${escapeHtml(exp.hash)}')">Copy Link</button>
                        <button class="btn btn-danger btn-xs" onclick="deleteExport('${escapeHtml(exp.hash)}')">Delete</button>
                    </div>
                </li>
            `;
        }
        html += '</ul>';
        document.getElementById('historyBody').innerHTML = html;
    } catch (err) {
        document.getElementById('historyBody').innerHTML = `<div class="export-empty"><p style="color:#ef4444">${esc(err.message)}</p></div>`;
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

// =====================================================================
// GENESIS OPERATIONS
// =====================================================================

async function reloadGenesis() {
    if (!confirm('Reload all genesis/seed data from .es/ directory?\n\nExisting objects will be skipped unless they changed.')) return;

    try {
        showToast('Reloading genesis data...', 'success');
        const result = await api('POST', '/genesis/reload');
        if (result.success) {
            const stats = result.stats || result;
            showToast(`Genesis reloaded. ${stats.created || 0} created, ${stats.updated || 0} updated, ${stats.skipped || 0} skipped`, 'success');
            // Refresh classes
            const classesTab = tabManager?.tabs?.get('classes');
            if (classesTab?.controller?.load) classesTab.controller.load();
        } else {
            showToast('Genesis reload failed: ' + (result.error || 'Unknown error'), 'error');
        }
    } catch (err) {
        showToast('Genesis reload failed: ' + err.message, 'error');
    }
}

async function verifyGenesis() {
    try {
        showToast('Verifying genesis data...', 'success');
        const result = await api('GET', '/genesis');
        if (result.valid) {
            showToast('Genesis verification passed', 'success');
        } else {
            showToast('Genesis verification failed — check console', 'error');
            console.warn('Genesis verification result:', result);
        }
    } catch (err) {
        showToast('Genesis verification failed: ' + err.message, 'error');
    }
}

async function showGenesisFiles() {
    try {
        const files = await api('GET', '/genesis/files');
        if (!files || files.length === 0) {
            showToast('No genesis files found in .es/ directory', 'error');
            return;
        }

        let html = '<div style="padding:4px"><table style="width:100%;border-collapse:collapse;font-size:13px">';
        html += '<thead><tr style="background:#f3f4f6"><th style="padding:8px;text-align:left">File</th><th style="padding:8px;text-align:left">Type</th><th style="padding:8px;text-align:right">Classes</th><th style="padding:8px;text-align:right">Objects</th></tr></thead><tbody>';
        for (const f of files) {
            const name = f.filename || f.file || f.name || '?';
            const type = name.includes('.genesis.') ? 'genesis' : (name.includes('.seed.') ? 'seed' : 'data');
            const classes = f.classes || f.class_count || 0;
            const objects = f.objects || f.object_count || 0;
            html += `<tr style="border-bottom:1px solid #e5e7eb">
                <td style="padding:6px 8px;font-family:Monaco,Menlo,monospace;font-size:12px">${esc(name)}</td>
                <td style="padding:6px 8px"><span class="ca-type-badge" style="background:${type === 'genesis' ? '#3b82f6' : '#10b981'}">${type}</span></td>
                <td style="padding:6px 8px;text-align:right">${classes}</td>
                <td style="padding:6px 8px;text-align:right">${objects}</td>
            </tr>`;
        }
        html += '</tbody></table></div>';

        // Show in history modal (reuse it)
        document.getElementById('historyModal').classList.add('active');
        document.getElementById('historyBody').innerHTML = html;
        // Update title
        const titleEl = document.querySelector('#historyModalContent .modal-header h3');
        if (titleEl) titleEl.textContent = 'Genesis Files';
    } catch (err) {
        showToast('Failed to load genesis files: ' + err.message, 'error');
    }
}

// =====================================================================
// RESET DATABASE
// =====================================================================

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
