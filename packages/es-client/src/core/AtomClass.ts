/**
 * AtomClass — Class definition object
 *
 * Direct TypeScript port of element-store.js AtomClass.
 * Elements with class_id === '@class' are class definitions.
 */

import { AtomObj, type RawData } from './AtomObj.ts';
import type { ElementStore } from './ElementStore.ts';

export class AtomClass extends AtomObj {
  static override CLASS_ID = '@class';

  constructor(raw: RawData | string, store?: ElementStore) {
    super(raw, store);
  }

  /** Returns all @prop objects for this class (including inherited via extends_id) */
  override getProps(): AtomObj[] {
    if (!this.store) return [];
    return this.store.collectClassProps(this.data.id);
  }
}
