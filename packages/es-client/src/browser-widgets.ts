/**
 * browser-widgets.ts — IIFE entry for element-store-widgets.js
 *
 * Extends the core IIFE (element-store.js) with native DOM widget bindings.
 * Load AFTER element-store.js:
 *
 *   <script src="/elementStore/admin/dist/element-store.js"></script>
 *   <script src="/elementStore/admin/dist/element-store-widgets.js"></script>
 *
 * Exposes: window.WidgetBinding, window.autobind
 */

import { WidgetBinding, autobind } from './widgets/WidgetBinding.ts';

const w = window as Record<string, unknown>;

w['WidgetBinding'] = WidgetBinding;
w['autobind'] = autobind;
