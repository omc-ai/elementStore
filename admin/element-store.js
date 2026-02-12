// ═══════════════════════════════════════════════════════════════════════════
// ELEMENT STORE
// ═══════════════════════════════════════════════════════════════════════════
//
// CODING STANDARD:
// - Use function() {} instead of arrow functions =>
// - Pass 'this' as second argument to forEach when needed
// - Use old-fashioned function declarations
// - Class fields for defaults (not saved unless explicitly set)
//
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════════════════

const seedData = {
    '@class': {id: '@class', class_id: '@class'},
    '@prop':  {id: '@prop',  class_id: '@class'},
    '@storage': {id: '@storage', class_id: '@class'},

    // @class props (prop id = owning_class + '.' + key)
    '@class.name':       {id: '@class.name',       class_id: '@prop', key: 'name'},
    '@class.extends_id': {id: '@class.extends_id', class_id: '@prop', key: 'extends_id', data_type: 'string', object_class_id: '@class', create_only: true},
    '@class.props': {
        id: '@class.props',
        class_id: '@prop',
        key: 'props',
        data_type: 'object',
        is_array: true,
        object_class_id: '@prop',
    },

    // @prop props
    '@prop.id':                  {id: '@prop.id',                  class_id: '@prop', key: 'id'},
    '@prop.key':                 {id: '@prop.key',                 class_id: '@prop', key: 'key', required: true},
    '@prop.name':                {id: '@prop.name',                class_id: '@prop', key: 'name'},
    '@prop.description':         {id: '@prop.description',         class_id: '@prop', key: 'description'},
    '@prop.data_type':           {id: '@prop.data_type',           class_id: '@prop', key: 'data_type'},
    '@prop.is_array':            {id: '@prop.is_array',            class_id: '@prop', key: 'is_array', data_type: 'boolean'},
    '@prop.object_class_id':     {id: '@prop.object_class_id',     class_id: '@prop', key: 'object_class_id', data_type: 'relation', object_class_id: '@class'},
    '@prop.object_class_strict': {id: '@prop.object_class_strict', class_id: '@prop', key: 'object_class_strict', data_type: 'boolean'},
    '@prop.on_orphan':           {id: '@prop.on_orphan',           class_id: '@prop', key: 'on_orphan'},
    '@prop.options':             {id: '@prop.options',             class_id: '@prop', key: 'options', data_type: 'object', is_array: true},
    '@prop.editor':              {id: '@prop.editor',              class_id: '@prop', key: 'editor', data_type: 'object'},
    '@prop.validators':          {id: '@prop.validators',          class_id: '@prop', key: 'validators', data_type: 'object', is_array: true},
    '@prop.required':            {id: '@prop.required',            class_id: '@prop', key: 'required', data_type: 'boolean'},
    '@prop.readonly':            {id: '@prop.readonly',            class_id: '@prop', key: 'readonly', data_type: 'boolean'},
    '@prop.default_value':       {id: '@prop.default_value',       class_id: '@prop', key: 'default_value'},
    '@prop.display_order':       {id: '@prop.display_order',       class_id: '@prop', key: 'display_order', data_type: 'integer'},
    '@prop.group_name':          {id: '@prop.group_name',          class_id: '@prop', key: 'group_name'},
    '@prop.hidden':              {id: '@prop.hidden',              class_id: '@prop', key: 'hidden', data_type: 'boolean'},
    '@prop.server_only':         {id: '@prop.server_only',         class_id: '@prop', key: 'server_only', data_type: 'boolean'},

    // @storage props
    '@storage.url':  {id: '@storage.url',  class_id: '@prop', key: 'url'},
    '@storage.type': {id: '@storage.type', class_id: '@prop', key: 'type'},
};


// ═══════════════════════════════════════════════════════════════════════════
// LOCAL ID GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

var _localIdCounter = 0;
function generateLocalId() {
    return '_' + (++_localIdCounter) + '_' + Math.random().toString(36).substr(2, 6);
}


// ═══════════════════════════════════════════════════════════════════════════
// JWT TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

var _jwtToken = null;

/**
 * Set the JWT token for API authentication.
 * @param {string|null} token - JWT Bearer token, or null to clear
 */
function setJwtToken(token) {
    _jwtToken = token;
}

/**
 * Get the current JWT token.
 * @returns {string|null}
 */
function getJwtToken() {
    return _jwtToken;
}


// ═══════════════════════════════════════════════════════════════════════════
// CLASS REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

const classRegistry = {};

function registerClass(classId, constructor) {
    classRegistry[classId] = constructor;
}

// ═══════════════════════════════════════════════════════════════════════════
// ATOM COLLECTION
// ═══════════════════════════════════════════════════════════════════════════

class AtomCollection {

    /**
     * @param {Array} items - Raw array reference (from parent data)
     * @param {ElementStore} store
     * @param {string} [classId] - Class of items (e.g. '@prop')
     */
    constructor(items, store, classId) {
        this._items = items;    // same reference as parent data
        this._store = store;
        this._classId = classId || null;
    }

    get length() {
        return this._items.length;
    }

    /** Find item by key field */
    get(key) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].key === key) {
                return this._wrap(i);
            }
        }
        return null;
    }

    /** Find item by id field */
    getById(id) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].id === id) {
                return this._wrap(i);
            }
        }
        return null;
    }

    /** Filter items by object filter */
    find(filter) {
        var results = [];
        var self = this;
        this._items.forEach(function (item, i) {
            var match = true;
            Object.keys(filter).forEach(function (k) {
                if (item[k] !== filter[k]) match = false;
            });
            if (match) results.push(self._wrap(i));
        });
        return results;
    }

    /** Iterate items as AtomObj */
    forEach(fn) {
        var self = this;
        this._items.forEach(function (item, i) {
            fn(self._wrap(i), i);
        });
    }

    /** Map items as AtomObj */
    map(fn) {
        var self = this;
        var results = [];
        this._items.forEach(function (item, i) {
            results.push(fn(self._wrap(i), i));
        });
        return results;
    }

    /** Add item to collection (accepts raw object or AtomObj) */
    add(obj) {
        if (!(obj instanceof AtomObj) && this._store) {
            if (this._classId && !obj.class_id) {
                obj.class_id = this._classId;
            }
            obj = new AtomObj(obj, this._store);
        }
        this._items.push(obj);
        return obj;
    }

    /** Remove item by key */
    remove(key) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].key === key) {
                this._items.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    /** Remove item by id */
    removeById(id) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].id === id) {
                this._items.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    /**
     * Move an item to a new index position within the collection.
     * Splices from old position, inserts at new. Marks parent dirty.
     * @param {AtomObj|Object} item - The item to move (matched by reference or id)
     * @param {number} newIndex - Target index (0-based)
     * @returns {boolean} true if moved successfully
     */
    setItemIndex(item, newIndex) {
        var oldIndex = -1;
        var itemId = item.id || item._id;
        for (var i = 0; i < this._items.length; i++) {
            var cur = this._items[i];
            if (cur === item || (itemId && (cur.id === itemId || cur._id === itemId))) {
                oldIndex = i;
                break;
            }
        }
        if (oldIndex === -1 || oldIndex === newIndex) return false;

        // Clamp newIndex
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= this._items.length) newIndex = this._items.length - 1;

        // Splice out and insert at new position
        var removed = this._items.splice(oldIndex, 1)[0];
        this._items.splice(newIndex, 0, removed);

        // Mark the item as order-changed for dirty tracking
        if (removed && removed._orderChanged !== undefined) {
            removed._orderChanged = true;
        }
        return true;
    }

    /**
     * Save all dirty children, then trigger parent sync + save.
     * Convenience method for batch-saving collection changes.
     */
    save() {
        if (!this._store) throw new Error('AtomCollection.save: no store');
        // Save dirty items
        for (var i = 0; i < this._items.length; i++) {
            var item = this._items[i];
            if (item && typeof item.hasChanges === 'function' && item.hasChanges()) {
                item.save();
            }
        }
    }

    /** Return raw array for serialization */
    toJSON() {
        return this._items;
    }

    /** Wrap raw item at index as AtomObj (factory resolves constructor) */
    _wrap(index) {
        var item = this._items[index];
        if (this._classId && !item.class_id) {
            item.class_id = this._classId;
        }
        return new AtomObj(item, this._store);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ATOM OBJ
// ═══════════════════════════════════════════════════════════════════════════

class AtomObj {
    static CLASS_ID = '@atom';

    /** @type {ElementStore} */
    store = null;
    /** @type {string} */
    class_id = null;
    /** @type {string} */
    id = null;
    /** @type {Object.<string, *>} */
    data = {};
    /** @type {Object.<string, AtomObj|AtomObj[]>} related objects keyed by property name */
    objects = {};
    /** @type {AtomClass|null} class definition */
    _class = null;
    /** @type {Object|null} */
    _snapshot = null;
    /** @type {string} client-local identity, never sent to server */
    _id = null;
    /** @type {AtomObj[]} all related AtomObj instances */
    _related = [];
    /** @type {AtomObj[]} subset of _related needing save */
    _dirtyRelated = [];
    /** @type {AtomObj[]} parent objects that own this object */
    _belongsTo = [];
    /** @type {Function[]} onChange callbacks: fn({obj, prop, value, oldValue}) */
    _onChange = [];

    /**
     * @param {Object|string} raw - Raw data object, or class_id string (new object)
     * @param {ElementStore} [store] - The ElementStore this object belongs to
     */
    constructor(raw, store) {
        // ── Factory: resolve correct subclass via extends_id chain ──
        if (new.target === AtomObj && store) {
            var cid = (typeof raw === 'string') ? raw : (raw && raw.class_id);
            if (cid) {
                var Ctor = store.resolveConstructor(cid);
                if (Ctor && Ctor !== AtomObj) {
                    return new Ctor(raw, store);
                }
            }
        }

        this.store = store || null;
        this.objects = {};
        this._id = generateLocalId();
        this._related = [];
        this._dirtyRelated = [];
        this._belongsTo = [];
        this._onChange = [];

        // String → new object of that class
        if (typeof raw === 'string') {
            raw = {class_id: raw};
        }

        // Must be object with class_id
        if (!raw || typeof raw !== 'object' || !raw.class_id) {
            throw new Error('AtomObj: class_id is required');
        }

        // Use raw as data by reference
        this.data = raw;

        // Load class definition from store (null during seed bootstrap)
        this._class = this.store ? (this.store.getObject(raw.class_id) || null) : null;

        var proxy = new Proxy(this, {
            get: function (target, prop, receiver) {
                // internal fields — bypass data
                if (prop === 'store' || prop === 'data' || prop === 'objects' || prop === '_class' || prop === '_snapshot' || prop === '_id' || prop === '_related' || prop === '_dirtyRelated' || prop === '_belongsTo' || prop === '_onChange' || prop === 'el') return target[prop];
                // methods — bind to proxy so 'this' resolves through proxy
                if (typeof target[prop] === 'function') return target[prop].bind(receiver);
                // data fields — delegate to propDef if available
                if (prop in target.data) {
                    if (target._class && target.store && prop !== 'id' && prop !== 'class_id') {
                        var propDef = target.store.findPropDef(target.data.class_id, prop);
                        if (propDef && typeof propDef.getPropValue === 'function') {
                            return propDef.getPropValue(target, prop);
                        }
                    }
                    return target.data[prop];
                }
                // class field defaults
                return target[prop];
            },
            set: function (target, prop, val) {
                // internal fields — bypass data
                if (prop === 'store' || prop === 'data' || prop === 'objects' || prop === '_class' || prop === '_snapshot' || prop === '_id' || prop === '_related' || prop === '_dirtyRelated' || prop === '_belongsTo' || prop === '_onChange' || prop === 'el') {
                    target[prop] = val;
                    return true;
                }
                // delegate to propDef for type validation/coercion
                if (target._class && target.store && prop !== 'id' && prop !== 'class_id') {
                    var classId = target.data.class_id;
                    if (classId) {
                        var propDef = target.store.findPropDef(classId, prop);
                        if (propDef && typeof propDef.setPropValue === 'function') {
                            return propDef.setPropValue(target, prop, val);
                        }
                        // warn if class has props but this one is unknown
                        if (target.store.collectClassProps(classId).length > 0) {
                            console.warn('AtomObj: unknown prop "' + prop + '" for class ' + classId);
                        }
                    }
                }
                // Notify parents this object is dirty
                if (target._belongsTo && target._belongsTo.length > 0) {
                    var self = target;
                    target._belongsTo.forEach(function(parent) {
                        if (parent._dirtyRelated.indexOf(self) === -1) {
                            parent._dirtyRelated.push(self);
                        }
                    });
                }
                var oldVal = target.data[prop];
                target.data[prop] = val;
                // Fire onChange callbacks
                if (target._onChange && target._onChange.length > 0) {
                    var info = {obj: target, prop: prop, value: val, oldValue: oldVal};
                    target._onChange.forEach(function(fn) { fn(info); });
                }
                return true;
            }
        });

        // Existing object (has id) → take snapshot for change tracking
        // New object (no id) → apply defaults from class definition
        if (this.data.id) {
            this._snapshot = JSON.parse(JSON.stringify(this.data));
        } else {
            this._applyDefaults();
            this._snapshot = null;
        }

        return proxy;
    }

    /** Get prop definitions for this object's class (includes inherited) */
    getProps() {
        if (!this.store) return [];
        return this.store.collectClassProps(this.class_id);
    }

    /** Get a specific prop definition by key (walks inheritance) */
    getPropDef(key) {
        if (!this.store) return null;
        return this.store.findPropDef(this.class_id, key);
    }

    /** Apply default values from class prop definitions (includes inherited) */
    _applyDefaults() {
        if (!this.store) return;
        var classId = this.data.class_id;
        if (!classId) return;
        var data = this.data;
        var props = this.store.collectClassProps(classId);
        props.forEach(function(propObj) {
            // Extract key from prop id (e.g. 'ui-element.x' → 'x')
            var dotIdx = propObj.id.lastIndexOf('.');
            var key = dotIdx >= 0 ? propObj.id.substring(dotIdx + 1) : propObj.id;
            if (data[key] === undefined) {
                var def = propObj.default_value;
                if (def !== undefined && def !== null) {
                    data[key] = def;
                }
            }
        });
    }

    /** Check if data changed since load */
    hasChanges() {
        if (!this._snapshot) return true; // new object
        return JSON.stringify(this.data) !== JSON.stringify(this._snapshot);
    }

    /** Get changed fields (diff vs snapshot) */
    getChanges() {
        if (!this._snapshot) return Object.assign({}, this.data); // new: all fields
        var changes = {};
        var data = this.data;
        var snap = this._snapshot;
        Object.keys(data).forEach(function (k) {
            if (JSON.stringify(data[k]) !== JSON.stringify(snap[k])) {
                changes[k] = data[k];
            }
        });
        Object.keys(snap).forEach(function (k) {
            if (!(k in data)) {
                changes[k] = null; // deleted field
            }
        });
        return changes;
    }

    /** Save to store — recursive, children-first (updates snapshot) */
    save() {
        if (!this.store) throw new Error('save: no store assigned');

        // 1. Save dirty related objects first (children before parent)
        var dirtyList = this._dirtyRelated.slice();
        for (var i = 0; i < dirtyList.length; i++) {
            dirtyList[i].save();
        }
        this._dirtyRelated = [];

        // 2. Rebuild raw ID arrays for relation properties from _related objects
        this._syncRelationIds();

        // 3. Save self
        this.store.setObject(this);
        this._snapshot = JSON.parse(JSON.stringify(this.data));
    }

    /** Walk relation props, rebuild raw ID arrays/values from actual objects */
    _syncRelationIds() {
        if (!this.store || !this._class) return;
        var data = this.data;
        var objects = this.objects;
        var props = this.store.collectClassProps(this.data.class_id);
        props.forEach(function(propObj) {
            if (propObj.data_type !== 'relation') return;
            var dotIdx = propObj.id.lastIndexOf('.');
            var key = dotIdx >= 0 ? propObj.id.substring(dotIdx + 1) : propObj.id;
            var relObjs = objects[key];
            if (!relObjs) return;
            if (propObj.is_array && Array.isArray(relObjs)) {
                data[key] = relObjs.map(function(o) { return o.id || o._id; });
            } else if (relObjs instanceof AtomObj) {
                data[key] = relObjs.id || relObjs._id;
            }
        });
    }

    /** Get related objects that have unsaved changes */
    getDirtyObjects() {
        var dirty = [];
        var objs = this.objects;
        Object.keys(objs).forEach(function (propName) {
            var val = objs[propName];
            if (Array.isArray(val)) {
                val.forEach(function (obj) {
                    if (obj && obj.hasChanges && obj.hasChanges()) dirty.push(obj);
                });
            } else if (val && val.hasChanges && val.hasChanges()) {
                dirty.push(val);
            }
        });
        return dirty;
    }

    /** Serialize to plain object */
    toJSON() {
        return this.data;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ATOM CLASS
// ═══════════════════════════════════════════════════════════════════════════

class AtomClass extends AtomObj {
    static CLASS_ID = '@class';

    class_id = '@class';

    // Returns all @prop objects for this class (including inherited via extends_id)
    getProps() {
        if (!this.store) return [];
        return this.store.collectClassProps(this.id);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ATOM PROP
// ═══════════════════════════════════════════════════════════════════════════

class AtomProp extends AtomObj {
    static CLASS_ID = '@prop';

    class_id = '@prop';
    key = null;
    name = null;
    description = null;
    data_type = null;
    is_array = false;
    object_class_id = null;
    object_class_strict = false;
    on_orphan = null;
    options = null;
    editor = null;
    validators = null;
    required = false;
    readonly = false;
    default_value = null;
    display_order = 0;
    group_name = null;
    hidden = false;
    server_only = false;

    /**
     * Get typed value from sender object
     * @param {AtomObj} senderObj - The object that holds the value
     * @param {string} propName - The property key
     * @returns {*} object | AtomCollection | AtomObj[] | AtomObj | string | boolean | number | function
     */
    getPropValue(senderObj, propName) {
        // Computed order_id: if item is in a parent's collection, return its index
        if (propName === 'order_id' && senderObj._belongsTo && senderObj._belongsTo.length > 0) {
            var parent = senderObj._belongsTo[0];
            if (parent && parent.objects) {
                var keys = Object.keys(parent.objects);
                for (var ki = 0; ki < keys.length; ki++) {
                    var arr = parent.objects[keys[ki]];
                    if (Array.isArray(arr)) {
                        var idx = arr.indexOf(senderObj);
                        if (idx === -1) {
                            // Try matching by id
                            for (var si = 0; si < arr.length; si++) {
                                if (arr[si].id === senderObj.id || arr[si]._id === senderObj._id) {
                                    idx = si;
                                    break;
                                }
                            }
                        }
                        if (idx >= 0) return idx;
                    }
                }
            }
        }

        var val = senderObj.data[propName];
        if (val === undefined || val === null) return val;

        var store = senderObj.store;

        switch (this.data_type) {
            case 'string':
                return String(val);
            case 'boolean':
                return !!val;
            case 'integer':
                return parseInt(val, 10) || 0;
            case 'float':
                return parseFloat(val) || 0;
            case 'object':
                if (this.is_array && Array.isArray(val)) {
                    return new AtomCollection(val, store, this.object_class_id);
                }
                if (typeof val === 'object' && this.object_class_id && store) {
                    if (!val.class_id) val.class_id = this.object_class_id;
                    return new AtomObj(val, store);
                }
                return val;
            case 'relation':
                if (!store) return val;
                if (this.is_array && Array.isArray(val)) {
                    // Build/update objects array from _related + store lookups
                    if (!senderObj.objects[propName]) {
                        var items = [];
                        val.forEach(function (refId) {
                            // First check _related, then store
                            var found = null;
                            for (var i = 0; i < senderObj._related.length; i++) {
                                var r = senderObj._related[i];
                                if (r.id === refId || r._id === refId) { found = r; break; }
                            }
                            if (!found && store) found = store.getObject(refId);
                            if (found) items.push(found);
                        });
                        senderObj.objects[propName] = items;
                    }
                    return new AtomCollection(senderObj.objects[propName], store, this.object_class_id);
                }
                // single relation → objects[propName] = AtomObj
                if (!senderObj.objects[propName]) {
                    // Check _related first
                    var found = null;
                    for (var i = 0; i < senderObj._related.length; i++) {
                        var r = senderObj._related[i];
                        if (r.id === val || r._id === val) { found = r; break; }
                    }
                    if (!found) found = store.getObject(val);
                    if (found) senderObj.objects[propName] = found;
                }
                return senderObj.objects[propName] || val;
            case 'function':
                if (typeof val === 'function') return val;
                if (typeof val === 'string') {
                    try { return new Function('return ' + val)(); } catch (e) { return val; }
                }
                return val;
            default:
                return val;
        }
    }

    /**
     * Set and validate value on sender object
     * @param {AtomObj} senderObj - The object to set value on
     * @param {string} propName - The property key
     * @param {*} value - The value to set
     * @returns {boolean} success
     */
    setPropValue(senderObj, propName, value) {
        // Type coercion/validation
        switch (this.data_type) {
            case 'boolean':
                value = !!value;
                break;
            case 'integer':
                value = parseInt(value, 10);
                if (isNaN(value)) {
                    console.warn('setPropValue: expected integer for "' + propName + '"');
                    return false;
                }
                break;
            case 'float':
                value = parseFloat(value);
                if (isNaN(value)) {
                    console.warn('setPropValue: expected float for "' + propName + '"');
                    return false;
                }
                break;
            case 'string':
                if (value !== null && value !== undefined) {
                    value = String(value);
                }
                break;
            case 'relation':
                // Accept AtomObj → store object in objects[propName], id in data
                if (value instanceof AtomObj) {
                    senderObj.objects[propName] = value;
                    // Register in _related and _belongsTo
                    if (senderObj._related.indexOf(value) === -1) {
                        senderObj._related.push(value);
                    }
                    if (value._belongsTo.indexOf(senderObj) === -1) {
                        value._belongsTo.push(senderObj);
                    }
                    if (value.hasChanges && value.hasChanges()) {
                        if (senderObj._dirtyRelated.indexOf(value) === -1) {
                            senderObj._dirtyRelated.push(value);
                        }
                    }
                    value = value.id || value._id;
                }
                if (this.is_array && Array.isArray(value)) {
                    var relObjs = [];
                    value = value.map(function (v) {
                        if (v instanceof AtomObj) {
                            relObjs.push(v);
                            // Register in _related and _belongsTo
                            if (senderObj._related.indexOf(v) === -1) {
                                senderObj._related.push(v);
                            }
                            if (v._belongsTo.indexOf(senderObj) === -1) {
                                v._belongsTo.push(senderObj);
                            }
                            if (v.hasChanges && v.hasChanges()) {
                                if (senderObj._dirtyRelated.indexOf(v) === -1) {
                                    senderObj._dirtyRelated.push(v);
                                }
                            }
                            return v.id || v._id;
                        }
                        return v;
                    });
                    if (relObjs.length > 0) senderObj.objects[propName] = relObjs;
                }
                break;
            case 'object':
                // Accept AtomObj → store its data
                if (value instanceof AtomObj) {
                    value = value.data;
                }
                if (this.is_array && Array.isArray(value)) {
                    value = value.map(function (v) {
                        return v instanceof AtomObj ? v.data : v;
                    });
                }
                break;
        }

        // Required check
        if (this.required && (value === null || value === undefined || value === '')) {
            console.warn('setPropValue: "' + propName + '" is required');
        }

        senderObj.data[propName] = value;
        return true;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ATOM STORAGE
// ═══════════════════════════════════════════════════════════════════════════

class AtomStorage extends AtomObj {
    static CLASS_ID = '@storage';

    class_id = '@storage';
    url = null;
    type = null;
}


// ═══════════════════════════════════════════════════════════════════════════
// ELEMENT STORE
// ═══════════════════════════════════════════════════════════════════════════

class ElementStore {

    constructor(id, seedOverride) {
        this.id = id;
        this.objects = {};
        this.storage = null;  // AtomStorage for remote operations

        // Seed core definitions
        this.seed(seedOverride || seedData);
    }

    /** Seed data into the store (creates objects without triggering remote save) */
    seed(data) {
        var self = this;
        Object.values(data).forEach(function (raw) {
            self.setObject(raw);
        });
    }

    /** Resolve JS constructor for a class_id (walks extends_id chain) */
    resolveConstructor(classId) {
        if (classRegistry[classId]) return classRegistry[classId];
        var cls = this.objects[classId];
        if (cls && cls.data && cls.data.extends_id) {
            return this.resolveConstructor(cls.data.extends_id);
        }
        return null;
    }

    /** Find prop definition by walking extends_id chain */
    findPropDef(classId, key) {
        var visited = {};
        var cid = classId;
        while (cid && !visited[cid]) {
            visited[cid] = true;
            var propObj = this.objects[cid + '.' + key];
            if (propObj) return propObj;
            var classObj = this.objects[cid];
            cid = (classObj && classObj.data) ? classObj.data.extends_id || null : null;
        }
        return null;
    }

    /** Collect all prop definitions for a class (inherited, child overrides parent) */
    collectClassProps(classId) {
        var visited = {};
        var propsByKey = {};
        var chain = [];
        var cid = classId;
        while (cid && !visited[cid]) {
            visited[cid] = true;
            chain.push(cid);
            var classObj = this.objects[cid];
            cid = (classObj && classObj.data) ? classObj.data.extends_id || null : null;
        }
        var objs = this.objects;
        for (var i = chain.length - 1; i >= 0; i--) {
            var prefix = chain[i] + '.';
            Object.keys(objs).forEach(function(k) {
                if (k.indexOf(prefix) === 0 && objs[k].class_id === '@prop') {
                    propsByKey[k.substring(prefix.length)] = objs[k];
                }
            });
        }
        return Object.values(propsByKey);
    }

    // Get object — local first, then fetch remote
    // classId is optional optimization hint — without it, uses /find/{id} endpoint
    getObject(id, classId) {
        var obj = this.objects[id];
        if (obj) return obj;

        // Fetch from remote storage if configured
        if (this.storage) {
            var raw = this.fetchRemote(id, classId);
            if (raw) {
                obj = new AtomObj(raw, this);
                this.objects[id] = obj;
                return obj;
            }
        }

        return null;
    }

    // Get class definition
    getClass(classId) {
        var obj = this.getObject(classId);
        if (!obj) {
            throw new Error('getClass: class not found: ' + classId);
        }
        return obj;
    }

    // Save object to store (local + remote)
    setObject(obj) {
        if (!(obj instanceof AtomObj)) {
            if (!obj.class_id) {
                throw new Error('setObject: class_id is required');
            }
            obj = new AtomObj(obj, this);
        }

        // Store locally — key by id if available, otherwise _id
        var key = obj.id || obj._id;
        this.objects[key] = obj;

        // Save to remote if storage configured
        if (this.storage) {
            this.saveRemote(obj);
        }

        return obj;
    }

    // Find objects by filter
    find(filter) {
        var results = [];
        Object.values(this.objects).forEach(function (obj) {
            var match = true;
            Object.keys(filter).forEach(function (k) {
                if (obj[k] !== filter[k]) match = false;
            });
            if (match) results.push(obj);
        });
        return results;
    }

    /**
     * Set JWT token for authenticated API calls.
     * @param {string|null} token - JWT Bearer token
     */
    setToken(token) {
        setJwtToken(token);
    }

    // ═══════════════════════════════════════════════════════════════════
    // APPLY REMOTE — merge external data into existing objects
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Apply external/remote data to an existing object.
     * Merges fields, updates snapshot (marks clean), triggers syncToDom.
     * If object doesn't exist, creates it via setObject.
     * @param {Object} raw - Data with at least {id, class_id}
     * @returns {AtomObj}
     */
    applyRemote(raw) {
        if (!raw || !raw.id) throw new Error('applyRemote: id is required');

        var existing = this.objects[raw.id];
        if (existing) {
            // Merge fields into existing data
            Object.keys(raw).forEach(function (k) {
                existing.data[k] = raw[k];
            });
            // Update snapshot — external data = clean state
            existing._snapshot = JSON.parse(JSON.stringify(existing.data));
            // Sync DOM if this is an AtomElement
            if (typeof existing.syncToDom === 'function') existing.syncToDom();
            return existing;
        }

        // Object doesn't exist yet — create it
        return this.setObject(raw);
    }

    /**
     * Save all objects that have unsaved changes.
     * Updates snapshots after saving.
     * @returns {Array} list of saved object ids
     */
    saveDirty() {
        var saved = [];
        var self = this;
        Object.values(this.objects).forEach(function (obj) {
            if (obj.hasChanges && obj.hasChanges()) {
                if (self.storage) self.saveRemote(obj);
                obj._snapshot = JSON.parse(JSON.stringify(obj.data));
                saved.push(obj.id || obj._id);
            }
        });
        return saved;
    }

    // ═══════════════════════════════════════════════════════════════════
    // REMOTE STORAGE
    // API: http://master.local/elementStore/api/store/{class_id}/{id}
    // ═══════════════════════════════════════════════════════════════════

    fetchRemote(id, classId) {
        if (!this.storage || !this.storage.url) return null;

        var url;
        if (classId) {
            // Direct fetch: /store/{class}/{id}
            url = this.storage.url + '/store/' + encodeURIComponent(classId) + '/' + encodeURIComponent(id);
        } else {
            // Derive class_id from dot-prefix (e.g. '@class.name' → '@class')
            var dotIndex = id.indexOf('.');
            if (dotIndex > 0) {
                url = this.storage.url + '/store/' + encodeURIComponent(id.substring(0, dotIndex)) + '/' + encodeURIComponent(id);
            } else {
                // No class hint — use cross-class find endpoint
                url = this.storage.url + '/find/' + encodeURIComponent(id);
            }
        }

        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false); // sync
            xhr.setRequestHeader('Content-Type', 'application/json');
            if (_jwtToken) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + _jwtToken);
            }
            xhr.send();
            if (xhr.status === 200) {
                return JSON.parse(xhr.responseText);
            }
        } catch (e) {
            console.warn('fetchRemote failed for ' + id + ':', e.message);
        }
        return null;
    }

    /** @param {AtomObj} obj */
    saveRemote(obj) {
        if (!this.storage || !this.storage.url) return;

        var classId = obj.class_id;
        var id = obj.id;
        var isNew = !id;
        var url, method;

        if (isNew) {
            url = this.storage.url + '/store/' + encodeURIComponent(classId);
            method = 'POST';
        } else {
            url = this.storage.url + '/store/' + encodeURIComponent(classId) + '/' + encodeURIComponent(id);
            method = 'PUT';
        }

        try {
            var xhr = new XMLHttpRequest();
            xhr.open(method, url, false); // sync
            xhr.setRequestHeader('Content-Type', 'application/json');
            if (_jwtToken) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + _jwtToken);
            }
            if (!isNew) xhr.setRequestHeader('X-Allow-Custom-Ids', 'true');
            xhr.send(JSON.stringify(obj.data));

            if (xhr.status >= 200 && xhr.status < 300) {
                var response = JSON.parse(xhr.responseText);
                if (isNew && response.id) {
                    // Re-key: _id → id
                    var oldKey = obj._id;
                    obj.data.id = response.id;
                    this.objects[obj.id] = obj;
                    delete this.objects[oldKey];
                }
                // Merge server fields (created_at, updated_at, etc.)
                var self = this;
                Object.keys(response).forEach(function(k) {
                    obj.data[k] = response[k];
                });
            } else {
                console.warn('saveRemote failed: HTTP ' + xhr.status);
            }
        } catch (e) {
            console.warn('saveRemote failed:', e.message);
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// REGISTER CLASSES
// ═══════════════════════════════════════════════════════════════════════════

registerClass('@class', AtomClass);
registerClass('@prop', AtomProp);
registerClass('@storage', AtomStorage);


// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        seedData,
        classRegistry,
        registerClass,
        generateLocalId,
        setJwtToken,
        getJwtToken,
        AtomObj,
        AtomClass,
        AtomProp,
        AtomStorage,
        AtomCollection,
        ElementStore,
    };
}

if (typeof window !== 'undefined') {
    window.seedData = seedData;
    window.classRegistry = classRegistry;
    window.registerClass = registerClass;
    window.generateLocalId = generateLocalId;
    window.setJwtToken = setJwtToken;
    window.getJwtToken = getJwtToken;
    window.AtomObj = AtomObj;
    window.AtomClass = AtomClass;
    window.AtomProp = AtomProp;
    window.AtomStorage = AtomStorage;
    window.AtomCollection = AtomCollection;
    window.ElementStore = ElementStore;

    // initialize
    store = new ElementStore('root.store');
    window.store = store;  // expose for F12 console
    storage = new AtomStorage({id: 'root.storage', class_id: '@storage', url: (typeof API_BASE !== 'undefined' ? API_BASE : '')}, store);
    store.storage = storage;
}
