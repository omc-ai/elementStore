/**
 * browser.ts — IIFE entry point for admin <script> tag
 *
 * Exposes all core classes as window.* globals, exactly matching the API
 * that the handwritten element-store.js provided. Any admin JS that uses
 * AtomObj, ElementStore, store, etc. continues to work without changes.
 *
 * Built by tsup → admin/dist/element-store.js
 *
 * Seed data is NOT included here — it stays in admin/js/seed-data.js
 * (admin-specific, changes independently of the core library).
 */

import { AtomObj, generateLocalId } from './core/AtomObj.ts';
import { AtomCollection } from './core/AtomCollection.ts';
import { AtomClass } from './core/AtomClass.ts';
import { AtomProp } from './core/AtomProp.ts';
import { AtomStorage } from './storage/AtomStorage.ts';
import { ElementStore } from './core/ElementStore.ts';
import { classRegistry, registerClass } from './modules/classRegistry.ts';
import { ActionExecutor } from './actions/ActionExecutor.ts';
import { flattenGenesis } from './modules/genesisConverter.ts';

// ─────────────────────────────────────────────────────────────────────────────
// JWT token helpers (compat with old element-store.js API)
// Thin wrappers around store.setToken / store.getToken.
// Must be defined before store singleton so they can reference it.
// ─────────────────────────────────────────────────────────────────────────────

function setJwtToken(token: string | null): void {
  store.setToken(token);
}

function getJwtToken(): string | null {
  return store.getToken();
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeClassIds utility (compat export)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeClassIds(val: unknown): string[] | null {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) return val.length > 0 ? (val as string[]) : null;
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store singleton
// URL is empty — app.js (initStore) sets store.storage.data.url = API_BASE
// after api.js loads and defines API_BASE.
// ─────────────────────────────────────────────────────────────────────────────

const store = new ElementStore('root.store');

const storage = new AtomStorage(
  { id: 'root.storage', class_id: '@storage', url: '' },
  store,
);
store.storage = storage;

// ─────────────────────────────────────────────────────────────────────────────
// Expose everything on window (global script tag usage)
// ─────────────────────────────────────────────────────────────────────────────

const w = window as Record<string, unknown>;

// Core classes
w['AtomObj']        = AtomObj;
w['AtomCollection'] = AtomCollection;
w['AtomClass']      = AtomClass;
w['AtomProp']       = AtomProp;
w['AtomStorage']    = AtomStorage;
w['ElementStore']   = ElementStore;

// Modules
w['classRegistry']    = classRegistry;
w['registerClass']    = registerClass;
w['ActionExecutor']   = ActionExecutor;
w['flattenGenesis'] = flattenGenesis;

// Utilities
w['generateLocalId']   = generateLocalId;
w['normalizeClassIds'] = normalizeClassIds;

// JWT compat helpers
w['setJwtToken'] = setJwtToken;
w['getJwtToken'] = getJwtToken;

// Singletons (store exposed for F12 console debugging)
w['store']   = store;
w['storage'] = storage;
