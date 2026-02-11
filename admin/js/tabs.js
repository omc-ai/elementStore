// =====================================================================
// TABS - TabManager class for multi-tab interface
// =====================================================================

class TabManager {
    constructor(barEl, contentEl) {
        this.barEl = barEl;
        this.contentEl = contentEl;
        this.tabs = new Map(); // id -> { id, title, closable, el, contentEl, controller }
        this.activeId = null;
    }

    /**
     * Add a new tab (or switch to existing)
     * @param {string} id - Unique tab ID
     * @param {string} title - Tab display title
     * @param {boolean} closable - Whether tab has close button
     * @param {Function} ControllerClass - Panel controller class (ClassListPanel, ObjectListPanel)
     * @param {...any} args - Extra arguments passed to controller constructor
     * @returns {object} The tab object
     */
    add(id, title, closable, ControllerClass, ...args) {
        // If tab already exists, just switch to it
        if (this.tabs.has(id)) {
            this.switchTo(id);
            return this.tabs.get(id);
        }

        // Create tab button
        const tabEl = document.createElement('button');
        tabEl.className = 'tab-item';
        tabEl.dataset.tabId = id;
        tabEl.innerHTML = esc(title) +
            (closable ? ' <span class="tab-close" title="Close tab">&times;</span>' : '');

        tabEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-close')) {
                this.close(id);
            } else {
                this.switchTo(id);
            }
        });

        this.barEl.appendChild(tabEl);

        // Create content pane
        const paneEl = document.createElement('div');
        paneEl.className = 'tab-pane';
        paneEl.dataset.tabId = id;
        this.contentEl.appendChild(paneEl);

        // Instantiate controller
        const controller = new ControllerClass(paneEl, ...args);

        const tab = { id, title, closable, el: tabEl, contentEl: paneEl, controller };
        this.tabs.set(id, tab);

        // Switch to the new tab
        this.switchTo(id);

        // Load data
        if (controller.load) {
            controller.load();
        }

        return tab;
    }

    /**
     * Switch to a tab by ID
     */
    switchTo(id) {
        if (!this.tabs.has(id)) return;

        // Deactivate all
        this.tabs.forEach(tab => {
            tab.el.classList.remove('active');
            tab.contentEl.classList.remove('active');
        });

        // Activate selected
        const tab = this.tabs.get(id);
        tab.el.classList.add('active');
        tab.contentEl.classList.add('active');
        this.activeId = id;
    }

    /**
     * Close a tab by ID
     */
    close(id) {
        const tab = this.tabs.get(id);
        if (!tab || !tab.closable) return;

        // Destroy controller
        if (tab.controller && tab.controller.destroy) {
            tab.controller.destroy();
        }

        // Remove DOM elements
        tab.el.remove();
        tab.contentEl.remove();
        this.tabs.delete(id);

        // Switch to previous tab if this was active
        if (this.activeId === id) {
            const remaining = Array.from(this.tabs.keys());
            if (remaining.length > 0) {
                this.switchTo(remaining[remaining.length - 1]);
            } else {
                this.activeId = null;
            }
        }
    }

    /**
     * Find a tab matching a predicate
     * @param {Function} predicate - (tab) => boolean
     * @returns {object|undefined}
     */
    find(predicate) {
        for (const tab of this.tabs.values()) {
            if (predicate(tab)) return tab;
        }
        return undefined;
    }

    /**
     * Get the active tab
     */
    getActive() {
        return this.tabs.get(this.activeId);
    }
}
