/**
 * @es-client — ElementStore client package
 *
 * Barrel export: everything from core/, storage/, actions/, modules/, and types.
 */

// Types (shared between all layers)
export * from './types.ts';

// Core classes
export * from './core/AtomObj.ts';
export * from './core/AtomCollection.ts';
export * from './core/AtomProp.ts';
export * from './core/AtomClass.ts';
export * from './core/ElementStore.ts';

// Storage
export * from './storage/AtomStorage.ts';
export * from './storage/ProxyStorage.ts';

// Actions
export * from './actions/ActionExecutor.ts';

// Modules
export * from './modules/classRegistry.ts';
export * from './modules/genesisConverter.ts';
export * from './modules/ElementStoreClient.ts';

// Widgets (native DOM binding — no framework dependency)
export * from './widgets/WidgetBinding.ts';
export * from './widgets/PropertyResolver.ts';
export * from './widgets/FunctionProxy.ts';
