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

export { resolveEditor, resolveEditors } from './EditorResolver.ts';
export type { ResolvedEditor, EditorType } from './EditorResolver.ts';

export { toPropertyDefinition, toPropertyDefinitions, toAdminProp } from './adapters.ts';
export type { PropertyDefinition } from './adapters.ts';

export { getEditorLayout, getNestingStyle, columnWidths, ColumnWidthState, INDENT_PER_LEVEL, DEFAULT_COLUMNS, MIN_COLUMNS } from './EditorLayout.ts';
export type { EditorColumnLayout, NestingStyle } from './EditorLayout.ts';

export { EditorState, MAX_NESTING_DEPTH } from './EditorState.ts';

export { RelationEditor } from './RelationEditor.ts';
