/**
 * @es-client/react — React binding hooks for ElementStore
 *
 * Import from '@es-client/react' (with Vite alias) or '@agura/es-client/react'.
 *
 * See USAGE_EXAMPLE.md for full patterns.
 */

export { useAtomObj, useAtomObjs, useStoreInitialized, useStoreFind, useAtomObjProperty } from './useAtomObj.ts';
export { useWidgetBinding } from './useWidgetBinding.ts';
export type { BindDir, PropMapping, WidgetMappings, WidgetBindingResult } from './useWidgetBinding.ts';

// DraggableDialog — reusable dialog shell (draggable, resizable, dockable)
export { DraggableDialog, Z_INDEX } from './DraggableDialog.tsx';
export type { DraggableDialogProps, DockPosition } from './DraggableDialog.tsx';

// DockLayoutContext — coordinates docked panel positioning
export { DockLayoutProvider, useDockOffsets, useDockLayoutReporter } from './DockLayoutContext.tsx';
