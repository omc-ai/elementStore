/**
 * Class Registry — maps class IDs to JS constructors
 *
 * When AtomObj is created with `new AtomObj(raw, store)`, the factory checks
 * this registry (via store.resolveConstructor) to find the correct subclass.
 * Registration walks the extends_id chain, so registering 'ui:element' also
 * covers 'ui:dialog' (if ui:dialog extends ui:element and has no own constructor).
 */

import type { AtomObjConstructor } from '../core/AtomObj.ts';

export const classRegistry: Map<string, AtomObjConstructor> = new Map();

/**
 * Register a JS constructor for a class_id.
 * When objects of this class (or subclasses without their own registration) are
 * created, the factory will use this constructor instead of plain AtomObj.
 */
export function registerClass(classId: string, Ctor: AtomObjConstructor): void {
  classRegistry.set(classId, Ctor);
}
