/**
 * WidgetBinding — Framework-agnostic native DOM ↔ AtomObj binding
 *
 * This is the core binding layer. React hooks are thin wrappers around this.
 * Any native JS widget (input, select, div, canvas) binds directly to AtomObj properties.
 *
 * Architecture:
 *   DOM Element ←→ WidgetBinding ←→ AtomObj ←→ store ←→ WS ←→ other clients
 *
 * When the user types in an input, the AtomObj updates.
 * When the AtomObj changes (from WS, from another widget, from an agent), the DOM updates.
 *
 * Usage:
 *   const binding = new WidgetBinding(store, 'user-1', {
 *     nameInput:  { key: 'name',   dir: 'sync' },
 *     statusBadge: { key: 'status', dir: 'read', toWidget: v => v.toUpperCase() },
 *   });
 *
 *   binding.bindInput('nameInput', document.getElementById('name-field'));
 *   binding.bindText('statusBadge', document.getElementById('status-badge'));
 *
 *   // Later:
 *   binding.destroy(); // unsubscribes everything
 */

import type { AtomObj, OnChangeInfo } from '../core/AtomObj.ts';
import type { ElementStore } from '../core/ElementStore.ts';

// ─── Types ────────────────────────────────────────────────────────

export type BindDir = 'read' | 'write' | 'sync';

export interface PropMapping {
  /** AtomObj property key */
  key: string;
  /** Direction: read = obj→dom, write = dom→obj, sync = both */
  dir: BindDir;
  /** Default value when obj property is null/undefined */
  default?: unknown;
  /** Transform obj value → display value */
  toWidget?: (v: unknown) => unknown;
  /** Transform display value → obj value */
  toElement?: (v: unknown) => unknown;
}

export type WidgetMappings = Record<string, PropMapping>;

interface BoundWidget {
  localName: string;
  el: HTMLElement;
  type: 'input' | 'text' | 'html' | 'attr' | 'style' | 'class' | 'custom';
  attr?: string;
  styleProp?: string;
  className?: string;
  render?: (el: HTMLElement, value: unknown) => void;
  teardown?: () => void;
}

// ─── WidgetBinding ────────────────────────────────────────────────

export class WidgetBinding {
  store: ElementStore;
  elementId: string | null;
  mappings: WidgetMappings;

  private _obj: AtomObj | null = null;
  private _widgets: BoundWidget[] = [];
  private _unsubscribe: (() => void) | null = null;
  private _storeUnsub: (() => void) | null = null;

  constructor(store: ElementStore, elementId: string | null, mappings: WidgetMappings) {
    this.store = store;
    this.elementId = elementId;
    this.mappings = mappings;
    this._attach();
  }

  // ─── Public API ──────────────────────────────────────────────

  /** Get current value for a mapped property */
  get(localName: string): unknown {
    const mapping = this.mappings[localName];
    if (!mapping || !this._obj) return mapping?.default;
    let raw = (this._obj as any)[mapping.key];
    if (raw === undefined || raw === null) raw = mapping.default;
    return mapping.toWidget ? mapping.toWidget(raw) : raw;
  }

  /** Set a value on the AtomObj (goes through proxy → onChange → all subscribers) */
  set(localName: string, value: unknown): void {
    if (!this._obj) return;
    const mapping = this.mappings[localName];
    if (!mapping || mapping.dir === 'read') return;
    const elementValue = mapping.toElement ? mapping.toElement(value) : value;
    (this._obj as any)[mapping.key] = elementValue;
  }

  /** Set multiple values atomically */
  setMany(updates: Record<string, unknown>): void {
    if (!this._obj) return;
    const objUpdates: Record<string, unknown> = {};
    for (const [localName, value] of Object.entries(updates)) {
      const mapping = this.mappings[localName];
      if (!mapping || mapping.dir === 'read') continue;
      objUpdates[mapping.key] = mapping.toElement ? mapping.toElement(value) : value;
    }
    if (Object.keys(objUpdates).length > 0) {
      this._obj.update(objUpdates);
    }
  }

  /** Get all readable values as a map */
  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const localName of Object.keys(this.mappings)) {
      if (this.mappings[localName].dir !== 'write') {
        result[localName] = this.get(localName);
      }
    }
    return result;
  }

  /** The bound AtomObj (null if not found) */
  get element(): AtomObj | null {
    return this._obj;
  }

  /** Switch to a different element */
  rebind(elementId: string | null): void {
    this._detach();
    this.elementId = elementId;
    this._attach();
    this._syncAllWidgets();
  }

  /** Clean up all bindings and subscriptions */
  destroy(): void {
    this._detach();
    for (const w of this._widgets) {
      if (w.teardown) w.teardown();
    }
    this._widgets = [];
  }

  // ─── Bind DOM Elements ──────────────────────────────────────

  /**
   * Bind an <input>, <textarea>, or <select> — two-way sync.
   * Reads value from obj on attach, writes back on 'input'/'change' events.
   */
  bindInput(localName: string, el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
    const mapping = this.mappings[localName];
    if (!mapping) return;

    const handler = () => {
      if (mapping.dir === 'read') return;
      const val = el.type === 'checkbox' ? (el as HTMLInputElement).checked : el.value;
      this.set(localName, val);
    };

    const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventName, handler);

    // Initial sync
    this._pushToInput(localName, el);

    this._widgets.push({
      localName, el, type: 'input',
      teardown: () => el.removeEventListener(eventName, handler),
    });
  }

  /**
   * Bind any element's textContent — read-only by default.
   * Updates when obj property changes.
   */
  bindText(localName: string, el: HTMLElement): void {
    el.textContent = String(this.get(localName) ?? '');
    this._widgets.push({ localName, el, type: 'text' });
  }

  /**
   * Bind any element's innerHTML — read-only.
   */
  bindHtml(localName: string, el: HTMLElement): void {
    el.innerHTML = String(this.get(localName) ?? '');
    this._widgets.push({ localName, el, type: 'html' });
  }

  /**
   * Bind a DOM attribute (e.g., 'disabled', 'src', 'href').
   */
  bindAttr(localName: string, el: HTMLElement, attr: string): void {
    const val = this.get(localName);
    if (val === false || val === null || val === undefined) {
      el.removeAttribute(attr);
    } else {
      el.setAttribute(attr, String(val));
    }
    this._widgets.push({ localName, el, type: 'attr', attr });
  }

  /**
   * Bind a CSS style property (e.g., 'left', 'width', 'backgroundColor').
   */
  bindStyle(localName: string, el: HTMLElement, styleProp: string): void {
    (el.style as any)[styleProp] = String(this.get(localName) ?? '');
    this._widgets.push({ localName, el, type: 'style', styleProp });
  }

  /**
   * Toggle a CSS class based on a boolean property.
   */
  bindClass(localName: string, el: HTMLElement, className: string): void {
    el.classList.toggle(className, !!this.get(localName));
    this._widgets.push({ localName, el, type: 'class', className });
  }

  /**
   * Custom binding — provide your own render function.
   * Called on initial bind and on every property change.
   */
  bindCustom(localName: string, el: HTMLElement, render: (el: HTMLElement, value: unknown) => void): void {
    render(el, this.get(localName));
    this._widgets.push({ localName, el, type: 'custom', render });
  }

  // ─── Internal ───────────────────────────────────────────────

  private _attach(): void {
    this._obj = this.elementId ? this.store.getObject(this.elementId) : null;

    if (this._obj) {
      // Subscribe to property changes
      this._unsubscribe = this._obj.subscribe(() => {
        this._syncAllWidgets();
      });
    }

    // Subscribe to store for new objects (if elementId not found yet)
    if (!this._obj && this.elementId) {
      this._storeUnsub = this.store.subscribe(() => {
        const obj = this.store.getObject(this.elementId!);
        if (obj && obj !== this._obj) {
          this._obj = obj;
          if (this._storeUnsub) { this._storeUnsub(); this._storeUnsub = null; }
          this._unsubscribe = this._obj.subscribe(() => this._syncAllWidgets());
          this._syncAllWidgets();
        }
      });
    }
  }

  private _detach(): void {
    if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
    if (this._storeUnsub) { this._storeUnsub(); this._storeUnsub = null; }
    this._obj = null;
  }

  private _syncAllWidgets(): void {
    for (const w of this._widgets) {
      const val = this.get(w.localName);
      switch (w.type) {
        case 'input':
          this._pushToInput(w.localName, w.el as HTMLInputElement);
          break;
        case 'text':
          w.el.textContent = String(val ?? '');
          break;
        case 'html':
          w.el.innerHTML = String(val ?? '');
          break;
        case 'attr':
          if (val === false || val === null || val === undefined) {
            w.el.removeAttribute(w.attr!);
          } else {
            w.el.setAttribute(w.attr!, String(val));
          }
          break;
        case 'style':
          (w.el.style as any)[w.styleProp!] = String(val ?? '');
          break;
        case 'class':
          w.el.classList.toggle(w.className!, !!val);
          break;
        case 'custom':
          if (w.render) w.render(w.el, val);
          break;
      }
    }
  }

  private _pushToInput(localName: string, el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
    const val = this.get(localName);
    if (el.type === 'checkbox') {
      (el as HTMLInputElement).checked = !!val;
    } else {
      el.value = val !== null && val !== undefined ? String(val) : '';
    }
  }
}

/**
 * Shorthand: create a WidgetBinding and auto-bind all mapped elements by data attribute.
 *
 * Usage:
 *   <input data-bind="nameInput" />
 *   <span data-bind-text="statusBadge"></span>
 *
 *   autobind(store, 'user-1', container, {
 *     nameInput:   { key: 'name',   dir: 'sync' },
 *     statusBadge: { key: 'status', dir: 'read' },
 *   });
 */
export function autobind(
  store: ElementStore,
  elementId: string,
  container: HTMLElement,
  mappings: WidgetMappings,
): WidgetBinding {
  const binding = new WidgetBinding(store, elementId, mappings);

  // Auto-bind inputs by data-bind attribute
  container.querySelectorAll<HTMLInputElement>('[data-bind]').forEach(el => {
    const name = el.dataset.bind!;
    if (mappings[name]) binding.bindInput(name, el);
  });

  // Auto-bind text by data-bind-text
  container.querySelectorAll<HTMLElement>('[data-bind-text]').forEach(el => {
    const name = el.dataset.bindText!;
    if (mappings[name]) binding.bindText(name, el);
  });

  // Auto-bind html by data-bind-html
  container.querySelectorAll<HTMLElement>('[data-bind-html]').forEach(el => {
    const name = el.dataset.bindHtml!;
    if (mappings[name]) binding.bindHtml(name, el);
  });

  // Auto-bind attributes by data-bind-attr="localName:attrName"
  container.querySelectorAll<HTMLElement>('[data-bind-attr]').forEach(el => {
    const spec = el.dataset.bindAttr!;
    const [name, attr] = spec.split(':');
    if (mappings[name] && attr) binding.bindAttr(name, el, attr);
  });

  return binding;
}
