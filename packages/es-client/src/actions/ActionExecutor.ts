/**
 * ActionExecutor — Universal action dispatcher (TypeScript/client)
 *
 * Executes @action objects defined in the ElementStore schema.
 * Symmetric with the PHP server-side ActionExecutor.php —
 * same @action config, same type names, same field semantics.
 *
 * Supports four execution types:
 *   - api       : fetch() call to external provider
 *   - function  : Named function in FunctionRegistry
 *   - event     : EventBus event dispatch
 *   - composite : Chain of other actions (sequential or parallel)
 *   - ui        : No-op here — handled by the UI framework layer
 *
 * Usage:
 *   const executor = new ActionExecutor({ functionRegistry, eventBus, actionResolver });
 *   const result   = await executor.execute(actionDef, { id: '123' }, contextObj);
 */

import type { ActionDef, ProviderDef, Element } from '../types.ts';

// ============================================================================
// Types
// ============================================================================

export type FunctionRegistry = (key: string, params: Record<string, unknown>) => unknown | Promise<unknown>;
export type EventBus         = (event: string, payload: Record<string, unknown>) => void | Promise<void>;
export type ActionResolver   = (actionId: string) => ActionDef | undefined;

export interface ActionExecutorOptions {
  /** FunctionRegistry: fn(key, params) => result */
  functionRegistry?: FunctionRegistry;
  /** EventBus: fn(event, payload) => void */
  eventBus?: EventBus;
  /** Resolve @action by ID (used for composite sub-actions) */
  actionResolver?: ActionResolver;
}

export class ActionExecutorError extends Error {
  readonly httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = 'ActionExecutorError';
    this.httpStatus = httpStatus;
  }
}

// ============================================================================
// ActionExecutor
// ============================================================================

export class ActionExecutor {
  private functionRegistry?: FunctionRegistry;
  private eventBus?: EventBus;
  private actionResolver?: ActionResolver;

  constructor(options: ActionExecutorOptions = {}) {
    this.functionRegistry = options.functionRegistry;
    this.eventBus         = options.eventBus;
    this.actionResolver   = options.actionResolver;
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Execute an action definition.
   *
   * @param action   @action element data
   * @param params   Runtime parameter values (e.g. { id: '42' })
   * @param context  The ES object this action is running on (optional)
   * @returns        Result — depends on action.returns (object, list, void/null)
   */
  async execute(
    action: ActionDef,
    params: Record<string, unknown> = {},
    context: Element | null = null,
  ): Promise<unknown> {
    const type = action.type ?? 'ui';

    switch (type) {
      case 'api':       return this.executeApi(action, params, context);
      case 'function':  return this.executeFunction(action, params);
      case 'event':     return this.executeEvent(action, params, context);
      case 'composite': return this.executeComposite(action, params, context);
      case 'ui':        return null; // UI-only, no-op here
      default:
        throw new ActionExecutorError(`Unknown action type: ${type}`);
    }
  }

  // ==========================================================================
  // API TYPE
  // ==========================================================================

  /**
   * Execute an api-type action via fetch().
   *
   * Resolves endpoint placeholders like {id} from params + context.
   * Applies field mapping from action.mapping (api_field → es_field).
   */
  private async executeApi(
    action: ActionDef,
    params: Record<string, unknown>,
    context: Element | null,
  ): Promise<unknown> {
    const method  = (action.method ?? 'GET').toUpperCase();
    const mapping = action.mapping ?? {};
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json', ...action.headers };

    // Resolve base URL from context's provider or action's storage context
    const baseUrl = this.resolveBaseUrl(context);
    const url     = this.buildUrl(baseUrl + (action.endpoint ?? ''), params, context);

    let body: string | undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      body = JSON.stringify(this.buildRequestBody(params, mapping, context));
    }

    const response = await fetch(url, { method, headers, body });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ActionExecutorError(`API error ${response.status}: ${text}`, response.status);
    }

    if (response.status === 204) return null;

    const data = await response.json() as Record<string, unknown>;

    // Apply field mapping (api_field → es_field)
    const mapped = Object.keys(mapping).length > 0 ? this.applyReverseMapping(mapping, data) : data;

    // Update _links on context if id_field is set
    if (context !== null) {
      this.updateLinks(context as Record<string, unknown>, action, mapped as Record<string, unknown>);
    }

    return mapped;
  }

  // ==========================================================================
  // FUNCTION TYPE
  // ==========================================================================

  /**
   * Execute a function-type action via FunctionRegistry.
   */
  private async executeFunction(
    action: ActionDef,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.functionRegistry) {
      throw new ActionExecutorError('FunctionRegistry not configured');
    }

    const key = action.function;
    if (!key) {
      throw new ActionExecutorError('action.function key is required for function-type actions');
    }

    return this.functionRegistry(key, params);
  }

  // ==========================================================================
  // EVENT TYPE
  // ==========================================================================

  /**
   * Execute an event-type action — emit to EventBus.
   */
  private async executeEvent(
    action: ActionDef,
    params: Record<string, unknown>,
    context: Element | null,
  ): Promise<void> {
    if (!this.eventBus) {
      throw new ActionExecutorError('EventBus not configured');
    }

    const eventName  = action.event;
    const payloadMap = action.payload ?? {};

    if (!eventName) {
      throw new ActionExecutorError('action.event is required for event-type actions');
    }

    // Build payload from params using mapping
    const payload: Record<string, unknown> = {};
    if (Object.keys(payloadMap).length === 0) {
      Object.assign(payload, params);
    } else {
      for (const [paramKey, eventField] of Object.entries(payloadMap)) {
        if (paramKey in params) {
          payload[eventField] = params[paramKey];
        }
      }
    }

    // Add context metadata
    if (context) {
      payload['_context_id']       = context.id;
      payload['_context_class_id'] = context.class_id;
    }

    await this.eventBus(eventName, payload);
  }

  // ==========================================================================
  // COMPOSITE TYPE
  // ==========================================================================

  /**
   * Execute a composite-type action — chain of sub-actions.
   *
   * sequential: execute in order, stop if any fails
   * parallel:   execute all concurrently (Promise.allSettled)
   */
  private async executeComposite(
    action: ActionDef,
    params: Record<string, unknown>,
    context: Element | null,
  ): Promise<{ results: Record<string, unknown>; errors: Record<string, string> }> {
    const actionIds = action.actions ?? [];
    const strategy  = action.strategy ?? 'sequential';

    if (actionIds.length === 0) return { results: {}, errors: {} };

    const results: Record<string, unknown> = {};
    const errors: Record<string, string>   = {};

    if (strategy === 'parallel') {
      const settled = await Promise.allSettled(
        actionIds.map(id => {
          const sub = this.resolveAction(id);
          if (!sub) return Promise.reject(new Error(`Sub-action not found: ${id}`));
          return this.execute(sub, params, context).then(r => ({ id, r }));
        }),
      );
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        const id = actionIds[i];
        if (s.status === 'fulfilled') {
          results[id] = (s.value as { r: unknown }).r;
        } else {
          errors[id] = s.reason?.message ?? String(s.reason);
        }
      }
    } else {
      // sequential
      let currentParams = { ...params };
      for (const id of actionIds) {
        const sub = this.resolveAction(id);
        if (!sub) throw new ActionExecutorError(`Sub-action not found: ${id}`);
        try {
          const result   = await this.execute(sub, currentParams, context);
          results[id]    = result;
          // Pass result fields forward as params for next step
          if (result && typeof result === 'object') {
            currentParams = { ...currentParams, ...(result as Record<string, unknown>) };
          }
        } catch (e) {
          throw new ActionExecutorError(
            `Composite action failed at step '${id}': ${(e as Error).message}`,
          );
        }
      }
    }

    return { results, errors };
  }

  // ==========================================================================
  // URL / PARAM HELPERS
  // ==========================================================================

  /**
   * Build full URL, substituting {param} placeholders from params + context.
   */
  private buildUrl(
    urlTemplate: string,
    params: Record<string, unknown>,
    context: Element | null,
  ): string {
    return urlTemplate.replace(/\{(\w+)\}/g, (_, key: string) => {
      if (key in params) return encodeURIComponent(String(params[key]));
      if (context && key in context) return encodeURIComponent(String((context as Record<string, unknown>)[key]));
      return `{${key}}`; // leave unreplaced
    });
  }

  /**
   * Build request body for POST/PUT/PATCH.
   * Applies forward mapping: es_field → api_field (invert of action.mapping).
   */
  private buildRequestBody(
    params: Record<string, unknown>,
    mapping: Record<string, string>,   // {api_field: es_field}
    _context: Element | null,
  ): Record<string, unknown> {
    if (Object.keys(mapping).length === 0) return params;

    // Invert: {api_field: es_field} → {es_field: api_field}
    const inverted = Object.fromEntries(Object.entries(mapping).map(([a, e]) => [e, a]));
    const body: Record<string, unknown> = {};

    for (const [esField, value] of Object.entries(params)) {
      const apiField     = inverted[esField] ?? esField;
      body[apiField]     = value;
    }

    return body;
  }

  /**
   * Apply reverse mapping to API response: {api_field: es_field} → rename keys.
   */
  private applyReverseMapping(
    mapping: Record<string, string>,
    response: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...response };
    for (const [apiField, esField] of Object.entries(mapping)) {
      if (apiField in response) {
        result[esField] = response[apiField];
        if (apiField !== esField) delete result[apiField];
      }
    }
    return result;
  }

  /**
   * Update _links on context object after API call.
   * Stores: _links[storage_id] = external_id
   */
  private updateLinks(
    context: Record<string, unknown>,
    action: ActionDef,
    response: Record<string, unknown>,
  ): void {
    const idField   = (action as Record<string, unknown>)['id_field'] as string ?? 'id';
    const storageId = (action as Record<string, unknown>)['storage_id'] as string | undefined;

    if (storageId && idField in response) {
      if (!context['_links']) context['_links'] = {};
      (context['_links'] as Record<string, unknown>)[storageId] = response[idField];
    }
  }

  /**
   * Resolve base URL from context's _provider field.
   */
  private resolveBaseUrl(context: Element | null): string {
    if (!context) return '';
    const provider = (context as Record<string, unknown>)['_provider'] as ProviderDef | undefined;
    if (provider?.base_url) return provider.base_url.replace(/\/$/, '');
    return '';
  }

  /**
   * Resolve a sub-action by ID via actionResolver.
   */
  private resolveAction(actionId: string): ActionDef | undefined {
    return this.actionResolver?.(actionId);
  }
}

// ============================================================================
// Default singleton (configured lazily by ElementStore)
// ============================================================================

let _defaultExecutor: ActionExecutor | null = null;

export function getActionExecutor(): ActionExecutor {
  if (!_defaultExecutor) {
    _defaultExecutor = new ActionExecutor();
  }
  return _defaultExecutor;
}

export function configureActionExecutor(options: ActionExecutorOptions): ActionExecutor {
  _defaultExecutor = new ActionExecutor(options);
  return _defaultExecutor;
}
