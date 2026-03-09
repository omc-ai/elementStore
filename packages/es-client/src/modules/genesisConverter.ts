/**
 * Genesis Converter — Converts nested genesis.json to flat seed format
 *
 * Native format: plain JSON array of class objects [{ id, props: [...] }, ...]
 * Legacy format: { "classes": [...] } or { "@class": [...] }
 * The flat format used by the store is: { "classId": {...}, "classId.propKey": {...} }
 *
 * This converter produces the flat format so store.seed(flatGenesis) works directly.
 */

import type { RawData } from '../core/AtomObj.ts';

export interface GenesisFile {
  // Legacy wrapped formats (backwards-compatible)
  classes?: GenesisClass[];
  '@class'?: GenesisClass[];
}

export interface GenesisClass {
  id: string;
  class_id: string;
  name?: string;
  namespace_id?: string;
  extends_id?: string | null;
  is_abstract?: boolean;
  is_container?: boolean;
  is_system?: boolean;
  is_seed?: boolean;
  icon?: string;
  color?: string;
  description?: string;
  props?: GenesisProp[];
  defaults?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GenesisProp {
  key: string;
  data_type?: string;
  is_array?: boolean;
  object_class_id?: string;
  object_class_strict?: boolean;
  on_orphan?: string;
  options?: unknown;
  editor?: unknown;
  validators?: unknown;
  enum_values?: string[];
  enum_allow_custom?: boolean;
  required?: boolean;
  readonly?: boolean;
  default_value?: unknown;
  display_order?: number;
  group_name?: string;
  hidden?: boolean;
  description?: string;
  [key: string]: unknown;
}

/**
 * Convert genesis data to flat { id: rawObject } format.
 *
 * Accepts plain array (native) or legacy wrapped object.
 * Each class becomes a top-level object with its class-level metadata.
 * Each prop becomes a top-level object keyed by "classId.propKey".
 * The `props` array is stripped from the class object (props are standalone).
 */
export function flattenGenesis(genesis: GenesisClass[] | GenesisFile): Record<string, RawData> {
  const flat: Record<string, RawData> = {};
  const classes = Array.isArray(genesis)
    ? genesis
    : (genesis.classes || genesis['@class'] || []);

  for (const cls of classes) {
    const { props, defaults, ...classFields } = cls;

    // Store the class definition (without nested props/defaults arrays)
    flat[cls.id] = {
      ...classFields,
      class_id: '@class',
    };

    // If defaults exist, merge them as top-level fields on the class
    // (so getResolvedDefaults can access them)
    if (defaults) {
      flat[cls.id].defaults = defaults;
    }

    // Flatten each prop into a top-level object: "classId.propKey"
    if (props && Array.isArray(props)) {
      for (const prop of props) {
        const propId = `${cls.id}.${prop.key}`;
        flat[propId] = {
          id: propId,
          class_id: '@prop',
          ...prop,
        };
      }
    }
  }

  return flat;
}
