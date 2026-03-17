/**
 * FunctionProxy — Bind data_type:"function" props as callable methods on AtomObj
 *
 * When a class has props with data_type: "function" and options.function,
 * this module makes them callable on the object instance.
 *
 * Usage:
 *   registerFunction('settings.save', (obj, key, value) => { ... });
 *   bindFunctions(store, element);
 *   element.save(); // calls the registered function
 *
 * Backported from cwm-architect/src/lib/elementStore/functionProxy.ts.
 */

import type { AtomObj } from '../core/AtomObj.ts';
import type { ElementStore } from '../core/ElementStore.ts';

// ─── Function Registry ────────────────────────────────────────────

export type RegisteredFunction = (...args: unknown[]) => unknown | Promise<unknown>;

const FUNCTION_REGISTRY: Map<string, RegisteredFunction> = new Map();

/** Register a named function for use in function-type props */
export function registerFunction(name: string, fn: RegisteredFunction): void {
  FUNCTION_REGISTRY.set(name, fn);
}

/** Get a registered function by name */
export function getFunction(name: string): RegisteredFunction | undefined {
  return FUNCTION_REGISTRY.get(name);
}

/** List all registered function names */
export function listFunctions(): string[] {
  return Array.from(FUNCTION_REGISTRY.keys());
}

// ─── Execute ──────────────────────────────────────────────────────

/**
 * Execute a named function from the registry.
 * @param name - Function reference (e.g., 'settings.save')
 * @param args - Arguments to pass
 * @returns Function result
 */
export function executeFunction(name: string, args: unknown[]): unknown {
  const fn = FUNCTION_REGISTRY.get(name);
  if (!fn) {
    console.warn(`[FunctionProxy] Function not found: ${name}`);
    return undefined;
  }
  return fn(...args);
}

// ─── Bind to Object ───────────────────────────────────────────────

/**
 * Bind all function-type props of an AtomObj as callable properties.
 *
 * For each prop with data_type: "function" and options.function:
 * - Creates a getter on the object that returns a callable
 * - Arguments mapped from options.args (property names or $0, $1 for runtime args)
 *
 * @param store - ElementStore instance
 * @param element - The AtomObj to bind functions to
 */
export function bindFunctions(store: ElementStore, element: AtomObj): void {
  const classId = element.data?.class_id;
  if (!classId) return;

  const propDefs = store.collectClassProps(classId);
  if (!propDefs) return;

  for (const propObj of propDefs) {
    const pd = propObj.data || propObj;
    if (pd.data_type !== 'function') continue;

    const options = pd.options as { function?: string; args?: string[] } | undefined;
    if (!options?.function) continue;

    const funcRef = options.function;
    const argKeys = options.args || [];
    const propKey = pd.key as string;

    Object.defineProperty(element, propKey, {
      configurable: true,
      enumerable: false,
      get: () => {
        return (...runtimeArgs: unknown[]) => {
          const args = argKeys.map((key: string, index: number) => {
            if (key.startsWith('$')) {
              // $0, $1, etc. = runtime argument at index
              const argIndex = parseInt(key.slice(1), 10);
              return runtimeArgs[argIndex];
            }
            // Property name = get from element
            return (element as any)[key];
          });
          return executeFunction(funcRef, args);
        };
      },
    });
  }
}
