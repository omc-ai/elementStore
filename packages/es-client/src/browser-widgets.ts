/**
 * browser-widgets.ts — IIFE entry for element-store-widgets.js
 *
 * Load AFTER element-store.js:
 *   <script src="/elementStore/admin/dist/element-store.js"></script>
 *   <script src="/elementStore/admin/dist/element-store-widgets.js"></script>
 *
 * Exposes on window:
 *   WidgetBinding, autobind          — DOM ↔ AtomObj binding
 *   resolveProperties, groupProperties — Schema-aware property resolution
 *   registerFunction, bindFunctions   — Function-type prop binding
 */

import { WidgetBinding, autobind } from './widgets/WidgetBinding.ts';
import { resolveProperties, groupProperties } from './widgets/PropertyResolver.ts';
import { registerFunction, getFunction, executeFunction, bindFunctions } from './widgets/FunctionProxy.ts';

const w = window as Record<string, unknown>;

// DOM binding
w['WidgetBinding'] = WidgetBinding;
w['autobind'] = autobind;

// Property resolution
w['resolveProperties'] = resolveProperties;
w['groupProperties'] = groupProperties;

// Function proxy
w['registerFunction'] = registerFunction;
w['getFunction'] = getFunction;
w['executeFunction'] = executeFunction;
w['bindFunctions'] = bindFunctions;
