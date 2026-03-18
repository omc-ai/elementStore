/**
 * Adapters — Bridge between BoundProperty and framework-specific editor types
 *
 * These are temporary bridges. The goal is for all editors (admin vanilla JS,
 * architect React) to consume BoundProperty directly. Until then, these
 * adapters convert BoundProperty to the format each client expects.
 */

import type { BoundProperty } from './PropertyResolver.ts';
import type { ResolvedEditor } from './EditorResolver.ts';

// ─── For cwm-architect's ValueEditor ─────────────────────────────

export interface PropertyDefinition {
  key: string;
  label: string;
  type: string;
  options?: string[];
  default?: unknown;
  required?: boolean;
  readonly?: boolean;
  placeholder?: string;
  group?: string;
  order?: number;
  description?: string;
  objectClassId?: string;
}

/**
 * Convert BoundProperty → PropertyDefinition for architect's ValueEditor
 */
export function toPropertyDefinition(bp: BoundProperty): PropertyDefinition {
  // Map data type
  let type = bp.dataType;
  if (bp.isArray && bp.isArray !== 'false') type = 'array';
  if (type === 'integer' || type === 'float') type = 'number';

  // Extract enum values from options
  const opts = bp.options as any;
  let options: string[] | undefined;
  if (opts?.values) {
    options = Array.isArray(opts.values) ? opts.values : Object.keys(opts.values);
    if (options.length > 0) type = 'select';
  }

  const editorConfig = typeof bp.editor === 'object' ? bp.editor as Record<string, unknown> : {};

  return {
    key: bp.key,
    label: bp.label,
    type,
    options,
    default: bp.value,
    required: bp.required,
    readonly: bp.readonly,
    placeholder: editorConfig?.placeholder as string,
    group: bp.groupName,
    order: bp.displayOrder,
    description: bp.description,
    objectClassId: bp.objectClassId?.[0],
  };
}

/**
 * Convert array of BoundProperty → grouped PropertyDefinitions
 */
export function toPropertyDefinitions(props: BoundProperty[]): PropertyDefinition[] {
  return props.filter(p => !p.hidden).map(toPropertyDefinition);
}

// ─── For admin vanilla JS ────────────────────────────────────────

/**
 * Convert BoundProperty → raw prop object for admin's geField/geInput
 */
export function toAdminProp(bp: BoundProperty): Record<string, unknown> {
  return {
    key: bp.key,
    label: bp.label,
    description: bp.description,
    data_type: bp.dataType,
    is_array: bp.isArray,
    editor: bp.editor,
    options: bp.options,
    object_class_id: bp.objectClassId,
    display_order: bp.displayOrder,
    flags: {
      required: bp.required || undefined,
      readonly: bp.readonly || undefined,
      hidden: bp.hidden || undefined,
    },
    default_value: bp.schema?.default_value,
  };
}
