/**
 * PropertyResolver — Resolve an AtomObj's properties with full schema metadata
 *
 * Given an object, walks its class definition + inheritance chain to produce
 * a list of BoundProperty entries with: value, schema, defaults, data_type, flags.
 *
 * This is the native (non-React) equivalent of cwm-architect's elementBinding.ts.
 * React hooks can wrap this; vanilla JS uses it directly.
 *
 * Usage:
 *   const props = resolveProperties(store, 'user-1');
 *   props.forEach(p => {
 *     console.log(p.key, p.value, p.dataType, p.required);
 *   });
 */

import type { AtomObj } from '../core/AtomObj.ts';
import type { ElementStore } from '../core/ElementStore.ts';

// ─── Types ────────────────────────────────────────────────────────

export interface BoundProperty {
  /** Property key (e.g., 'name', 'email') */
  key: string;
  /** Current value (from object data, or default if not set) */
  value: unknown;
  /** The @prop definition object (null if untyped/dynamic) */
  schema: Record<string, unknown> | null;
  /** True if using default_value (not explicitly set on this object) */
  isDefault: boolean;
  /** Data type: string, boolean, integer, float, datetime, object, relation, function */
  dataType: string;
  /** Label for UI display */
  label: string;
  /** Description / help text */
  description: string;
  /** Required flag */
  required: boolean;
  /** Readonly flag */
  readonly: boolean;
  /** Hidden flag */
  hidden: boolean;
  /** Display order for form layout */
  displayOrder: number;
  /** Group name for form sections */
  groupName: string;
  /** Editor ID or object */
  editor: unknown;
  /** Options (enum values, filter_by, relation config, etc.) */
  options: unknown;
  /** Is this an array property */
  isArray: boolean | string;
  /** Target class IDs (for relation/object props) */
  objectClassId: string[] | null;
}

// ─── Resolver ─────────────────────────────────────────────────────

/**
 * Resolve all properties for an AtomObj, including inherited props and defaults.
 *
 * @param store - ElementStore instance
 * @param objOrId - AtomObj instance or object ID string
 * @returns Array of BoundProperty with full metadata
 */
export function resolveProperties(store: ElementStore, objOrId: string | AtomObj): BoundProperty[] {
  const obj = typeof objOrId === 'string' ? store.getObject(objOrId) : objOrId;
  if (!obj) return [];

  const data = obj.data || {};
  const classId = data.class_id as string;
  if (!classId) return [];

  const propDefs = store.collectClassProps(classId);
  if (!propDefs || propDefs.length === 0) {
    // No class definition — return raw data keys
    return Object.entries(data)
      .filter(([k]) => k !== 'id' && k !== 'class_id' && !k.startsWith('_'))
      .map(([k, v]) => ({
        key: k, value: v, schema: null, isDefault: false,
        dataType: typeof v, label: k, description: '', required: false,
        readonly: false, hidden: false, displayOrder: 0, groupName: '',
        editor: null, options: null, isArray: false, objectClassId: null,
      }));
  }

  const defaults = store.getResolvedDefaults ? store.getResolvedDefaults(classId) : {};
  const result: BoundProperty[] = [];

  for (const propObj of propDefs) {
    const pd = propObj.data || propObj;
    const key = (pd.key as string);
    if (!key) continue;

    const hasOwnValue = key in data && data[key] !== undefined;
    const defaultValue = defaults[key] ?? pd.default_value;
    const flags = (pd.flags as Record<string, boolean>) || {};

    result.push({
      key,
      value: hasOwnValue ? data[key] : defaultValue,
      schema: pd,
      isDefault: !hasOwnValue,
      dataType: (pd.data_type as string) || 'string',
      label: (pd.label as string) || key,
      description: (pd.description as string) || '',
      required: flags.required || (pd.required as boolean) || false,
      readonly: flags.readonly || (pd.readonly as boolean) || false,
      hidden: flags.hidden || (pd.hidden as boolean) || false,
      displayOrder: (pd.display_order as number) || 0,
      groupName: (pd.group_name as string) || '',
      editor: pd.editor || null,
      options: pd.options || null,
      isArray: pd.is_array || false,
      objectClassId: normalizeClassIds(pd.object_class_id),
    });
  }

  // Sort by display_order
  result.sort((a, b) => a.displayOrder - b.displayOrder);

  return result;
}

/**
 * Group resolved properties by group_name.
 */
export function groupProperties(props: BoundProperty[]): Record<string, BoundProperty[]> {
  const groups: Record<string, BoundProperty[]> = {};
  for (const p of props) {
    const g = p.groupName || 'General';
    if (!groups[g]) groups[g] = [];
    groups[g].push(p);
  }
  return groups;
}

// ─── Helpers ──────────────────────────────────────────────────────

function normalizeClassIds(val: unknown): string[] | null {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) return val.length > 0 ? (val as string[]) : null;
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return null;
}
