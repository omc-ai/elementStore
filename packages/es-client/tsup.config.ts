import { defineConfig } from 'tsup';

export default defineConfig([
  // ─────────────────────────────────────────────────────────────────
  // ESM — for npm consumers (cwm-architect, backend, etc.)
  // Built to dist/esm/, consumed via package.json exports.
  // ─────────────────────────────────────────────────────────────────
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    outDir: 'dist/esm',
    target: 'es2022',
    platform: 'neutral',
    sourcemap: true,
    dts: false,
    // Mark React as external — it's a peer dep, not bundled
    external: ['react', 'react-dom'],
    esbuildOptions(options) {
      options.resolveExtensions = ['.ts', '.js'];
    },
  },

  // ─────────────────────────────────────────────────────────────────
  // IIFE — Core (element-store.js)
  // Built to ../../admin/dist/element-store.js
  // Exposes: store, AtomObj, AtomStorage, ActionExecutor, etc.
  // ─────────────────────────────────────────────────────────────────
  {
    entry: { 'element-store': 'src/browser.ts' },
    format: ['iife'],
    outDir: '../../admin/dist',
    target: 'es2019',
    platform: 'browser',
    sourcemap: true,
    minify: false,
    outExtension: () => ({ js: '.js' }),
    esbuildOptions(options) {
      options.resolveExtensions = ['.ts', '.js'];
    },
  },

  // ─────────────────────────────────────────────────────────────────
  // IIFE — Widgets (element-store-widgets.js)
  // Built to ../../admin/dist/element-store-widgets.js
  // Load AFTER element-store.js. Exposes: WidgetBinding, autobind
  // Native DOM bindings — no React dependency.
  // ─────────────────────────────────────────────────────────────────
  {
    entry: { 'element-store-widgets': 'src/browser-widgets.ts' },
    format: ['iife'],
    outDir: '../../admin/dist',
    target: 'es2019',
    platform: 'browser',
    sourcemap: true,
    minify: false,
    outExtension: () => ({ js: '.js' }),
    esbuildOptions(options) {
      options.resolveExtensions = ['.ts', '.js'];
    },
  },
]);
