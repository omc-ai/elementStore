/**
 * useAtomObj — Generic React hooks for subscribing to AtomObj changes
 *
 * These hooks are store-agnostic: pass your ElementStore instance, or use
 * the React context variant via ElementStoreProvider.
 *
 * Pattern:
 *   const obj = useAtomObj(store, id);
 *   // obj re-renders whenever any property changes
 */

import { useEffect, useReducer } from 'react';
import type { AtomObj, OnChangeInfo } from '../core/AtomObj.ts';
import type { ElementStore } from '../core/ElementStore.ts';

/**
 * Subscribe to an AtomObj by ID.
 * Returns the object (or null if not found).
 * Re-renders whenever any property on the object changes.
 *
 * @param store  - Your ElementStore instance
 * @param id     - The object's _id (or null/undefined to skip)
 */
export function useAtomObj(store: ElementStore, id: string | null | undefined): AtomObj | null {
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  const obj = id ? store.getObject(id) : null;

  useEffect(() => {
    if (!obj) return;

    const handler = (_info: OnChangeInfo) => {
      forceRender();
    };

    obj._onChange.push(handler);

    return () => {
      const idx = obj._onChange.indexOf(handler);
      if (idx >= 0) obj._onChange.splice(idx, 1);
    };
  }, [obj]);

  return obj;
}

/**
 * Subscribe to multiple AtomObjs by IDs.
 * Re-renders when any of them change.
 *
 * @param store - Your ElementStore instance
 * @param ids   - Array of object IDs to subscribe to
 */
export function useAtomObjs(store: ElementStore, ids: string[]): AtomObj[] {
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  const objs = ids
    .map(id => store.getObject(id))
    .filter((o): o is AtomObj => o !== null);

  useEffect(() => {
    const handler = () => forceRender();

    for (const obj of objs) {
      obj._onChange.push(handler);
    }

    return () => {
      for (const obj of objs) {
        const idx = obj._onChange.indexOf(handler);
        if (idx >= 0) obj._onChange.splice(idx, 1);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  return objs;
}

/**
 * Subscribe to the store's initialization state.
 * Re-renders when the store becomes initialized (or resets).
 *
 * @param store - Your ElementStore instance
 */
export function useStoreInitialized(store: ElementStore): boolean {
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    return store.subscribe(() => forceRender());
  }, [store]);

  return store.initialized;
}

/**
 * Find objects in the store matching a filter, with subscription.
 * Re-renders whenever the store changes.
 *
 * @param store  - Your ElementStore instance
 * @param filter - Key/value pairs to match against object data
 */
export function useStoreFind(store: ElementStore, filter: Record<string, unknown>): AtomObj[] {
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    return store.subscribe(() => forceRender());
  }, [store]);

  return store.find(filter);
}

/**
 * Get a single property value from an AtomObj, with targeted re-rendering.
 * Only re-renders when the specific property (or '*') changes — more efficient
 * than useAtomObj when you only need one property.
 *
 * @param store   - Your ElementStore instance
 * @param id      - The object's _id (or null/undefined to skip)
 * @param propKey - Property key to watch and return
 */
export function useAtomObjProperty(
  store: ElementStore,
  id: string | null | undefined,
  propKey: string,
): unknown {
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  const obj = id ? store.getObject(id) : null;

  useEffect(() => {
    if (!obj) return;

    const handler = (info: OnChangeInfo) => {
      if (info.prop === propKey || info.prop === '*') {
        forceRender();
      }
    };

    obj._onChange.push(handler);

    return () => {
      const idx = obj._onChange.indexOf(handler);
      if (idx >= 0) obj._onChange.splice(idx, 1);
    };
  }, [obj, propKey]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return obj ? (obj as any)[propKey] : undefined;
}
