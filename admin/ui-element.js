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
// UI SEED DATA
// ═══════════════════════════════════════════════════════════════════════════

var uiSeedData = {
    // ui-element (base)
    'ui-element':        {id: 'ui-element',        class_id: '@class', name: 'UI Element'},
    'ui-element.x':      {id: 'ui-element.x',      class_id: '@prop', key: 'x',      data_type: 'float', default_value: 0},
    'ui-element.y':      {id: 'ui-element.y',      class_id: '@prop', key: 'y',      data_type: 'float', default_value: 0},
    'ui-element.width':  {id: 'ui-element.width',  class_id: '@prop', key: 'width',  data_type: 'float', default_value: 100},
    'ui-element.height': {id: 'ui-element.height', class_id: '@prop', key: 'height', data_type: 'float', default_value: 40},
    'ui-element.label':  {id: 'ui-element.label',  class_id: '@prop', key: 'label',  data_type: 'string', default_value: ''},

    // ui-dialog (extends ui-element)
    'ui-dialog':          {id: 'ui-dialog',          class_id: '@class', name: 'Dialog', extends_id: 'ui-element'},
    'ui-dialog.title':    {id: 'ui-dialog.title',    class_id: '@prop', key: 'title',    data_type: 'string', default_value: 'Dialog'},
    'ui-dialog.children': {id: 'ui-dialog.children', class_id: '@prop', key: 'children', data_type: 'relation', is_array: true, object_class_id: 'ui-element'},

    // ui-button (extends ui-element)
    'ui-button':      {id: 'ui-button',      class_id: '@class', name: 'Button', extends_id: 'ui-element'},
    'ui-button.text': {id: 'ui-button.text', class_id: '@prop', key: 'text', data_type: 'string', default_value: 'Click me'},

    // ui-workspace
    'ui-workspace':          {id: 'ui-workspace',          class_id: '@class', name: 'Workspace'},
    'ui-workspace.name':     {id: 'ui-workspace.name',     class_id: '@prop', key: 'name',     data_type: 'string', default_value: 'Workspace'},
    'ui-workspace.children': {id: 'ui-workspace.children', class_id: '@prop', key: 'children', data_type: 'relation', is_array: true, object_class_id: 'ui-element'},
};

if (typeof window !== 'undefined' && typeof store !== 'undefined') {
    store.seed(uiSeedData);
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
    module.exports.AtomElement = AtomElement;
    module.exports.uiSeedData = uiSeedData;
}

if (typeof window !== 'undefined') {
    window.AtomElement = AtomElement;
    window.uiSeedData = uiSeedData;
}
