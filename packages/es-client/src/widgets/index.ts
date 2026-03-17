/**
 * @agura/es-client/widgets — Native JS widget bindings (no framework dependency)
 *
 * Three modules:
 * 1. WidgetBinding — DOM ↔ AtomObj two-way binding
 * 2. PropertyResolver — Resolve props with schema, defaults, flags
 * 3. FunctionProxy — Bind function-type props as callables
 */

export { WidgetBinding, autobind } from './WidgetBinding.ts';
export type { PropMapping, WidgetMappings, BindDir } from './WidgetBinding.ts';

export { resolveProperties, groupProperties } from './PropertyResolver.ts';
export type { BoundProperty } from './PropertyResolver.ts';

export { registerFunction, getFunction, listFunctions, executeFunction, bindFunctions } from './FunctionProxy.ts';
