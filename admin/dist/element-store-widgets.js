"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/widgets/WidgetBinding.ts
  var WidgetBinding = class {
    constructor(store, elementId, mappings) {
      __publicField(this, "store");
      __publicField(this, "elementId");
      __publicField(this, "mappings");
      __publicField(this, "_obj", null);
      __publicField(this, "_widgets", []);
      __publicField(this, "_unsubscribe", null);
      __publicField(this, "_storeUnsub", null);
      this.store = store;
      this.elementId = elementId;
      this.mappings = mappings;
      this._attach();
    }
    // ─── Public API ──────────────────────────────────────────────
    /** Get current value for a mapped property */
    get(localName) {
      const mapping = this.mappings[localName];
      if (!mapping || !this._obj) return mapping == null ? void 0 : mapping.default;
      let raw = this._obj[mapping.key];
      if (raw === void 0 || raw === null) raw = mapping.default;
      return mapping.toWidget ? mapping.toWidget(raw) : raw;
    }
    /** Set a value on the AtomObj (goes through proxy → onChange → all subscribers) */
    set(localName, value) {
      if (!this._obj) return;
      const mapping = this.mappings[localName];
      if (!mapping || mapping.dir === "read") return;
      const elementValue = mapping.toElement ? mapping.toElement(value) : value;
      this._obj[mapping.key] = elementValue;
    }
    /** Set multiple values atomically */
    setMany(updates) {
      if (!this._obj) return;
      const objUpdates = {};
      for (const [localName, value] of Object.entries(updates)) {
        const mapping = this.mappings[localName];
        if (!mapping || mapping.dir === "read") continue;
        objUpdates[mapping.key] = mapping.toElement ? mapping.toElement(value) : value;
      }
      if (Object.keys(objUpdates).length > 0) {
        this._obj.update(objUpdates);
      }
    }
    /** Get all readable values as a map */
    getAll() {
      const result = {};
      for (const localName of Object.keys(this.mappings)) {
        if (this.mappings[localName].dir !== "write") {
          result[localName] = this.get(localName);
        }
      }
      return result;
    }
    /** The bound AtomObj (null if not found) */
    get element() {
      return this._obj;
    }
    /** Switch to a different element */
    rebind(elementId) {
      this._detach();
      this.elementId = elementId;
      this._attach();
      this._syncAllWidgets();
    }
    /** Clean up all bindings and subscriptions */
    destroy() {
      this._detach();
      for (const w2 of this._widgets) {
        if (w2.teardown) w2.teardown();
      }
      this._widgets = [];
    }
    // ─── Bind DOM Elements ──────────────────────────────────────
    /**
     * Bind an <input>, <textarea>, or <select> — two-way sync.
     * Reads value from obj on attach, writes back on 'input'/'change' events.
     */
    bindInput(localName, el) {
      const mapping = this.mappings[localName];
      if (!mapping) return;
      const handler = () => {
        if (mapping.dir === "read") return;
        const val = el.type === "checkbox" ? el.checked : el.value;
        this.set(localName, val);
      };
      const eventName = el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(eventName, handler);
      this._pushToInput(localName, el);
      this._widgets.push({
        localName,
        el,
        type: "input",
        teardown: () => el.removeEventListener(eventName, handler)
      });
    }
    /**
     * Bind any element's textContent — read-only by default.
     * Updates when obj property changes.
     */
    bindText(localName, el) {
      var _a;
      el.textContent = String((_a = this.get(localName)) != null ? _a : "");
      this._widgets.push({ localName, el, type: "text" });
    }
    /**
     * Bind any element's innerHTML — read-only.
     */
    bindHtml(localName, el) {
      var _a;
      el.innerHTML = String((_a = this.get(localName)) != null ? _a : "");
      this._widgets.push({ localName, el, type: "html" });
    }
    /**
     * Bind a DOM attribute (e.g., 'disabled', 'src', 'href').
     */
    bindAttr(localName, el, attr) {
      const val = this.get(localName);
      if (val === false || val === null || val === void 0) {
        el.removeAttribute(attr);
      } else {
        el.setAttribute(attr, String(val));
      }
      this._widgets.push({ localName, el, type: "attr", attr });
    }
    /**
     * Bind a CSS style property (e.g., 'left', 'width', 'backgroundColor').
     */
    bindStyle(localName, el, styleProp) {
      var _a;
      el.style[styleProp] = String((_a = this.get(localName)) != null ? _a : "");
      this._widgets.push({ localName, el, type: "style", styleProp });
    }
    /**
     * Toggle a CSS class based on a boolean property.
     */
    bindClass(localName, el, className) {
      el.classList.toggle(className, !!this.get(localName));
      this._widgets.push({ localName, el, type: "class", className });
    }
    /**
     * Custom binding — provide your own render function.
     * Called on initial bind and on every property change.
     */
    bindCustom(localName, el, render) {
      render(el, this.get(localName));
      this._widgets.push({ localName, el, type: "custom", render });
    }
    // ─── Internal ───────────────────────────────────────────────
    _attach() {
      this._obj = this.elementId ? this.store.getObject(this.elementId) : null;
      if (this._obj) {
        this._unsubscribe = this._obj.subscribe(() => {
          this._syncAllWidgets();
        });
      }
      if (!this._obj && this.elementId) {
        this._storeUnsub = this.store.subscribe(() => {
          const obj = this.store.getObject(this.elementId);
          if (obj && obj !== this._obj) {
            this._obj = obj;
            if (this._storeUnsub) {
              this._storeUnsub();
              this._storeUnsub = null;
            }
            this._unsubscribe = this._obj.subscribe(() => this._syncAllWidgets());
            this._syncAllWidgets();
          }
        });
      }
    }
    _detach() {
      if (this._unsubscribe) {
        this._unsubscribe();
        this._unsubscribe = null;
      }
      if (this._storeUnsub) {
        this._storeUnsub();
        this._storeUnsub = null;
      }
      this._obj = null;
    }
    _syncAllWidgets() {
      for (const w2 of this._widgets) {
        const val = this.get(w2.localName);
        switch (w2.type) {
          case "input":
            this._pushToInput(w2.localName, w2.el);
            break;
          case "text":
            w2.el.textContent = String(val != null ? val : "");
            break;
          case "html":
            w2.el.innerHTML = String(val != null ? val : "");
            break;
          case "attr":
            if (val === false || val === null || val === void 0) {
              w2.el.removeAttribute(w2.attr);
            } else {
              w2.el.setAttribute(w2.attr, String(val));
            }
            break;
          case "style":
            w2.el.style[w2.styleProp] = String(val != null ? val : "");
            break;
          case "class":
            w2.el.classList.toggle(w2.className, !!val);
            break;
          case "custom":
            if (w2.render) w2.render(w2.el, val);
            break;
        }
      }
    }
    _pushToInput(localName, el) {
      const val = this.get(localName);
      if (el.type === "checkbox") {
        el.checked = !!val;
      } else {
        el.value = val !== null && val !== void 0 ? String(val) : "";
      }
    }
  };
  function autobind(store, elementId, container, mappings) {
    const binding = new WidgetBinding(store, elementId, mappings);
    container.querySelectorAll("[data-bind]").forEach((el) => {
      const name = el.dataset.bind;
      if (mappings[name]) binding.bindInput(name, el);
    });
    container.querySelectorAll("[data-bind-text]").forEach((el) => {
      const name = el.dataset.bindText;
      if (mappings[name]) binding.bindText(name, el);
    });
    container.querySelectorAll("[data-bind-html]").forEach((el) => {
      const name = el.dataset.bindHtml;
      if (mappings[name]) binding.bindHtml(name, el);
    });
    container.querySelectorAll("[data-bind-attr]").forEach((el) => {
      const spec = el.dataset.bindAttr;
      const [name, attr] = spec.split(":");
      if (mappings[name] && attr) binding.bindAttr(name, el, attr);
    });
    return binding;
  }

  // src/widgets/PropertyResolver.ts
  function resolveProperties(store, objOrId) {
    var _a;
    const obj = typeof objOrId === "string" ? store.getObject(objOrId) : objOrId;
    if (!obj) return [];
    const data = obj.data || {};
    const classId = data.class_id;
    if (!classId) return [];
    const propDefs = store.collectClassProps(classId);
    if (!propDefs || propDefs.length === 0) {
      return Object.entries(data).filter(([k]) => k !== "id" && k !== "class_id" && !k.startsWith("_")).map(([k, v]) => ({
        key: k,
        value: v,
        schema: null,
        isDefault: false,
        dataType: typeof v,
        label: k,
        description: "",
        required: false,
        readonly: false,
        hidden: false,
        displayOrder: 0,
        groupName: "",
        editor: null,
        options: null,
        isArray: false,
        objectClassId: null
      }));
    }
    const defaults = store.getResolvedDefaults ? store.getResolvedDefaults(classId) : {};
    const result = [];
    for (const propObj of propDefs) {
      const pd = propObj.data || propObj;
      const key = pd.key;
      if (!key) continue;
      const hasOwnValue = key in data && data[key] !== void 0;
      const defaultValue = (_a = defaults[key]) != null ? _a : pd.default_value;
      const flags = pd.flags || {};
      result.push({
        key,
        value: hasOwnValue ? data[key] : defaultValue,
        schema: pd,
        isDefault: !hasOwnValue,
        dataType: pd.data_type || "string",
        label: pd.label || key,
        description: pd.description || "",
        required: flags.required || pd.required || false,
        readonly: flags.readonly || pd.readonly || false,
        hidden: flags.hidden || pd.hidden || false,
        displayOrder: pd.display_order || 0,
        groupName: pd.group_name || "",
        editor: pd.editor || null,
        options: pd.options || null,
        isArray: pd.is_array || false,
        objectClassId: normalizeClassIds(pd.object_class_id)
      });
    }
    result.sort((a, b) => a.displayOrder - b.displayOrder);
    return result;
  }
  function groupProperties(props) {
    const groups = {};
    for (const p of props) {
      const g = p.groupName || "General";
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    }
    return groups;
  }
  function normalizeClassIds(val) {
    if (val === null || val === void 0) return null;
    if (Array.isArray(val)) return val.length > 0 ? val : null;
    if (typeof val === "string" && val.trim()) return [val.trim()];
    return null;
  }

  // src/widgets/EditorResolver.ts
  var DEFAULT_EDITORS = {
    string: "text",
    boolean: "checkbox",
    integer: "number",
    float: "number",
    datetime: "datetime",
    object: "nested",
    relation: "reference",
    function: "code"
  };
  function resolveEditor(store, prop) {
    var _a, _b;
    const editorObj = prop.editor;
    const editorId = getEditorId(editorObj) || DEFAULT_EDITORS[prop.dataType] || "text";
    const config = getEditorConfig(editorObj);
    const childClassId = ((_a = prop.objectClassId) == null ? void 0 : _a[0]) || null;
    const isArray = prop.isArray;
    const values = (_b = prop.options) == null ? void 0 : _b.values;
    if (values && typeof values === "object" && !Array.isArray(values)) {
      return {
        type: "class-selector",
        editorId: "select",
        config,
        childClassId,
        isArray,
        classMap: values,
        prop
      };
    }
    if (childClassId === "@obj_ref") {
      return {
        type: "obj-ref",
        editorId: "obj-ref",
        config,
        childClassId,
        isArray,
        classMap: null,
        prop
      };
    }
    if (isArray && isArray !== "false" && editorId === "grid" && childClassId) {
      return {
        type: "grid",
        editorId: "grid",
        config,
        childClassId,
        isArray,
        classMap: null,
        prop
      };
    }
    if ((prop.dataType === "object" || prop.dataType === "relation") && childClassId) {
      if (isArray && isArray !== "false") {
        return {
          type: "property-editor",
          editorId: "property-editor",
          config,
          childClassId,
          isArray,
          classMap: null,
          prop
        };
      }
      return {
        type: "property-editor",
        editorId: "property-editor",
        config,
        childClassId,
        isArray: false,
        classMap: null,
        prop
      };
    }
    return {
      type: "input",
      editorId,
      config,
      childClassId: null,
      isArray,
      classMap: null,
      prop
    };
  }
  function resolveEditors(store, props) {
    return props.map((p) => resolveEditor(store, p));
  }
  function getEditorId(editor) {
    if (!editor) return null;
    if (typeof editor === "string") return editor;
    if (typeof editor === "object" && editor.id) return editor.id;
    return null;
  }
  function getEditorConfig(editor) {
    if (!editor || typeof editor !== "object") return {};
    const config = { ...editor };
    delete config.id;
    return config;
  }

  // src/core/AtomObj.ts
  var INTERNAL_FIELDS = /* @__PURE__ */ new Set([
    "store",
    "data",
    "objects",
    "_class",
    "_snapshot",
    "_id",
    "_related",
    "_dirtyRelated",
    "_belongsTo",
    "_onChange",
    "_renderVersion",
    "el",
    "_autoSaveTimer"
  ]);
  var _localIdCounter = 0;
  function generateLocalId() {
    return "_" + ++_localIdCounter + "_" + Math.random().toString(36).substr(2, 6);
  }
  var _AtomObj = class _AtomObj {
    constructor(raw, store) {
      __publicField(this, "store", null);
      __publicField(this, "data", {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __publicField(this, "objects", {});
      __publicField(this, "_class", null);
      __publicField(this, "_snapshot", null);
      __publicField(this, "_id", "");
      __publicField(this, "_related", []);
      __publicField(this, "_dirtyRelated", []);
      __publicField(this, "_belongsTo", null);
      __publicField(this, "_onChange", []);
      if (new.target === _AtomObj && store) {
        const cid = typeof raw === "string" ? raw : raw == null ? void 0 : raw.class_id;
        if (cid) {
          const Ctor = store.resolveConstructor(cid);
          if (Ctor && Ctor !== _AtomObj) {
            return new Ctor(raw, store);
          }
        }
      }
      this.store = store || null;
      this.objects = {};
      this._related = [];
      this._dirtyRelated = [];
      this._belongsTo = null;
      this._onChange = [];
      if (typeof raw === "string") {
        raw = { class_id: raw };
      }
      this._id = (raw == null ? void 0 : raw._id) || (raw == null ? void 0 : raw.id) || generateLocalId();
      if (raw == null ? void 0 : raw._id) delete raw._id;
      if (!raw || typeof raw !== "object" || !raw.class_id) {
        throw new Error("AtomObj: class_id is required");
      }
      this.data = raw;
      this._class = this.store ? this.store.getObject(raw.class_id) || null : null;
      const proxy = new Proxy(this, {
        get(target, prop, receiver) {
          if (typeof prop === "symbol") return target[prop];
          if (INTERNAL_FIELDS.has(prop)) return target[prop];
          if (typeof target[prop] === "function") {
            return target[prop].bind(receiver);
          }
          if (!target._class && target.store) {
            target._class = target.store.getObject(target.data.class_id) || null;
          }
          if (target._class && target.store && prop !== "id" && prop !== "class_id") {
            const propDef = target.store.findPropDef(target.data.class_id, prop);
            if (propDef && typeof propDef.getPropValue === "function") {
              return propDef.getPropValue(target, prop);
            }
          }
          if (prop in target.data) {
            return target.data[prop];
          }
          return target[prop];
        },
        set(target, prop, val) {
          if (INTERNAL_FIELDS.has(prop)) {
            target[prop] = val;
            return true;
          }
          if (target._class && target.store && prop !== "id" && prop !== "class_id") {
            const classId = target.data.class_id;
            if (classId) {
              const propDef = target.store.findPropDef(classId, prop);
              if (propDef && typeof propDef.setPropValue === "function") {
                return propDef.setPropValue(target, prop, val);
              }
              if (target.store.collectClassProps(classId).length > 0) {
              }
            }
          }
          if (target._belongsTo) {
            if (target._belongsTo._dirtyRelated.indexOf(target) === -1) {
              target._belongsTo._dirtyRelated.push(target);
            }
          }
          const oldVal = target.data[prop];
          target.data[prop] = val;
          console.log(
            `%c[AtomObj.set]%c ${target._id} .${prop}`,
            "background: #8b5cf6; color: white; padding: 1px 6px; border-radius: 3px;",
            "",
            { old: oldVal, new: val, class_id: target.data.class_id }
          );
          if (typeof target._renderVersion === "number") target._renderVersion++;
          if (target._onChange && target._onChange.length > 0) {
            const info = { obj: target, prop, value: val, oldValue: oldVal };
            for (const fn of target._onChange) {
              fn(info);
            }
          }
          return true;
        }
      });
      this._applyDefaults();
      if (this.data.id) {
        this._snapshot = JSON.parse(JSON.stringify(this.data));
      } else {
        this._snapshot = null;
      }
      return proxy;
    }
    // --- Class introspection ---
    /**
     * Check if this object's class extends (inherits from) the given ancestor class.
     * Works on both instances and class definitions:
     *   instance.extendsFrom('core:baseContainer')  → checks instance's class chain
     *   classObj.extendsFrom('core:baseElement')     → checks this class's own chain
     */
    extendsFrom(ancestorClassId) {
      if (!this.store) return false;
      if (this.data.class_id === "@class") {
        return this.store.classExtends(this.data.id, ancestorClassId);
      }
      return this.store.classExtends(this.data.class_id, ancestorClassId);
    }
    /**
     * Get the inheritance chain for this object's class.
     * Returns array of class IDs from this class up to the root.
     */
    getInheritanceChain() {
      if (!this.store) return [];
      const classId = this.data.class_id === "@class" ? this.data.id : this.data.class_id;
      return this.store.getInheritanceChain(classId);
    }
    /**
     * Get resolved defaults for this object's class (merged from all ancestors).
     * Child class defaults override parent defaults.
     */
    getClassDefaults() {
      if (!this.store) return {};
      const classId = this.data.class_id === "@class" ? this.data.id : this.data.class_id;
      return this.store.getResolvedDefaults(classId);
    }
    // --- Property introspection ---
    /** Get prop definitions for this object's class (includes inherited) */
    getProps() {
      if (!this.store) return [];
      return this.store.collectClassProps(this.data.class_id);
    }
    /** Get a specific prop definition by key (walks inheritance) */
    getPropDef(key) {
      if (!this.store) return null;
      return this.store.findPropDef(this.data.class_id, key);
    }
    /** Apply default values from class definition (includes inherited).
     *  1. Class-level `defaults` block (merged from inheritance chain)
     *  2. Property-level `default_value` from each @prop definition
     *  Only fills keys that are `undefined` in data. */
    _applyDefaults() {
      if (!this.store) return;
      const classId = this.data.class_id;
      if (!classId) return;
      const data = this.data;
      const classDefaults = this.store.getResolvedDefaults(classId);
      for (const [key, val] of Object.entries(classDefaults)) {
        if (data[key] === void 0 && val !== void 0 && val !== null) {
          data[key] = val;
        }
      }
      const props = this.store.collectClassProps(classId);
      for (const propObj of props) {
        const dotIdx = propObj.data.id.lastIndexOf(".");
        const key = dotIdx >= 0 ? propObj.data.id.substring(dotIdx + 1) : propObj.data.id;
        if (data[key] === void 0) {
          const def = propObj.data.default_value;
          if (def !== void 0 && def !== null) {
            data[key] = def;
          }
        }
      }
    }
    // --- Change tracking ---
    /** Check if data changed since load */
    hasChanges() {
      if (!this._snapshot) return true;
      return JSON.stringify(this.data) !== JSON.stringify(this._snapshot);
    }
    /** Get changed fields (diff vs snapshot) */
    getChanges() {
      if (!this._snapshot) return { ...this.data };
      const changes = {};
      const data = this.data;
      const snap = this._snapshot;
      for (const k of Object.keys(data)) {
        if (JSON.stringify(data[k]) !== JSON.stringify(snap[k])) {
          changes[k] = data[k];
        }
      }
      for (const k of Object.keys(snap)) {
        if (!(k in data)) {
          changes[k] = null;
        }
      }
      return changes;
    }
    // --- Persistence ---
    /** Save this object and its dirty relations via store.setObject.
     *  Relations delegate to their parent — only the parent talks to storage.
     *  The storage adapter handles the cascade (children first, then self). */
    async save() {
      if (!this.store) throw new Error("save: no store assigned");
      if (this._belongsTo) {
        return this._belongsTo.save();
      }
      this._syncRelationIds();
      await this.store.saveObjectAsync(this);
    }
    /** Walk relation props, rebuild raw ID arrays/values from actual objects.
     *  Uses data.id (server-assigned) when available, falls back to _id (local). */
    _syncRelationIds() {
      var _a;
      if (!this.store || !this._class) return;
      const data = this.data;
      const objects = this.objects;
      const props = this.store.collectClassProps(this.data.class_id);
      for (const propObj of props) {
        if (propObj.data.data_type !== "relation") continue;
        const dotIdx = propObj.data.id.lastIndexOf(".");
        const key = dotIdx >= 0 ? propObj.data.id.substring(dotIdx + 1) : propObj.data.id;
        const relObjs = objects[key];
        if (!relObjs) continue;
        const isArr = propObj.data.is_array === true || propObj.data.is_array === "indexed";
        if (isArr && Array.isArray(relObjs)) {
          data[key] = relObjs.map((o) => {
            var _a2;
            return (_a2 = o.data.id) != null ? _a2 : o._id;
          });
        } else if (relObjs instanceof _AtomObj) {
          data[key] = (_a = relObjs.data.id) != null ? _a : relObjs._id;
        }
      }
    }
    /** Soft delete: mark as deleted, then save */
    delete() {
      this.data._deleted = true;
      this.save();
    }
    /** Get related objects that have unsaved changes */
    getDirtyObjects() {
      const dirty = [];
      for (const [, val] of Object.entries(this.objects)) {
        if (Array.isArray(val)) {
          for (const obj of val) {
            if (obj && obj.hasChanges && obj.hasChanges()) dirty.push(obj);
          }
        } else if (val && val.hasChanges && val.hasChanges()) {
          dirty.push(val);
        }
      }
      return dirty;
    }
    /** Serialize to plain object */
    toJSON() {
      return this.data;
    }
    // --- ReactiveElement-compatible interface ---
    // These methods allow consumers to use AtomObj with the same API
    // that was previously provided by ReactiveElement.
    /** Get raw data (ReactiveElement compatibility) */
    getData() {
      return this.data;
    }
    /** Subscribe to changes, returns unsubscribe function (ReactiveElement compatibility) */
    subscribe(callback) {
      const handler = () => callback();
      this._onChange.push(handler);
      return () => {
        const idx = this._onChange.indexOf(handler);
        if (idx >= 0) this._onChange.splice(idx, 1);
      };
    }
    /** Update data (merge). Goes through the Proxy setter for each key,
     *  so propDef validation, dirty tracking, _renderVersion, and _onChange all fire. */
    update(updates) {
      console.log(
        `%c[AtomObj.update]%c ${this._id}`,
        "background: #f59e0b; color: black; padding: 1px 6px; border-radius: 3px;",
        "",
        updates,
        { class_id: this.data.class_id, listeners: this._onChange.length }
      );
      for (const [k, v] of Object.entries(updates)) {
        this[k] = v;
      }
    }
    // --- Convenience accessors (for TypeScript typing) ---
    get id() {
      return this.data.id;
    }
    get class_id() {
      return this.data.class_id;
    }
  };
  __publicField(_AtomObj, "CLASS_ID", "@atom");
  var AtomObj = _AtomObj;

  // src/widgets/EditorState.ts
  var MAX_NESTING_DEPTH = 20;
  var EditorState = class _EditorState {
    constructor(store, classId, data, path = "", level = 0, parent = null) {
      __publicField(this, "store");
      __publicField(this, "classId");
      __publicField(this, "data");
      __publicField(this, "path");
      __publicField(this, "level");
      __publicField(this, "properties");
      __publicField(this, "editors");
      __publicField(this, "parent");
      this.store = store;
      this.classId = classId;
      this.data = data;
      this.path = path;
      this.level = level;
      this.parent = parent;
      const objId = data.id;
      const existingObj = objId ? store.objects[objId] : null;
      if (existingObj) {
        this.properties = resolveProperties(store, existingObj);
      } else {
        const tempId = `__es_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const rawData = { ...data, id: tempId, class_id: classId };
        const tempObj = new AtomObj(rawData, store);
        store.objects[tempId] = tempObj;
        this.properties = resolveProperties(store, tempObj);
        delete store.objects[tempId];
      }
      this.editors = resolveEditors(store, this.properties);
    }
    // ─── Computed ─────────────────────────────────────────────────
    /** Whether nesting can go one level deeper */
    canGoDeeper() {
      return this.level < MAX_NESTING_DEPTH;
    }
    /** Warning message if approaching or at max depth, null otherwise */
    getDepthWarning() {
      if (this.level >= MAX_NESTING_DEPTH) {
        return `Maximum nesting depth (${MAX_NESTING_DEPTH}) reached. Cannot nest further.`;
      }
      if (this.level >= MAX_NESTING_DEPTH - 2) {
        return `Approaching maximum nesting depth (${this.level}/${MAX_NESTING_DEPTH}).`;
      }
      return null;
    }
    // ─── Child creation ───────────────────────────────────────────
    /**
     * Create a child EditorState for a nested object property.
     * Returns null if max depth would be exceeded.
     */
    createChild(prop, value) {
      var _a;
      if (!this.canGoDeeper()) return null;
      const childClassId = (_a = prop.objectClassId) == null ? void 0 : _a[0];
      if (!childClassId) return null;
      const childData = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const childPath = this.path ? `${this.path}.${prop.key}` : prop.key;
      return new _EditorState(
        this.store,
        childClassId,
        childData,
        childPath,
        this.level + 1,
        this
      );
    }
    /**
     * Create child EditorState instances for each item in an array property.
     * Skips items that would exceed max depth.
     */
    createArrayChildren(prop, items) {
      var _a;
      if (!this.canGoDeeper()) return [];
      const childClassId = (_a = prop.objectClassId) == null ? void 0 : _a[0];
      if (!childClassId) return [];
      const results = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const childData = item && typeof item === "object" && !Array.isArray(item) ? item : {};
        const childPath = this.path ? `${this.path}.${prop.key}[${i}]` : `${prop.key}[${i}]`;
        results.push(new _EditorState(
          this.store,
          childClassId,
          childData,
          childPath,
          this.level + 1,
          this
        ));
      }
      return results;
    }
    // ─── Template formatting ──────────────────────────────────────
    /**
     * Format a template string by replacing {{key}} placeholders with data values.
     *
     * Example: EditorState.formatTemplate("{{name}} ({{status}})", {name: "Foo", status: "active"})
     *          → "Foo (active)"
     */
    static formatTemplate(template, data) {
      return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
        const val = data[key];
        if (val === null || val === void 0) return "";
        if (typeof val === "object") return Array.isArray(val) ? `[${val.length}]` : "{...}";
        return String(val);
      });
    }
    // ─── Display helpers ──────────────────────────────────────────
    /**
     * Get the display label for this object.
     * Checks class context for a label_template, falls back to name or first string prop.
     */
    getDisplayLabel(contextName) {
      var _a;
      const classDef = this.store.getClassSafe(this.classId);
      if (!classDef) return this.data.name || this.data.id || this.classId;
      if (contextName) {
        const contexts = (_a = classDef.data) == null ? void 0 : _a.contexts;
        const ctx = contexts == null ? void 0 : contexts[contextName];
        if ((ctx == null ? void 0 : ctx.label_template) && typeof ctx.label_template === "string") {
          return _EditorState.formatTemplate(ctx.label_template, this.data);
        }
      }
      if (this.data.name && typeof this.data.name === "string") {
        return this.data.name;
      }
      for (const prop of this.properties) {
        if (prop.dataType === "string" && prop.value && typeof prop.value === "string") {
          return prop.value;
        }
      }
      return this.data.id || this.classId;
    }
    /**
     * Get the children field name from class context (for tree structures).
     * Returns null if no children field is defined.
     */
    getChildrenField(contextName) {
      var _a;
      const classDef = this.store.getClassSafe(this.classId);
      if (!classDef) return null;
      const contexts = (_a = classDef.data) == null ? void 0 : _a.contexts;
      if (!contexts) return null;
      const ctx = (contextName ? contexts[contextName] : null) || contexts["default"];
      if ((ctx == null ? void 0 : ctx.children_field) && typeof ctx.children_field === "string") {
        return ctx.children_field;
      }
      return null;
    }
    /**
     * Resolve a class selector: given a field key and the current value,
     * look up options.values (assoc map) to find the target class_id.
     * Returns null if no mapping found.
     */
    resolveClassSelector(fieldKey, value) {
      const prop = this.properties.find((p) => p.key === fieldKey);
      if (!prop) return null;
      const options = prop.options;
      if (!options) return null;
      const values = options.values;
      if (!values || typeof values !== "object" || Array.isArray(values)) return null;
      const classMap = values;
      return classMap[value] || null;
    }
  };

  // src/widgets/FunctionProxy.ts
  var FUNCTION_REGISTRY = /* @__PURE__ */ new Map();
  function registerFunction(name, fn) {
    FUNCTION_REGISTRY.set(name, fn);
  }
  function getFunction(name) {
    return FUNCTION_REGISTRY.get(name);
  }
  function executeFunction(name, args) {
    const fn = FUNCTION_REGISTRY.get(name);
    if (!fn) {
      console.warn(`[FunctionProxy] Function not found: ${name}`);
      return void 0;
    }
    return fn(...args);
  }
  function bindFunctions(store, element) {
    var _a;
    const classId = (_a = element.data) == null ? void 0 : _a.class_id;
    if (!classId) return;
    const propDefs = store.collectClassProps(classId);
    if (!propDefs) return;
    for (const propObj of propDefs) {
      const pd = propObj.data || propObj;
      if (pd.data_type !== "function") continue;
      const options = pd.options;
      if (!(options == null ? void 0 : options.function)) continue;
      const funcRef = options.function;
      const argKeys = options.args || [];
      const propKey = pd.key;
      Object.defineProperty(element, propKey, {
        configurable: true,
        enumerable: false,
        get: () => {
          return (...runtimeArgs) => {
            const args = argKeys.map((key, index) => {
              if (key.startsWith("$")) {
                const argIndex = parseInt(key.slice(1), 10);
                return runtimeArgs[argIndex];
              }
              return element[key];
            });
            return executeFunction(funcRef, args);
          };
        }
      });
    }
  }

  // src/browser-widgets.ts
  var w = window;
  w["WidgetBinding"] = WidgetBinding;
  w["autobind"] = autobind;
  w["resolveProperties"] = resolveProperties;
  w["groupProperties"] = groupProperties;
  w["resolveEditor"] = resolveEditor;
  w["resolveEditors"] = resolveEditors;
  w["EditorState"] = EditorState;
  w["registerFunction"] = registerFunction;
  w["getFunction"] = getFunction;
  w["executeFunction"] = executeFunction;
  w["bindFunctions"] = bindFunctions;
})();
//# sourceMappingURL=element-store-widgets.js.map