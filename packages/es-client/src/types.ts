/**
 * ElementStore Types — Merged (frontend + backend)
 *
 * Single source of truth for all ElementStore TypeScript types.
 * Used by both cwm-architect frontend and cwm-architect backend.
 */

// ============================================
// Meta Constants
// ============================================

/** Meta class constant - elements with this class_id are class definitions */
export const META_CLASS = '@class';

/** Meta prop constant - property definitions */
export const META_PROP = '@prop';

/** Meta action constant - action definitions */
export const META_ACTION = '@action';

/** Meta event constant - event definitions */
export const META_EVENT = '@event';

/** Meta editor constant - editor definitions */
export const META_EDITOR = '@editor';

/** Meta function constant - function definitions */
export const META_FUNCTION = '@function';

/** Meta storage constant - storage definitions */
export const META_STORAGE = '@storage';

/** Meta provider constant - provider definitions */
export const META_PROVIDER = '@provider';

// ============================================
// Data Types
// ============================================

/**
 * Canonical 8 data types — ElementStore Constants::DT_*
 *
 * `datetime` is the single canonical type for all date/time values.
 * The editor type (date / time / datetime picker) controls display granularity — not the data type.
 * Legacy aliases are invalid: number→integer or float, date→datetime, enum→string+options.values
 */
export type DataType =
  | 'string'
  | 'boolean'
  | 'integer'
  | 'float'
  | 'datetime'   // covers date-only, time-only, and full datetime
  | 'object'
  | 'relation'
  | 'function';

/** Editor types for UI rendering */
export type EditorType =
  | 'text'
  | 'textarea'
  | 'code'
  | 'richtext'
  | 'password'
  | 'number'
  | 'slider'
  | 'currency'
  | 'checkbox'
  | 'toggle'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'autocomplete'
  | 'date'
  | 'time'
  | 'datetime'
  | 'color'
  | 'file'
  | 'image'
  | 'json'
  | 'keyvalue'
  | 'reference'
  | 'references'
  | 'javascript'
  | 'function-picker';

// ============================================
// Array Multiplicity
// ============================================

/**
 * Property multiplicity — controls whether a property holds a single value,
 * an ordered array, or an associative key-value map.
 *
 * - false:     scalar (single value)
 * - true:      backward compat alias for 'indexed'
 * - 'indexed': ordered array [val1, val2, ...]
 * - 'assoc':   key→value map {key1: val1, key2: val2, ...}
 */
export type ArrayMode = boolean | 'indexed' | 'assoc';

/** Normalize any is_array value to canonical form */
export function normalizeArrayMode(mode: ArrayMode | undefined): 'false' | 'indexed' | 'assoc' {
  if (mode === true || mode === 'indexed') return 'indexed';
  if (mode === 'assoc') return 'assoc';
  return 'false';
}

/** Check if mode represents any kind of collection (indexed or assoc) */
export function isCollectionMode(mode: ArrayMode | undefined): boolean {
  return mode === true || mode === 'indexed' || mode === 'assoc';
}

// ============================================
// Context Definitions
// ============================================

/**
 * Per-property context override — controls visibility, editability,
 * label, editor, and display order within a named context.
 */
export interface PropContext {
  visible?: boolean;
  editable?: boolean;
  required?: boolean;
  label?: string;
  editor?: string;
  width?: number;
  display_order?: number;
}

/**
 * Per-class context — defines which fields to show, sort order,
 * and available actions in a named context.
 */
export interface ClassContext {
  fields?: string[] | null;
  sort_by?: string;
  actions?: string[];
  page_size?: number;
}

// ============================================
// Property Definition (Prop)
// ============================================

/**
 * Embedded @editor instance shape.
 * Stored inline on a Prop when the user selects an editor.
 * Candidates are filtered by: @editor.data_types includes prop.data_type
 */
export interface EditorInstance {
  id?: string;
  name?: string;
  data_types?: string[];
  is_default?: boolean;
  is_system?: boolean;
  validator?: string;
  component?: string;
  render?: string;
  props?: unknown[];
  [key: string]: unknown;
}

/**
 * @deprecated Use EditorInstance.
 * Kept temporarily so existing code that uses EditorConfig doesn't break.
 */
export type EditorConfig = EditorInstance;

/** @deprecated Validation is now driven by options + data_type */
export interface ValidatorConfig {
  type: string;
  message?: string;
  [key: string]: unknown;
}

// ============================================
// Relation Options (for data_type: 'relation')
// ============================================

/**
 * Relation options define how to resolve related elements.
 *
 * Example: Design.childs relation
 * ```json
 * {
 *   "key": "childs",
 *   "data_type": "relation",
 *   "is_array": true,
 *   "object_class_id": "core:element",
 *   "options": {
 *     "fields": ["id"],
 *     "relationFields": ["parent_id"]
 *   }
 * }
 * ```
 *
 * This means: find elements where element.parent_id === this.id
 */
export interface RelationOptions {
  /**
   * Fields on THIS element to match against.
   * Usually ["id"] for parent-child relations.
   */
  fields: string[];

  /**
   * Fields on RELATED elements that point back to this element.
   * For parent-child: ["parent_id"]
   * For owner: ["owner_id"]
   */
  relationFields: string[];
}

/**
 * Function binding options (for data_type: 'function')
 */
export interface FunctionOptions {
  /** Function reference in registry (e.g., 'settings.save') */
  function: string;
  /** Argument mappings (property names or $0, $1 for runtime args) */
  args?: string[];
}

/**
 * filter_by — cross-field filter for object-typed props with object_class_id.
 *
 * When an object prop has object_class_id defined (picker from another class),
 * filter_by restricts which candidates are shown in the picker UI:
 *   candidates where candidate[field] includes/equals thisObject[source]
 *
 * Example: @prop.editor
 *   object_class_id: ['@editor']
 *   options.filter_by: { field: 'data_types', source: 'data_type' }
 *   → show @editor instances where @editor.data_types includes this_prop.data_type
 */
export interface FilterBy {
  /** Field on the candidate object to check (e.g. 'data_types') */
  field: string;
  /** Field on the current object to match against (e.g. 'data_type') */
  source: string;
}

/**
 * Property options - varies by data_type
 */
export interface PropOptions {
  // For relations
  fields?: string[];
  relationFields?: string[];

  // For functions
  function?: string;
  args?: string[];

  // For string enums
  values?: string[];

  // For object/relation props with object_class_id — filter picker candidates
  filter_by?: FilterBy;

  // Generic options
  [key: string]: unknown;
}

/**
 * Flags object for property-level behavioral flags.
 * Prefer flags.required over top-level required, etc.
 */
export interface PropFlags {
  required?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  create_only?: boolean;
  server_only?: boolean;
  master_only?: boolean;
}

/** Property definition matching system.genesis.json @prop schema */
export interface Prop {
  id: string;
  class_id: typeof META_PROP;
  key: string;
  label?: string;
  description?: string;
  data_type: DataType;
  /** Multiplicity: false=scalar, true/'indexed'=ordered array, 'assoc'=key-value map */
  is_array?: ArrayMode;
  /** Target class(es) for object/relation props. Can be a single ID or array of IDs. */
  object_class_id?: string | string[] | null;
  object_class_strict?: boolean;
  on_orphan?: 'keep' | 'delete' | 'nullify';
  /**
   * Options for relation/function/string properties.
   * For data_type: 'relation' - contains fields/relationFields
   * For data_type: 'function' - contains function/args
   * For data_type: 'string' with enumerated values - contains values: string[]
   */
  options?: PropOptions | Array<{ value: string; label: string }>;
  /**
   * Editor — either a string ID referencing an @editor, or an inline editor instance object.
   * When an object, must contain at least { id: string }.
   */
  editor?: string | { id: string; [key: string]: unknown };
  /**
   * Behavioral flags. Prefer flags over top-level boolean properties.
   * E.g., prefer flags.required over top-level required.
   */
  flags?: PropFlags;
  /** @deprecated Use editor + options instead */
  field_type?: string;
  /** @deprecated Validation is now driven by options + data_type */
  validators?: ValidatorConfig[];
  /** @deprecated Prefer flags.required */
  required?: boolean;
  /** @deprecated Prefer flags.readonly */
  readonly?: boolean;
  /** @deprecated Prefer flags.create_only */
  create_only?: boolean;
  default_value?: unknown;
  display_order?: number;
  /** @deprecated Use contexts or layout grouping instead */
  group_name?: string;
  /** @deprecated Prefer flags.hidden */
  hidden?: boolean;
  /** @deprecated Prefer flags.server_only */
  server_only?: boolean;
  /** @deprecated Prefer flags.master_only */
  master_only?: boolean;
  /** Per-context overrides — assoc map of context_name → PropContext */
  contexts?: Record<string, PropContext>;
}

// ============================================
// Action Definition
// ============================================

/** Legacy UI action types (kept for backward compat) */
export type ActionType = 'openDialog' | 'closeDialog' | 'createObject' | 'deleteObject' | 'callMethod' | 'callFunction';

/** Legacy UI action definition */
export interface Action {
  type: ActionType;
  target?: string;
  method?: string;
  params?: Record<string, unknown>;
}

// ============================================
// Action Definition (@action) — Universal Execution Unit
// ============================================

/**
 * Execution type for @action elements.
 * - api       : HTTP call to external provider
 * - function  : Named function in FunctionRegistry
 * - event     : EventBus event dispatch
 * - composite : Chain of other actions
 * - ui        : JS handler (client-only, no-op on server)
 */
export type ActionExecType = 'api' | 'function' | 'event' | 'composite' | 'ui';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * @action element — drives ActionExecutor on both server (PHP) and client (TS).
 * Same field names, same types, symmetric behavior.
 */
export interface ActionDef extends Element {
  class_id: '@action';
  type: ActionExecType;
  group_name?: string;
  params?: Prop[];
  returns?: 'object' | 'list' | 'void';

  // api type
  method?: HttpMethod;
  endpoint?: string;                      // URL path, may contain {id} etc.
  headers?: Record<string, string>;
  mapping?: Record<string, string>;       // api_field → es_field

  // function type
  function?: string;                      // FunctionRegistry key, e.g. 'billing.calculate'

  // event type
  event?: string;                         // EventBus event name
  payload?: Record<string, string>;       // param → event_field mapping

  // composite type
  actions?: string[];                     // ordered @action IDs
  strategy?: 'sequential' | 'parallel';

  // ui type (legacy)
  handler?: string;                       // JS code (scope) => result
  target_class_id?: string;
  requires_selection?: boolean;
  bulk?: boolean;
  confirm?: string;
  icon?: string;
}

// ============================================
// Provider Definition (@provider)
// ============================================

/**
 * @provider element — abstract base for external API connections.
 * Concrete providers extend this via extends_id.
 * Provider instances live in @storage (type='api') via provider_id.
 */
export interface ProviderDef extends Element {
  class_id: '@provider' | string;         // concrete providers have custom class_id
  base_url?: string;
  auth?: ProviderAuth;
  id_field?: string;                      // API response field holding external ID
  write_mode?: 'crud' | 'actions_only';
  mapping?: Record<string, string>;       // default api_field → es_field
  actions?: string[];                     // @action IDs
  params?: Record<string, unknown>;
}

export interface ProviderAuth {
  type: 'bearer' | 'basic' | 'apikey' | 'none';
  token?: string;
  username?: string;
  password?: string;
  header?: string;                        // e.g. 'X-Api-Key'
  key?: string;
}

// ============================================
// Element (Base Interface)
// ============================================

/**
 * Base element interface matching wallet-fe-backoffice AtomObj/EntityObj.
 *
 * When class_id === "@class", this is a class definition.
 * Otherwise, it's an element instance.
 */
export interface Element {
  // === Required (AtomObj) ===
  id: string;
  class_id: string;

  // === Common Optional (AtomObj/EntityObj) ===
  name?: string;
  owner_id?: string | number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
  is_system?: boolean;
  is_seed?: boolean;

  // === Class-specific (when class_id === "@class") ===
  extends_id?: string;
  namespace_id?: string;
  description?: string;
  props?: Prop[];
  table_name?: string;
  is_abstract?: boolean;
  /** Named view contexts — assoc map of context_name → ClassContext */
  contexts?: Record<string, ClassContext>;
  is_container?: boolean;
  icon?: string;
  color?: string;
  defaults?: Record<string, unknown>;

  // === Instance-specific (when class_id !== "@class") ===
  design_id?: string;
  parent_id?: string;
  position?: Position;
  size?: Size;
  source_id?: string;
  target_id?: string;

  // === Visual configuration (for canvas elements) ===
  canvasElement?: CanvasElementVisual;

  // === Internal (not serialized to API) ===
  _changes?: Record<string, { old: unknown; new: unknown }>;
  _isNew?: boolean;

  // === Dynamic properties from class schema ===
  [key: string]: unknown;
}

// ============================================
// Geometry Types
// ============================================

export type Position = [number, number, number] | { x: number; y: number; z: number };
export type Size = [number, number, number] | { width: number; height: number; depth: number };

/** Visual configuration for canvas elements */
export interface CanvasElementVisual {
  icon?: string;
  color?: string;
  shape?: 'rect' | 'rounded-rect' | 'circle' | 'diamond' | 'hexagon';
  labelPosition?: 'top' | 'bottom' | 'inside' | 'none';
  borderStyle?: string;
  opacity?: number;
}

// ============================================
// API Response Types
// ============================================

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Query filter options */
export interface QueryOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: unknown;
}

/** Class with resolved props (includes inherited) */
export interface ResolvedClass extends Element {
  resolvedProps?: Prop[];
  inheritanceChain?: string[];
}

// ============================================
// Error Types
// ============================================

/** ElementStore API error */
export interface ElementStoreError {
  code: string;
  message: string;
  details?: unknown;
}

/** Health check result (backend) */
export interface HealthCheckResult {
  ok: boolean;
  message?: string;
  timestamp?: string;
}

// ============================================
// Type Guards
// ============================================

/** Check if element is a class definition */
export function isClass(element: Element): boolean {
  return element.class_id === META_CLASS;
}

/** Check if element is an instance */
export function isInstance(element: Element): boolean {
  return element.class_id !== META_CLASS;
}

/** Check if element is a connection (has source and target) */
export function isConnection(element: Element): boolean {
  return element.source_id !== undefined && element.target_id !== undefined;
}

/** Check if response is an error */
export function isElementStoreError(response: unknown): response is ElementStoreError {
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    'message' in response
  );
}

// ============================================
// Utility Functions
// ============================================

/** Get position as object format */
export function getPositionObject(position: Position | undefined): { x: number; y: number; z: number } {
  if (!position) return { x: 0, y: 0, z: 0 };
  if (Array.isArray(position)) {
    return { x: position[0], y: position[1], z: position[2] };
  }
  return position;
}

/** Get size as object format */
export function getSizeObject(size: Size | undefined): { width: number; height: number; depth: number } {
  if (!size) return { width: 100, height: 100, depth: 1 };
  if (Array.isArray(size)) {
    return { width: size[0] || 100, height: size[1] || 100, depth: size[2] || 1 };
  }
  return { width: size.width || 100, height: size.height || 100, depth: size.depth || 1 };
}

/** Generate a unique ID */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
