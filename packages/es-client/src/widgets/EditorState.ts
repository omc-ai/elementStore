/**
 * EditorState — Headless state machine for editing an object
 *
 * Framework-agnostic: both admin (vanilla JS) and architect (React) consume this.
 * Manages property resolution, editor resolution, nesting depth, display labels,
 * child creation, and template formatting for a single object being edited.
 *
 * Usage:
 *   const state = new EditorState(store, 'my:class', data);
 *   state.properties.forEach(p => console.log(p.key, p.value));
 *   state.editors.forEach(e => console.log(e.type, e.editorId));
 *
 *   // Nested editing
 *   if (state.canGoDeeper()) {
 *     const child = state.createChild(prop, value);
 *   }
 */

import type { ElementStore } from '../core/ElementStore.ts';
import { AtomObj } from '../core/AtomObj.ts';
import { resolveProperties, type BoundProperty } from './PropertyResolver.ts';
import { resolveEditors, type ResolvedEditor } from './EditorResolver.ts';

// ─── Constants ────────────────────────────────────────────────────

export const MAX_NESTING_DEPTH = 20;

// ─── EditorState ──────────────────────────────────────────────────

export class EditorState {
  store: ElementStore;
  classId: string;
  data: Record<string, unknown>;
  path: string;
  level: number;
  properties: BoundProperty[];
  editors: ResolvedEditor[];
  parent: EditorState | null;

  constructor(
    store: ElementStore,
    classId: string,
    data: Record<string, unknown>,
    path: string = '',
    level: number = 0,
    parent: EditorState | null = null,
  ) {
    this.store = store;
    this.classId = classId;
    this.data = data;
    this.path = path;
    this.level = level;
    this.parent = parent;

    // Resolve properties: if the object is already in the store, use it directly.
    // Otherwise, create a temporary AtomObj in memory (no persistence, no subscribers).
    const objId = data.id as string;
    const existingObj = objId ? store.objects[objId] : null;

    if (existingObj) {
      this.properties = resolveProperties(store, existingObj);
    } else {
      // Create a lightweight temporary AtomObj — inject into store.objects directly
      // to avoid setObject() side effects (storage persist, subscriber notifications).
      const tempId = `__es_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const rawData = { ...data, id: tempId, class_id: classId };
      const tempObj = new AtomObj(rawData, store);
      store.objects[tempId] = tempObj;

      this.properties = resolveProperties(store, tempObj);

      // Clean up — remove temp object from store
      delete store.objects[tempId];
    }

    this.editors = resolveEditors(store, this.properties);
  }

  // ─── Computed ─────────────────────────────────────────────────

  /** Whether nesting can go one level deeper */
  canGoDeeper(): boolean {
    return this.level < MAX_NESTING_DEPTH;
  }

  /** Warning message if approaching or at max depth, null otherwise */
  getDepthWarning(): string | null {
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
  createChild(prop: BoundProperty, value: unknown): EditorState | null {
    if (!this.canGoDeeper()) return null;

    const childClassId = prop.objectClassId?.[0];
    if (!childClassId) return null;

    const childData = (value && typeof value === 'object' && !Array.isArray(value))
      ? (value as Record<string, unknown>)
      : {};

    const childPath = this.path ? `${this.path}.${prop.key}` : prop.key;

    return new EditorState(
      this.store,
      childClassId,
      childData,
      childPath,
      this.level + 1,
      this,
    );
  }

  /**
   * Create child EditorState instances for each item in an array property.
   * Skips items that would exceed max depth.
   */
  createArrayChildren(prop: BoundProperty, items: unknown[]): EditorState[] {
    if (!this.canGoDeeper()) return [];

    const childClassId = prop.objectClassId?.[0];
    if (!childClassId) return [];

    const results: EditorState[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const childData = (item && typeof item === 'object' && !Array.isArray(item))
        ? (item as Record<string, unknown>)
        : {};

      const childPath = this.path ? `${this.path}.${prop.key}[${i}]` : `${prop.key}[${i}]`;

      results.push(new EditorState(
        this.store,
        childClassId,
        childData,
        childPath,
        this.level + 1,
        this,
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
  static formatTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      const val = data[key];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return Array.isArray(val) ? `[${val.length}]` : '{...}';
      return String(val);
    });
  }

  // ─── Display helpers ──────────────────────────────────────────

  /**
   * Get the display label for this object.
   * Checks class context for a label_template, falls back to name or first string prop.
   */
  getDisplayLabel(contextName?: string): string {
    const classDef = this.store.getClassSafe(this.classId);
    if (!classDef) return (this.data.name as string) || (this.data.id as string) || this.classId;

    // Check context for label_template
    if (contextName) {
      const contexts = classDef.data?.contexts as Record<string, Record<string, unknown>> | undefined;
      const ctx = contexts?.[contextName];
      if (ctx?.label_template && typeof ctx.label_template === 'string') {
        return EditorState.formatTemplate(ctx.label_template, this.data);
      }
    }

    // Fall back to name field
    if (this.data.name && typeof this.data.name === 'string') {
      return this.data.name;
    }

    // Fall back to first string property value
    for (const prop of this.properties) {
      if (prop.dataType === 'string' && prop.value && typeof prop.value === 'string') {
        return prop.value;
      }
    }

    return (this.data.id as string) || this.classId;
  }

  /**
   * Get the children field name from class context (for tree structures).
   * Returns null if no children field is defined.
   */
  getChildrenField(contextName?: string): string | null {
    const classDef = this.store.getClassSafe(this.classId);
    if (!classDef) return null;

    const contexts = classDef.data?.contexts as Record<string, Record<string, unknown>> | undefined;
    if (!contexts) return null;

    // Check named context first, then 'default'
    const ctx = (contextName ? contexts[contextName] : null) || contexts['default'];
    if (ctx?.children_field && typeof ctx.children_field === 'string') {
      return ctx.children_field;
    }

    return null;
  }

  /**
   * Resolve a class selector: given a field key and the current value,
   * look up options.values (assoc map) to find the target class_id.
   * Returns null if no mapping found.
   */
  resolveClassSelector(fieldKey: string, value: string): string | null {
    const prop = this.properties.find(p => p.key === fieldKey);
    if (!prop) return null;

    const options = prop.options as Record<string, unknown> | null;
    if (!options) return null;

    const values = options.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return null;

    const classMap = values as Record<string, string>;
    return classMap[value] || null;
  }
}
