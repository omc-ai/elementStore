// ═══════════════════════════════════════════════════════════════════════════
// UI ELEMENT — DOM-bound AtomObj for visual elements
// ═══════════════════════════════════════════════════════════════════════════
//
// Loaded AFTER element-store.js.
// Provides AtomElement: an AtomObj subclass with a two-way DOM link.
//
// Usage:
//   var obj = store.setObject({id: 'btn-1', class_id: 'ui-button', ...});
//   // obj is automatically an AtomElement (factory resolves via extends_id)
//   obj.el            → DOM element (null until bound)
//   obj.el._atom      → back-reference to this AtomElement
//   obj.bind(el)      → link DOM ↔ model
//   obj.syncToDom()   → push data.x/y/width/height → el.style
//   obj.destroy()     → remove DOM, clear links
//
// ═══════════════════════════════════════════════════════════════════════════


class AtomElement extends AtomObj {
    static CLASS_ID = 'ui-element';

    /** @type {HTMLElement|null} */
    el = null;

    /**
     * Bind this atom to a DOM element (two-way link).
     * @param {HTMLElement} el
     */
    bind(el) {
        this.el = el;
        el._atom = this;
    }

    /**
     * Push x, y, width, height from data to DOM style.
     */
    syncToDom() {
        if (!this.el) return;
        var s = this.el.style;
        s.left = this.data.x + 'px';
        s.top = this.data.y + 'px';
        s.width = this.data.width + 'px';
        s.height = this.data.height + 'px';
    }

    /**
     * Remove DOM element and clear links.
     */
    destroy() {
        if (this.el) {
            if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
            this.el._atom = null;
            this.el = null;
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════════════════════════

registerClass('ui-element', AtomElement);


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
    module.exports.AtomElement = AtomElement;
}

if (typeof window !== 'undefined') {
    window.AtomElement = AtomElement;
}
