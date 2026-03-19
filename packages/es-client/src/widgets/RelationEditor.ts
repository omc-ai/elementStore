/**
 * RelationEditor — Manage relation field editing
 *
 * Handles option loading, resolution, multiplicity, and filter_by logic
 * for relation-type properties. Framework-agnostic — both admin and architect use this.
 *
 * Usage:
 *   const editor = new RelationEditor(store, boundProp);
 *   const options = await editor.getOptions();
 *   const resolved = await editor.resolve('user-123');
 */

import type { ElementStore } from '../core/ElementStore.ts';
import type { BoundProperty } from './PropertyResolver.ts';

export class RelationEditor {
  store: ElementStore;
  prop: BoundProperty;

  constructor(store: ElementStore, prop: BoundProperty) {
    this.store = store;
    this.prop = prop;
  }

  /**
   * Get available options for this relation field.
   * Queries the store for objects of the target class.
   */
  async getOptions(): Promise<{ id: string; label: string }[]> {
    const targetClassId = this.prop.objectClassId?.[0];
    if (!targetClassId) return [];

    // Collect all objects in the store that match the target class
    const results: { id: string; label: string }[] = [];

    for (const [id, obj] of Object.entries(this.store.objects)) {
      const data = obj.data;
      if (!data) continue;

      // Match by class_id (direct or via inheritance)
      if (data.class_id === targetClassId || this.store.classExtends(data.class_id as string, targetClassId)) {
        results.push({
          id: id,
          label: (data.name as string) || (data.label as string) || id,
        });
      }
    }

    // Sort by label
    results.sort((a, b) => a.label.localeCompare(b.label));

    return results;
  }

  /**
   * Resolve a relation ID to the full object data.
   */
  async resolve(id: string): Promise<unknown> {
    const obj = this.store.getObject(id);
    return obj?.data || null;
  }

  /**
   * Whether this relation allows multiple selections.
   */
  isMultiple(): boolean {
    const isArray = this.prop.isArray;
    return isArray === true || isArray === 'indexed';
  }

  /**
   * Apply filter_by from prop options to filter candidate options.
   *
   * filter_by: { field: 'data_types', source: 'data_type' }
   * Means: keep candidates where candidate[field] includes/equals contextData[source]
   *
   * @param options - Candidate options (objects with at least an id)
   * @param contextData - The current object's data (to read the source field from)
   */
  filterOptions(options: any[], contextData: Record<string, unknown>): any[] {
    const propOptions = this.prop.options as Record<string, unknown> | null;
    if (!propOptions) return options;

    const filterBy = propOptions.filter_by as { field: string; source: string } | undefined;
    if (!filterBy) return options;

    const sourceValue = contextData[filterBy.source];
    if (sourceValue === null || sourceValue === undefined) return options;

    return options.filter(opt => {
      // Resolve the candidate object from the store to read its field
      const candidateObj = this.store.getObject(opt.id);
      if (!candidateObj) return true; // keep if we can't resolve

      const fieldValue = candidateObj.data?.[filterBy.field];
      if (fieldValue === null || fieldValue === undefined) return false;

      // If field value is an array, check if it includes the source value
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(sourceValue);
      }

      // Direct equality
      return fieldValue === sourceValue;
    });
  }
}
