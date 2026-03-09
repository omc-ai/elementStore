/**
 * useWidgetBinding — Declarative property binding between widgets and elements
 *
 * Takes a store, an element ID, and a mapping table.
 * Returns reactive values and setters.
 *
 * Mapping directions:
 *   'read'  — element → widget only (widget cannot write back)
 *   'write' — widget → element only (no reactive value returned)
 *   'sync'  — bidirectional (read + write)
 *
 * Usage:
 *   const { values, set, setMany } = useWidgetBinding(store, elementId, MAPPINGS);
 *   const zoom = values.zoom;
 *   set('zoom', 1.5);
 */

import { useCallback, useMemo } from 'react';
import type { AtomObj } from '../core/AtomObj.ts';
import type { ElementStore } from '../core/ElementStore.ts';
import { useAtomObj } from './useAtomObj.ts';

/** Direction of data flow */
export type BindDir = 'read' | 'write' | 'sync';

/** Single property mapping rule */
export interface PropMapping {
  /** Element property key (read/written via Proxy) */
  key: string;
  /** 'read' = element→widget only, 'write' = widget→element only, 'sync' = both */
  dir: BindDir;
  /** Default value if element property is undefined or null */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default?: any;
  /** Transform element value → widget value (applied on read) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toWidget?: (v: any) => any;
  /** Transform widget value → element value (applied on write) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toElement?: (v: any) => any;
}

/** Mapping table: localWidgetName → PropMapping */
export type WidgetMappings = Record<string, PropMapping>;

/** Hook return value */
export interface WidgetBindingResult {
  /** All readable mapped property values, keyed by local widget name */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: Record<string, any>;
  /** Write a single property by local widget name */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (localName: string, value: any) => void;
  /** Write multiple properties atomically (single element.update() call) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setMany: (updates: Record<string, any>) => void;
  /** The bound element (null if not found) */
  element: AtomObj | null;
}

/**
 * Bind a widget to an element's properties using a declarative mapping table.
 *
 * @param store     - Your ElementStore instance
 * @param elementId - The element to bind to (or null/undefined)
 * @param mappings  - Property mapping rules
 */
export function useWidgetBinding(
  store: ElementStore,
  elementId: string | null | undefined,
  mappings: WidgetMappings,
): WidgetBindingResult {
  const element = useAtomObj(store, elementId);

  // Compute readable values from element via Proxy
  const values = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {};

    for (const [localName, mapping] of Object.entries(mappings)) {
      if (mapping.dir === 'write') continue; // write-only — skip

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let raw: any;
      if (element) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw = (element as any)[mapping.key];
      }

      // Apply default if undefined or null
      if (raw === undefined || raw === null) {
        raw = mapping.default;
      }

      result[localName] = mapping.toWidget ? mapping.toWidget(raw) : raw;
    }

    return result;
  }, [element, mappings]);

  // Write a single property
  const set = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (localName: string, value: any) => {
      if (!element) return;
      const mapping = mappings[localName];
      if (!mapping || mapping.dir === 'read') return;
      const elementValue = mapping.toElement ? mapping.toElement(value) : value;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (element as any)[mapping.key] = elementValue;
    },
    [element, mappings],
  );

  // Write multiple properties atomically
  const setMany = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updates: Record<string, any>) => {
      if (!element) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elementUpdates: Record<string, any> = {};
      for (const [localName, value] of Object.entries(updates)) {
        const mapping = mappings[localName];
        if (!mapping || mapping.dir === 'read') continue;
        elementUpdates[mapping.key] = mapping.toElement ? mapping.toElement(value) : value;
      }
      if (Object.keys(elementUpdates).length > 0) {
        element.update(elementUpdates);
      }
    },
    [element, mappings],
  );

  return { values, set, setMany, element };
}
