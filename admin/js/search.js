// =====================================================================
// SEARCH - Global cross-class ID lookup
// =====================================================================

let _searchTimeout = null;

function initGlobalSearch() {
    const input = document.getElementById('globalSearchInput');
    if (!input) return;

    input.addEventListener('input', function () {
        clearTimeout(_searchTimeout);
        const q = this.value.trim();
        if (q.length < 2) { hideSearchResults(); return; }
        _searchTimeout = setTimeout(() => globalSearch(q), 300);
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { this.value = ''; hideSearchResults(); }
    });

    // Close results on outside click
    document.addEventListener('click', function (e) {
        if (!e.target.closest('#globalSearchWrap')) hideSearchResults();
    });
}

async function globalSearch(query) {
    const results = document.getElementById('searchResults');
    if (!results) return;

    results.innerHTML = '<div style="padding:8px;font-size:12px;color:#9ca3af">Searching...</div>';
    results.classList.add('open');

    try {
        // Try exact ID lookup first
        const obj = await api('GET', `/find/${encodeURIComponent(query)}`);
        if (obj && obj.id) {
            const classId = obj.class_id || '?';
            const name = obj.name || obj.id;
            results.innerHTML = `<div class="search-result" onclick="openSearchResult('${esc(classId)}', '${esc(obj.id)}')">
                <span class="search-class-badge">${esc(classId)}</span>
                <span class="search-id">${esc(obj.id)}</span>
                <span class="search-name">${esc(name)}</span>
            </div>`;
        } else {
            results.innerHTML = '<div style="padding:8px;font-size:12px;color:#9ca3af">No results</div>';
        }
    } catch (e) {
        // No exact match — try query across known classes
        try {
            const classes = allClassesList.length > 0 ? allClassesList : await api('GET', '/class');
            let found = [];
            // Search first 10 user classes for partial ID match
            const searchClasses = classes.filter(c => !c.id.startsWith('@')).slice(0, 10);
            for (const cls of searchClasses) {
                try {
                    const objects = await api('GET', `/store/${cls.id}`);
                    const matches = objects.filter(o =>
                        (o.id && o.id.toLowerCase().includes(query.toLowerCase())) ||
                        (o.name && o.name.toLowerCase().includes(query.toLowerCase()))
                    );
                    for (const m of matches.slice(0, 3)) {
                        found.push({ classId: cls.id, obj: m });
                    }
                } catch (_) {}
                if (found.length >= 10) break;
            }

            if (found.length === 0) {
                results.innerHTML = '<div style="padding:8px;font-size:12px;color:#9ca3af">No results</div>';
            } else {
                results.innerHTML = found.map(f => `<div class="search-result" onclick="openSearchResult('${esc(f.classId)}', '${esc(f.obj.id)}')">
                    <span class="search-class-badge">${esc(f.classId)}</span>
                    <span class="search-id">${esc(f.obj.id)}</span>
                    <span class="search-name">${esc(f.obj.name || '')}</span>
                </div>`).join('');
            }
        } catch (_) {
            results.innerHTML = '<div style="padding:8px;font-size:12px;color:#9ca3af">No results</div>';
        }
    }
}

function hideSearchResults() {
    const results = document.getElementById('searchResults');
    if (results) results.classList.remove('open');
}

async function openSearchResult(classId, objectId) {
    hideSearchResults();
    document.getElementById('globalSearchInput').value = '';
    try {
        const obj = await api('GET', `/store/${classId}/${objectId}`);
        if (obj) renderModalForClass(classId, obj);
    } catch (e) {
        showToast('Failed to open object: ' + e.message, 'error');
    }
}
