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
  w["registerFunction"] = registerFunction;
  w["getFunction"] = getFunction;
  w["executeFunction"] = executeFunction;
  w["bindFunctions"] = bindFunctions;
})();
//# sourceMappingURL=element-store-widgets.js.map