/**
 * EditorResolver — Resolve the editor widget for a property
 *
 * Given a BoundProperty, determines:
 * - Which editor widget to use (from prop.editor.id or default by data_type)
 * - Whether to nest (object/relation with class → property editor)
 * - Whether to use grid (array + editor.id === 'grid')
 * - Editor config (inline options from prop.editor)
 *
 * This is pure logic — no DOM, no React. Both admin (vanilla JS) and
 * architect (React) consume this to decide what to render.
 *
 * Usage:
 *   const resolved = resolveEditor(store, boundProp);
 *   // resolved.type === 'input' | 'property-editor' | 'grid' | 'custom'
 *   // resolved.editorId === 'text' | 'textarea' | 'select' | 'grid' | ...
 *   // resolved.config === { rows: 5, placeholder: '...' }  // inline editor options
 *   // resolved.childClassId === '@prop_string'  // for nested editors
 *   // resolved.items === [...]  // for grid, the array items
 */

import type { BoundProperty } from './PropertyResolver.ts';
import type { ElementStore } from '../core/ElementStore.ts';

// ─── Types ────────────────────────────────────────────────────────

export type EditorType = 'input' | 'property-editor' | 'grid' | 'obj-ref' | 'class-selector';

export interface ResolvedEditor {
  /** What kind of editor to render */
  type: EditorType;
  /** The @editor instance ID (text, textarea, select, grid, etc.) */
  editorId: string;
  /** Inline editor config from prop.editor (minus the id) */
  config: Record<string, unknown>;
  /** For nested editors: the target class ID */
  childClassId: string | null;
  /** For grid: is this an indexed array */
  isArray: boolean | string;
  /** For class-selector: the value→class_id map from options.values */
  classMap: Record<string, string> | null;
  /** The original BoundProperty */
  prop: BoundProperty;
}

// ─── Default editor by data type ──────────────────────────────────

const DEFAULT_EDITORS: Record<string, string> = {
  string: 'text',
  boolean: 'checkbox',
  integer: 'number',
  float: 'number',
  datetime: 'datetime',
  object: 'nested',
  relation: 'reference',
  function: 'code',
};

// ─── Resolver ─────────────────────────────────────────────────────

/**
 * Resolve which editor to use for a property.
 */
export function resolveEditor(store: ElementStore, prop: BoundProperty): ResolvedEditor {
  const editorObj = prop.editor;
  const editorId = getEditorId(editorObj) || DEFAULT_EDITORS[prop.dataType] || 'text';
  const config = getEditorConfig(editorObj);
  const childClassId = prop.objectClassId?.[0] || null;
  const isArray = prop.isArray;
  const values = (prop.options as any)?.values;

  // Class selector: options.values is an assoc map (object, not array)
  if (values && typeof values === 'object' && !Array.isArray(values)) {
    return {
      type: 'class-selector',
      editorId: 'select',
      config,
      childClassId,
      isArray,
      classMap: values as Record<string, string>,
      prop,
    };
  }

  // @obj_ref: dynamic typed value
  if (childClassId === '@obj_ref') {
    return {
      type: 'obj-ref',
      editorId: 'obj-ref',
      config,
      childClassId,
      isArray,
      classMap: null,
      prop,
    };
  }

  // Grid: explicit grid editor on an array with target class
  if (isArray && isArray !== 'false' && editorId === 'grid' && childClassId) {
    return {
      type: 'grid',
      editorId: 'grid',
      config,
      childClassId,
      isArray,
      classMap: null,
      prop,
    };
  }

  // Property editor: typed object (single or array without grid)
  if ((prop.dataType === 'object' || prop.dataType === 'relation') && childClassId) {
    if (isArray && isArray !== 'false') {
      // Array of typed objects — default inline list (unless grid editor set above)
      return {
        type: 'property-editor',
        editorId: 'property-editor',
        config,
        childClassId,
        isArray,
        classMap: null,
        prop,
      };
    }
    // Single typed object — nested property editor
    return {
      type: 'property-editor',
      editorId: 'property-editor',
      config,
      childClassId,
      isArray: false,
      classMap: null,
      prop,
    };
  }

  // Scalar input (text, number, boolean, select, etc.)
  return {
    type: 'input',
    editorId,
    config,
    childClassId: null,
    isArray,
    classMap: null,
    prop,
  };
}

/**
 * Resolve editors for all properties of an object.
 */
export function resolveEditors(store: ElementStore, props: BoundProperty[]): ResolvedEditor[] {
  return props.map(p => resolveEditor(store, p));
}

// ─── Helpers ──────────────────────────────────────────────────────

function getEditorId(editor: unknown): string | null {
  if (!editor) return null;
  if (typeof editor === 'string') return editor;
  if (typeof editor === 'object' && (editor as any).id) return (editor as any).id;
  return null;
}

function getEditorConfig(editor: unknown): Record<string, unknown> {
  if (!editor || typeof editor !== 'object') return {};
  const config = { ...(editor as Record<string, unknown>) };
  delete config.id;
  return config;
}
