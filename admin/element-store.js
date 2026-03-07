// ═══════════════════════════════════════════════════════════════════════════
// ELEMENT STORE
// ═══════════════════════════════════════════════════════════════════════════
//
// CODING STANDARD:
// - Use function() {} instead of arrow functions =>
// - Pass 'this' as second argument to forEach when needed
// - Use old-fashioned function declarations
// - Class fields for defaults (not saved unless explicitly set)
//
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════════════════

const seedData = {
    // ══════════════════════════════════════════════════════════════
    // SYSTEM CLASSES
    // ══════════════════════════════════════════════════════════════
    '@class':          {id: '@class',          class_id: '@class', name: 'Class',         is_system: true},
    '@prop':           {id: '@prop',           class_id: '@class', name: 'Property',      is_system: true},
    '@editor':         {id: '@editor',         class_id: '@class', name: 'Editor',        is_system: true},
    '@function':       {id: '@function',       class_id: '@class', name: 'Function',      is_system: true},
    '@storage':        {id: '@storage',        class_id: '@class', name: 'Storage',       is_system: true},
    '@action':         {id: '@action',         class_id: '@class', name: 'Action',        is_system: true},
    '@event':          {id: '@event',          class_id: '@class', name: 'Event',         is_system: true},
    '@provider':       {id: '@provider',       class_id: '@class', name: 'Provider',      is_system: true, is_abstract: true},
    'crud_provider':   {id: 'crud_provider',   class_id: '@class', name: 'CRUD Provider', is_system: true, extends_id: '@provider'},

    // ══════════════════════════════════════════════════════════════
    // @class props (10)
    // ══════════════════════════════════════════════════════════════
    '@class.name':        {id: '@class.name',        class_id: '@prop', key: 'name',        label: 'Name',        required: true, display_order: 1},
    '@class.description': {id: '@class.description', class_id: '@prop', key: 'description', label: 'Description', field_type: 'textarea', display_order: 2},
    '@class.extends_id':  {id: '@class.extends_id',  class_id: '@prop', key: 'extends_id',  label: 'Extends',     data_type: 'relation', object_class_id: ['@class'], create_only: true, display_order: 3},
    '@class.props':       {id: '@class.props',       class_id: '@prop', key: 'props',       label: 'Properties',  data_type: 'object', is_array: true, object_class_id: ['@prop'], display_order: 4},
    '@class.table_name':  {id: '@class.table_name',  class_id: '@prop', key: 'table_name',  label: 'Table Name',  display_order: 5, group_name: 'Advanced'},
    '@class.storage_id':  {id: '@class.storage_id',  class_id: '@prop', key: 'storage_id',  label: 'Storage',     data_type: 'relation', object_class_id: ['@storage'], display_order: 6, group_name: 'Advanced'},
    '@class.is_system':   {id: '@class.is_system',   class_id: '@prop', key: 'is_system',   label: 'System Class',data_type: 'boolean', readonly: true, default_value: false, display_order: 7, group_name: 'Advanced'},
    '@class.is_abstract': {id: '@class.is_abstract', class_id: '@prop', key: 'is_abstract', label: 'Abstract',    data_type: 'boolean', default_value: false, display_order: 8, group_name: 'Advanced'},
    '@class.providers':   {id: '@class.providers',   class_id: '@prop', key: 'providers',   label: 'Providers',   data_type: 'relation', is_array: true, object_class_id: ['@provider'], display_order: 9, group_name: 'Advanced'},
    '@class._links':      {id: '@class._links',      class_id: '@prop', key: '_links',      label: 'External Links', data_type: 'object', server_only: true, hidden: true, display_order: 100, group_name: 'Internal'},

    // ══════════════════════════════════════════════════════════════
    // @prop props (21) — grouped: Type, Core, Options, Relation, UI, Validation, Security
    // ══════════════════════════════════════════════════════════════
    '@prop.data_type':           {id: '@prop.data_type',           class_id: '@prop', key: 'data_type',           label: 'Data Type',      required: true, default_value: 'string', options: {values: ['string','boolean','integer','float','datetime','object','relation','function']}, display_order: 1,  group_name: 'Type'},
    '@prop.is_array':            {id: '@prop.is_array',            class_id: '@prop', key: 'is_array',            label: 'Is Array',       data_type: 'boolean', default_value: false, display_order: 2,  group_name: 'Type'},
    '@prop.key':                 {id: '@prop.key',                 class_id: '@prop', key: 'key',                 label: 'Key',            required: true, display_order: 10, group_name: 'Core'},
    '@prop.label':               {id: '@prop.label',               class_id: '@prop', key: 'label',               label: 'Label',          display_order: 11, group_name: 'Core'},
    '@prop.description':         {id: '@prop.description',         class_id: '@prop', key: 'description',         label: 'Description',    field_type: 'textarea', display_order: 12, group_name: 'Core'},
    '@prop.options':             {id: '@prop.options',             class_id: '@prop', key: 'options',             label: 'Type Options',   data_type: 'object', display_order: 20, group_name: 'Options'},
    '@prop.object_class_id':     {id: '@prop.object_class_id',     class_id: '@prop', key: 'object_class_id',     label: 'Target Classes', is_array: true, display_order: 30, group_name: 'Relation'},
    '@prop.object_class_strict': {id: '@prop.object_class_strict', class_id: '@prop', key: 'object_class_strict', label: 'Strict Class',   data_type: 'boolean', default_value: false, display_order: 31, group_name: 'Relation'},
    '@prop.on_orphan':           {id: '@prop.on_orphan',           class_id: '@prop', key: 'on_orphan',           label: 'On Orphan',      options: {values: ['keep', 'delete', 'nullify']}, default_value: 'keep', display_order: 32, group_name: 'Relation'},
    '@prop.editor':              {id: '@prop.editor',              class_id: '@prop', key: 'editor',              label: 'Editor',         data_type: 'relation', object_class_id: ['@editor'], display_order: 40, group_name: 'UI'},
    '@prop.field_type':          {id: '@prop.field_type',          class_id: '@prop', key: 'field_type',          label: 'Field Type',     display_order: 41, group_name: 'UI'},
    '@prop.display_order':       {id: '@prop.display_order',       class_id: '@prop', key: 'display_order',       label: 'Display Order',  data_type: 'integer', default_value: 0, display_order: 42, group_name: 'UI'},
    '@prop.group_name':          {id: '@prop.group_name',          class_id: '@prop', key: 'group_name',          label: 'Group',          display_order: 43, group_name: 'UI'},
    '@prop.hidden':              {id: '@prop.hidden',              class_id: '@prop', key: 'hidden',              label: 'Hidden',         data_type: 'boolean', default_value: false, display_order: 44, group_name: 'UI'},
    '@prop.required':            {id: '@prop.required',            class_id: '@prop', key: 'required',            label: 'Required',       data_type: 'boolean', default_value: false, display_order: 50, group_name: 'Validation'},
    '@prop.readonly':            {id: '@prop.readonly',            class_id: '@prop', key: 'readonly',            label: 'Read Only',      data_type: 'boolean', default_value: false, display_order: 51, group_name: 'Validation'},
    '@prop.create_only':         {id: '@prop.create_only',         class_id: '@prop', key: 'create_only',         label: 'Create Only',    data_type: 'boolean', default_value: false, display_order: 52, group_name: 'Validation'},
    '@prop.default_value':       {id: '@prop.default_value',       class_id: '@prop', key: 'default_value',       label: 'Default Value',  display_order: 53, group_name: 'Validation'},
    '@prop.validators':          {id: '@prop.validators',          class_id: '@prop', key: 'validators',          label: 'Validators',     data_type: 'relation', object_class_id: ['@function'], is_array: true, display_order: 54, group_name: 'Validation'},
    '@prop.server_only':         {id: '@prop.server_only',         class_id: '@prop', key: 'server_only',         label: 'Server Only',    data_type: 'boolean', default_value: false, display_order: 60, group_name: 'Security'},
    '@prop.master_only':         {id: '@prop.master_only',         class_id: '@prop', key: 'master_only',         label: 'Master Only',    data_type: 'boolean', default_value: false, display_order: 61, group_name: 'Security'},

    // ══════════════════════════════════════════════════════════════
    // @editor props (9)
    // ══════════════════════════════════════════════════════════════
    '@editor.name':        {id: '@editor.name',        class_id: '@prop', key: 'name',        label: 'Name',           required: true, display_order: 1},
    '@editor.description': {id: '@editor.description', class_id: '@prop', key: 'description', label: 'Description',    field_type: 'textarea', display_order: 2},
    '@editor.data_types':  {id: '@editor.data_types',  class_id: '@prop', key: 'data_types',  label: 'Data Types',     is_array: true, options: {values: ['string','boolean','integer','float','datetime','object','relation','function']}, required: true, display_order: 3},
    '@editor.is_default':  {id: '@editor.is_default',  class_id: '@prop', key: 'is_default',  label: 'Default',        data_type: 'boolean', default_value: false, display_order: 4},
    '@editor.is_system':   {id: '@editor.is_system',   class_id: '@prop', key: 'is_system',   label: 'System Editor',  data_type: 'boolean', readonly: true, default_value: false, display_order: 5},
    '@editor.validator':   {id: '@editor.validator',   class_id: '@prop', key: 'validator',   label: 'Validator',      display_order: 6},
    '@editor.props':       {id: '@editor.props',       class_id: '@prop', key: 'props',       label: 'Options Schema', data_type: 'object', is_array: true, object_class_id: ['@prop'], display_order: 7},
    '@editor.component':   {id: '@editor.component',   class_id: '@prop', key: 'component',   label: 'Component',      display_order: 8},
    '@editor.render':      {id: '@editor.render',      class_id: '@prop', key: 'render',      label: 'Render',         data_type: 'function', field_type: 'javascript', display_order: 9},

    // ══════════════════════════════════════════════════════════════
    // @function props (7)
    // ══════════════════════════════════════════════════════════════
    '@function.name':          {id: '@function.name',          class_id: '@prop', key: 'name',          label: 'Name',          required: true, display_order: 1},
    '@function.description':   {id: '@function.description',   class_id: '@prop', key: 'description',   label: 'Description',   field_type: 'textarea', display_order: 2},
    '@function.function_type': {id: '@function.function_type', class_id: '@prop', key: 'function_type', label: 'Function Type', required: true, options: {values: ['validator','transformer','computed','generator','custom']}, display_order: 3},
    '@function.scope':         {id: '@function.scope',         class_id: '@prop', key: 'scope',         label: 'Scope',         is_array: true, display_order: 4},
    '@function.parameters':    {id: '@function.parameters',    class_id: '@prop', key: 'parameters',    label: 'Parameters',    data_type: 'object', is_array: true, object_class_id: ['@prop'], display_order: 5},
    '@function.code':          {id: '@function.code',          class_id: '@prop', key: 'code',          label: 'Code',          data_type: 'function', field_type: 'javascript', required: true, display_order: 6},
    '@function.is_system':     {id: '@function.is_system',     class_id: '@prop', key: 'is_system',     label: 'System',        data_type: 'boolean', readonly: true, default_value: false, display_order: 7},

    // ══════════════════════════════════════════════════════════════
    // @storage props (8)
    // ══════════════════════════════════════════════════════════════
    '@storage.name':           {id: '@storage.name',           class_id: '@prop', key: 'name',           label: 'Name',           required: true, display_order: 1},
    '@storage.url':            {id: '@storage.url',            class_id: '@prop', key: 'url',            label: 'URL',            field_type: 'url', display_order: 2},
    '@storage.type':           {id: '@storage.type',           class_id: '@prop', key: 'type',           label: 'Type',           options: {values: ['local','rest','api','seed','composite','couchdb','mysql','json']}, default_value: 'rest', display_order: 3},
    '@storage.provider_id':    {id: '@storage.provider_id',    class_id: '@prop', key: 'provider_id',    label: 'Provider',       data_type: 'relation', object_class_id: ['@provider'], display_order: 10, group_name: 'Composite'},
    '@storage.read':           {id: '@storage.read',           class_id: '@prop', key: 'read',           label: 'Read Sources',   is_array: true, display_order: 11, group_name: 'Composite'},
    '@storage.write':          {id: '@storage.write',          class_id: '@prop', key: 'write',          label: 'Write Target',   display_order: 12, group_name: 'Composite'},
    '@storage.read_strategy':  {id: '@storage.read_strategy',  class_id: '@prop', key: 'read_strategy',  label: 'Read Strategy',  options: {values: ['fallback','merge']}, default_value: 'fallback', display_order: 13, group_name: 'Composite'},
    '@storage.write_strategy': {id: '@storage.write_strategy', class_id: '@prop', key: 'write_strategy', label: 'Write Strategy', options: {values: ['sequential','parallel','best_effort']}, default_value: 'sequential', display_order: 14, group_name: 'Composite'},

    // ══════════════════════════════════════════════════════════════
    // @action props (21)
    // ══════════════════════════════════════════════════════════════
    '@action.name':               {id: '@action.name',               class_id: '@prop', key: 'name',               label: 'Name',               required: true, display_order: 1},
    '@action.description':        {id: '@action.description',        class_id: '@prop', key: 'description',        label: 'Description',        field_type: 'textarea', display_order: 2},
    '@action.type':               {id: '@action.type',               class_id: '@prop', key: 'type',               label: 'Type',               required: true, options: {values: ['api','function','event','composite','ui']}, display_order: 3},
    '@action.group_name':         {id: '@action.group_name',         class_id: '@prop', key: 'group_name',         label: 'Group',              display_order: 4},
    '@action.params':             {id: '@action.params',             class_id: '@prop', key: 'params',             label: 'Parameters',         data_type: 'object', is_array: true, object_class_id: ['@prop'], display_order: 5},
    '@action.returns':            {id: '@action.returns',            class_id: '@prop', key: 'returns',            label: 'Returns',            options: {values: ['object','list','void']}, default_value: 'void', display_order: 6},
    '@action.method':             {id: '@action.method',             class_id: '@prop', key: 'method',             label: 'HTTP Method',        options: {values: ['GET','POST','PUT','PATCH','DELETE']}, default_value: 'GET', display_order: 10, group_name: 'API'},
    '@action.endpoint':           {id: '@action.endpoint',           class_id: '@prop', key: 'endpoint',           label: 'Endpoint',           display_order: 11, group_name: 'API'},
    '@action.headers':            {id: '@action.headers',            class_id: '@prop', key: 'headers',            label: 'Headers',            data_type: 'object', display_order: 12, group_name: 'API'},
    '@action.mapping':            {id: '@action.mapping',            class_id: '@prop', key: 'mapping',            label: 'Field Mapping (deprecated)', data_type: 'object', display_order: 13, group_name: 'API', description: 'Deprecated: use request_mapping/response_mapping instead'},
    '@action.request_mapping':    {id: '@action.request_mapping',    class_id: '@prop', key: 'request_mapping',    label: 'Request Mapping',    data_type: 'object', display_order: 14, group_name: 'API', description: 'Maps ES fields to API request fields'},
    '@action.response_mapping':   {id: '@action.response_mapping',   class_id: '@prop', key: 'response_mapping',   label: 'Response Mapping',   data_type: 'object', display_order: 15, group_name: 'API', description: 'Maps API response fields to ES fields'},
    '@action.provider_id':        {id: '@action.provider_id',        class_id: '@prop', key: 'provider_id',        label: 'Provider',           data_type: 'relation', object_class_id: ['@provider'], display_order: 16, group_name: 'API'},
    '@action.function':           {id: '@action.function',           class_id: '@prop', key: 'function',           label: 'Function Key',       display_order: 20, group_name: 'Function'},
    '@action.event':              {id: '@action.event',              class_id: '@prop', key: 'event',              label: 'Event Name',         display_order: 30, group_name: 'Event'},
    '@action.payload':            {id: '@action.payload',            class_id: '@prop', key: 'payload',            label: 'Payload Map',        data_type: 'object', display_order: 31, group_name: 'Event'},
    '@action.actions':            {id: '@action.actions',            class_id: '@prop', key: 'actions',            label: 'Sub-Actions',        data_type: 'relation', object_class_id: ['@action'], is_array: true, display_order: 40, group_name: 'Composite'},
    '@action.strategy':           {id: '@action.strategy',           class_id: '@prop', key: 'strategy',           label: 'Strategy',           options: {values: ['sequential','parallel']}, default_value: 'sequential', display_order: 41, group_name: 'Composite'},
    '@action.handler':            {id: '@action.handler',            class_id: '@prop', key: 'handler',            label: 'Handler',            data_type: 'function', field_type: 'javascript', display_order: 50, group_name: 'UI'},
    '@action.target_class_id':    {id: '@action.target_class_id',    class_id: '@prop', key: 'target_class_id',    label: 'Target Class',       data_type: 'relation', object_class_id: ['@class'], display_order: 51, group_name: 'UI'},
    '@action.requires_selection': {id: '@action.requires_selection', class_id: '@prop', key: 'requires_selection', label: 'Requires Selection', data_type: 'boolean', default_value: true, display_order: 52, group_name: 'UI'},
    '@action.bulk':               {id: '@action.bulk',               class_id: '@prop', key: 'bulk',               label: 'Bulk Action',        data_type: 'boolean', default_value: false, display_order: 53, group_name: 'UI'},
    '@action.confirm':            {id: '@action.confirm',            class_id: '@prop', key: 'confirm',            label: 'Confirm',            display_order: 54, group_name: 'UI'},
    '@action.icon':               {id: '@action.icon',               class_id: '@prop', key: 'icon',               label: 'Icon',               display_order: 55, group_name: 'UI'},

    // ══════════════════════════════════════════════════════════════
    // @event props (8)
    // ══════════════════════════════════════════════════════════════
    '@event.name':            {id: '@event.name',            class_id: '@prop', key: 'name',            label: 'Name',            required: true, display_order: 1},
    '@event.description':     {id: '@event.description',     class_id: '@prop', key: 'description',     label: 'Description',     field_type: 'textarea', display_order: 2},
    '@event.target_class_id': {id: '@event.target_class_id', class_id: '@prop', key: 'target_class_id', label: 'Target Class',    data_type: 'relation', object_class_id: ['@class'], display_order: 3},
    '@event.trigger':         {id: '@event.trigger',         class_id: '@prop', key: 'trigger',         label: 'Trigger',         options: {values: ['before_create','after_create','before_update','after_update','before_delete','after_delete','on_change','custom']}, display_order: 4},
    '@event.handler':         {id: '@event.handler',         class_id: '@prop', key: 'handler',         label: 'Handler',         data_type: 'function', field_type: 'javascript', required: true, display_order: 5},
    '@event.payload_schema':  {id: '@event.payload_schema',  class_id: '@prop', key: 'payload_schema',  label: 'Payload Schema',  data_type: 'object', is_array: true, object_class_id: ['@prop'], display_order: 6},
    '@event.async':           {id: '@event.async',           class_id: '@prop', key: 'async',           label: 'Async',           data_type: 'boolean', default_value: false, display_order: 7},
    '@event.priority':        {id: '@event.priority',        class_id: '@prop', key: 'priority',        label: 'Priority',        data_type: 'integer', default_value: 0, display_order: 8},

    // ══════════════════════════════════════════════════════════════
    // @provider props (9)
    // ══════════════════════════════════════════════════════════════
    '@provider.name':        {id: '@provider.name',        class_id: '@prop', key: 'name',        label: 'Name',              required: true, display_order: 1},
    '@provider.description': {id: '@provider.description', class_id: '@prop', key: 'description', label: 'Description',       field_type: 'textarea', display_order: 2},
    '@provider.base_url':    {id: '@provider.base_url',    class_id: '@prop', key: 'base_url',    label: 'Base URL',          field_type: 'url', display_order: 3},
    '@provider.auth':        {id: '@provider.auth',        class_id: '@prop', key: 'auth',        label: 'Authentication',    data_type: 'object', display_order: 4},
    '@provider.id_field':    {id: '@provider.id_field',    class_id: '@prop', key: 'id_field',    label: 'External ID Field', default_value: 'id', display_order: 5},
    '@provider.write_mode':  {id: '@provider.write_mode',  class_id: '@prop', key: 'write_mode',  label: 'Write Mode',        options: {values: ['crud','actions_only']}, default_value: 'actions_only', display_order: 6},
    '@provider.mapping':     {id: '@provider.mapping',     class_id: '@prop', key: 'mapping',     label: 'Field Mapping',     data_type: 'object', display_order: 7},
    '@provider.actions':     {id: '@provider.actions',     class_id: '@prop', key: 'actions',     label: 'Actions',           data_type: 'relation', object_class_id: ['@action'], is_array: true, display_order: 8},
    '@provider.params':      {id: '@provider.params',      class_id: '@prop', key: 'params',      label: 'Default Parameters',data_type: 'object', display_order: 9},

    // ══════════════════════════════════════════════════════════════
    // crud_provider props (7) — extends @provider
    // ══════════════════════════════════════════════════════════════
    'crud_provider.get_one':    {id: 'crud_provider.get_one',    class_id: '@prop', key: 'get_one',    label: 'Get One Endpoint',    display_order: 10},
    'crud_provider.get_list':   {id: 'crud_provider.get_list',   class_id: '@prop', key: 'get_list',   label: 'Get List Endpoint',   display_order: 11},
    'crud_provider.create_one': {id: 'crud_provider.create_one', class_id: '@prop', key: 'create_one', label: 'Create One Endpoint', display_order: 12},
    'crud_provider.update_one': {id: 'crud_provider.update_one', class_id: '@prop', key: 'update_one', label: 'Update One Endpoint', display_order: 13},
    'crud_provider.delete_one': {id: 'crud_provider.delete_one', class_id: '@prop', key: 'delete_one', label: 'Delete One Endpoint', display_order: 14},
    'crud_provider.paginator':  {id: 'crud_provider.paginator',  class_id: '@prop', key: 'paginator',  label: 'Paginator',           data_type: 'object', display_order: 15},
    'crud_provider.filters':    {id: 'crud_provider.filters',    class_id: '@prop', key: 'filters',    label: 'Filter Params',       is_array: true, display_order: 16},

    // ══════════════════════════════════════════════════════════════
    // Built-in storage instances
    // ══════════════════════════════════════════════════════════════
    'local': {id: 'local', class_id: '@storage', name: 'Local', type: 'local'},
};


// ═══════════════════════════════════════════════════════════════════════════
// LOCAL ID GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

var _localIdCounter = 0;
function generateLocalId() {
    return '_' + (++_localIdCounter) + '_' + Math.random().toString(36).substr(2, 6);
}


// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZE CLASS IDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize object_class_id to array|null.
 * Accepts string, array, null/undefined. Always returns array or null.
 * @param {*} val
 * @returns {string[]|null}
 */
function normalizeClassIds(val) {
    if (val === null || val === undefined) return null;
    if (Array.isArray(val)) return val.length > 0 ? val : null;
    if (typeof val === 'string' && val) return [val];
    return null;
}


// ═══════════════════════════════════════════════════════════════════════════
// BUILT-IN VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════

var _validators = {
    email: function(val) {
        if (!val) return null;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : 'Invalid email address';
    },
    url: function(val) {
        if (!val) return null;
        try { new URL(val); return null; } catch (e) { return 'Invalid URL'; }
    },
    phone: function(val) {
        if (!val) return null;
        return /^[+]?[\d\s\-().]{7,20}$/.test(val) ? null : 'Invalid phone number';
    },
    json: function(val) {
        if (!val) return null;
        try { JSON.parse(val); return null; } catch (e) { return 'Invalid JSON'; }
    },
    regex: function(val, params) {
        if (!val || !params || !params.pattern) return null;
        try {
            return new RegExp(params.pattern).test(val) ? null : 'Does not match pattern';
        } catch (e) { return null; }
    },
    range: function(val, params) {
        if (val === null || val === undefined || !params) return null;
        var num = parseFloat(val);
        if (isNaN(num)) return null;
        if (params.min !== undefined && num < params.min) return 'Minimum is ' + params.min;
        if (params.max !== undefined && num > params.max) return 'Maximum is ' + params.max;
        return null;
    },
    length: function(val, params) {
        if (!val || !params) return null;
        var len = String(val).length;
        if (params.min_length !== undefined && len < params.min_length) return 'Minimum length is ' + params.min_length;
        if (params.max_length !== undefined && len > params.max_length) return 'Maximum length is ' + params.max_length;
        return null;
    },
    date_range: function(val, params) {
        if (!val || !params) return null;
        if (params.min_date && val < params.min_date) return 'Date must be after ' + params.min_date;
        if (params.max_date && val > params.max_date) return 'Date must be before ' + params.max_date;
        return null;
    },
    enum_value: function(val, params) {
        if (!val || !params || !params.values) return null;
        return params.values.indexOf(val) >= 0 ? null : 'Must be one of: ' + params.values.join(', ');
    }
};


// ═══════════════════════════════════════════════════════════════════════════
// JWT TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

var _jwtToken = null;

/**
 * Set the JWT token for API authentication.
 * @param {string|null} token - JWT Bearer token, or null to clear
 */
function setJwtToken(token) {
    _jwtToken = token;
}

/**
 * Get the current JWT token.
 * @returns {string|null}
 */
function getJwtToken() {
    return _jwtToken;
}


// ═══════════════════════════════════════════════════════════════════════════
// CLASS REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

const classRegistry = {};

function registerClass(classId, constructor) {
    classRegistry[classId] = constructor;
}

// ═══════════════════════════════════════════════════════════════════════════
// ATOM COLLECTION
// ═══════════════════════════════════════════════════════════════════════════

class AtomCollection {

    /**
     * @param {Array} items - Raw array reference (from parent data)
     * @param {ElementStore} store
     * @param {string} [classId] - Class of items (e.g. '@prop')
     */
    constructor(items, store, classId) {
        this._items = items;    // same reference as parent data
        this._store = store;
        this._classId = classId || null;
        this._onAdd = [];
        this._onRemove = [];
    }

    /** Register callback for item additions */
    onAdd(fn) { this._onAdd.push(fn); return this; }

    /** Register callback for item removals */
    onRemove(fn) { this._onRemove.push(fn); return this; }

    get length() {
        return this._items.length;
    }

    /** Find item by key field */
    get(key) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].key === key) {
                return this._wrap(i);
            }
        }
        return null;
    }

    /** Find item by id field */
    getById(id) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].id === id) {
                return this._wrap(i);
            }
        }
        return null;
    }

    /** Filter items by object filter */
    find(filter) {
        var results = [];
        var self = this;
        this._items.forEach(function (item, i) {
            var match = true;
            Object.keys(filter).forEach(function (k) {
                if (item[k] !== filter[k]) match = false;
            });
            if (match) results.push(self._wrap(i));
        });
        return results;
    }

    /** Iterate items as AtomObj */
    forEach(fn) {
        var self = this;
        this._items.forEach(function (item, i) {
            fn(self._wrap(i), i);
        });
    }

    /** Map items as AtomObj */
    map(fn) {
        var self = this;
        var results = [];
        this._items.forEach(function (item, i) {
            results.push(fn(self._wrap(i), i));
        });
        return results;
    }

    /** Add item to collection (accepts raw object or AtomObj) */
    add(obj) {
        if (!(obj instanceof AtomObj) && this._store) {
            if (this._classId && !obj.class_id) {
                obj.class_id = this._classId;
            }
            obj = new AtomObj(obj, this._store);
        }
        this._items.push(obj);
        // Fire onAdd hooks
        var hooks = this._onAdd;
        for (var h = 0; h < hooks.length; h++) hooks[h](obj);
        return obj;
    }

    /** Remove item by key */
    remove(key) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].key === key) {
                var removed = this._items.splice(i, 1)[0];
                var hooks = this._onRemove;
                for (var h = 0; h < hooks.length; h++) hooks[h](removed);
                return true;
            }
        }
        return false;
    }

    /** Remove item by id */
    removeById(id) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].id === id) {
                var removed = this._items.splice(i, 1)[0];
                var hooks = this._onRemove;
                for (var h = 0; h < hooks.length; h++) hooks[h](removed);
                return true;
            }
        }
        return false;
    }

    /**
     * Move an item to a new index position within the collection.
     * Splices from old position, inserts at new. Marks parent dirty.
     * @param {AtomObj|Object} item - The item to move (matched by reference or id)
     * @param {number} newIndex - Target index (0-based)
     * @returns {boolean} true if moved successfully
     */
    setItemIndex(item, newIndex) {
        var oldIndex = -1;
        var itemId = item.id || item._id;
        for (var i = 0; i < this._items.length; i++) {
            var cur = this._items[i];
            if (cur === item || (itemId && (cur.id === itemId || cur._id === itemId))) {
                oldIndex = i;
                break;
            }
        }
        if (oldIndex === -1 || oldIndex === newIndex) return false;

        // Clamp newIndex
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= this._items.length) newIndex = this._items.length - 1;

        // Splice out and insert at new position
        var removed = this._items.splice(oldIndex, 1)[0];
        this._items.splice(newIndex, 0, removed);

        // Mark the item as order-changed for dirty tracking
        if (removed && removed._orderChanged !== undefined) {
            removed._orderChanged = true;
        }
        return true;
    }

    /**
     * Save all dirty children, then trigger parent sync + save.
     * Convenience method for batch-saving collection changes.
     */
    save() {
        if (!this._store) throw new Error('AtomCollection.save: no store');
        // Save dirty items
        for (var i = 0; i < this._items.length; i++) {
            var item = this._items[i];
            if (item && typeof item.hasChanges === 'function' && item.hasChanges()) {
                item.save();
            }
        }
    }

    /** Iterator support — enables for...of */
    [Symbol.iterator]() {
        var self = this;
        var index = 0;
        return {
            next: function() {
                if (index < self._items.length) {
                    return {value: self._wrap(index++), done: false};
                }
                return {done: true};
            }
        };
    }

    /** Return a safe copy of wrapped items */
    snapshot() {
        var self = this;
        var result = [];
        for (var i = 0; i < this._items.length; i++) {
            result.push(self._wrap(i));
        }
        return result;
    }

    /** Return raw array for serialization */
    toJSON() {
        return this._items;
    }

    /** Wrap raw item at index as AtomObj (factory resolves constructor) */
    _wrap(index) {
        var item = this._items[index];
        if (this._classId && !item.class_id) {
            item.class_id = this._classId;
        }
        return new AtomObj(item, this._store);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ATOM OBJ
// ═══════════════════════════════════════════════════════════════════════════

class AtomObj {
    static CLASS_ID = '@atom';

    /** @type {ElementStore} */
    store = null;
    /** @type {string} */
    class_id = null;
    /** @type {string} */
    id = null;
    /** @type {Object.<string, *>} */
    data = {};
    /** @type {Object.<string, AtomObj|AtomObj[]>} related objects keyed by property name */
    objects = {};
    /** @type {AtomClass|null} class definition */
    _class = null;
    /** @type {Object|null} */
    _snapshot = null;
    /** @type {string} client-local identity, never sent to server */
    _id = null;
    /** @type {AtomObj[]} all related AtomObj instances */
    _related = [];
    /** @type {AtomObj[]} subset of _related needing save */
    _dirtyRelated = [];
    /** @type {AtomObj[]} parent objects that own this object */
    _belongsTo = [];
    /** @type {Function[]} onChange callbacks: fn({obj, prop, value, oldValue}) */
    _onChange = [];

    /**
     * @param {Object|string} raw - Raw data object, or class_id string (new object)
     * @param {ElementStore} [store] - The ElementStore this object belongs to
     */
    constructor(raw, store) {
        // ── Factory: resolve correct subclass via extends_id chain ──
        if (new.target === AtomObj && store) {
            var cid = (typeof raw === 'string') ? raw : (raw && raw.class_id);
            if (cid) {
                var Ctor = store.resolveConstructor(cid);
                if (Ctor && Ctor !== AtomObj) {
                    return new Ctor(raw, store);
                }
            }
        }

        this.store = store || null;
        this.objects = {};
        this._id = generateLocalId();
        this._related = [];
        this._dirtyRelated = [];
        this._belongsTo = [];
        this._onChange = [];

        // String → new object of that class
        if (typeof raw === 'string') {
            raw = {class_id: raw};
        }

        // Must be object with class_id
        if (!raw || typeof raw !== 'object' || !raw.class_id) {
            throw new Error('AtomObj: class_id is required');
        }

        // Use raw as data by reference
        this.data = raw;

        // Normalize object_class_id to array|null
        if (raw.object_class_id !== undefined) {
            raw.object_class_id = normalizeClassIds(raw.object_class_id);
        }

        // Load class definition from store (null during seed bootstrap)
        this._class = this.store ? (this.store.getObject(raw.class_id) || null) : null;

        var proxy = new Proxy(this, {
            get: function (target, prop, receiver) {
                // internal fields — bypass data
                if (prop === 'store' || prop === 'data' || prop === 'objects' || prop === '_class' || prop === '_snapshot' || prop === '_id' || prop === '_related' || prop === '_dirtyRelated' || prop === '_belongsTo' || prop === '_onChange' || prop === 'el' || prop === 'auth' || prop === 'authUrl' || prop === 'onAuthRequired' || prop === '_refreshing' || prop === '_refreshPromise') return target[prop];
                // methods — bind to proxy so 'this' resolves through proxy
                if (typeof target[prop] === 'function') return target[prop].bind(receiver);
                // data fields — delegate to propDef if available
                if (prop in target.data) {
                    if (target._class && target.store && prop !== 'id' && prop !== 'class_id') {
                        var propDef = target.store.findPropDef(target.data.class_id, prop);
                        if (propDef && typeof propDef.getPropValue === 'function') {
                            return propDef.getPropValue(target, prop);
                        }
                    }
                    return target.data[prop];
                }
                // class field defaults
                return target[prop];
            },
            set: function (target, prop, val) {
                // internal fields — bypass data
                if (prop === 'store' || prop === 'data' || prop === 'objects' || prop === '_class' || prop === '_snapshot' || prop === '_id' || prop === '_related' || prop === '_dirtyRelated' || prop === '_belongsTo' || prop === '_onChange' || prop === 'el' || prop === 'auth' || prop === 'authUrl' || prop === 'onAuthRequired' || prop === '_refreshing' || prop === '_refreshPromise') {
                    target[prop] = val;
                    return true;
                }
                // delegate to propDef for type validation/coercion
                if (target._class && target.store && prop !== 'id' && prop !== 'class_id') {
                    var classId = target.data.class_id;
                    if (classId) {
                        var propDef = target.store.findPropDef(classId, prop);
                        if (propDef && typeof propDef.setPropValue === 'function') {
                            return propDef.setPropValue(target, prop, val);
                        }
                        // warn if class has props but this one is unknown
                        if (target.store.collectClassProps(classId).length > 0) {
                            console.warn('AtomObj: unknown prop "' + prop + '" for class ' + classId);
                        }
                    }
                }
                // Notify parents this object is dirty
                if (target._belongsTo && target._belongsTo.length > 0) {
                    var self = target;
                    target._belongsTo.forEach(function(parent) {
                        if (parent._dirtyRelated.indexOf(self) === -1) {
                            parent._dirtyRelated.push(self);
                        }
                    });
                }
                var oldVal = target.data[prop];
                target.data[prop] = val;
                // Fire onChange callbacks
                if (target._onChange && target._onChange.length > 0) {
                    var info = {obj: target, prop: prop, value: val, oldValue: oldVal};
                    target._onChange.forEach(function(fn) { fn(info); });
                }
                return true;
            }
        });

        // Existing object (has id) → take snapshot for change tracking
        // New object (no id) → apply defaults from class definition
        if (this.data.id) {
            this._snapshot = JSON.parse(JSON.stringify(this.data));
        } else {
            this._applyDefaults();
            this._snapshot = null;
        }

        return proxy;
    }

    /** Get prop definitions for this object's class (includes inherited) */
    getProps() {
        if (!this.store) return [];
        return this.store.collectClassProps(this.class_id);
    }

    /** Get a specific prop definition by key (walks inheritance) */
    getPropDef(key) {
        if (!this.store) return null;
        return this.store.findPropDef(this.class_id, key);
    }

    /** Apply default values from class prop definitions (includes inherited) */
    _applyDefaults() {
        if (!this.store) return;
        var classId = this.data.class_id;
        if (!classId) return;
        var data = this.data;
        var props = this.store.collectClassProps(classId);
        props.forEach(function(propObj) {
            // Extract key from prop id (e.g. 'ui-element.x' → 'x')
            var dotIdx = propObj.id.lastIndexOf('.');
            var key = dotIdx >= 0 ? propObj.id.substring(dotIdx + 1) : propObj.id;
            if (data[key] === undefined) {
                var def = propObj.default_value;
                if (def !== undefined && def !== null) {
                    data[key] = def;
                }
            }
        });
    }

    /** Check if data changed since load */
    hasChanges() {
        if (!this._snapshot) return true; // new object
        return JSON.stringify(this.data) !== JSON.stringify(this._snapshot);
    }

    /** Get changed fields (diff vs snapshot) */
    getChanges() {
        if (!this._snapshot) return Object.assign({}, this.data); // new: all fields
        var changes = {};
        var data = this.data;
        var snap = this._snapshot;
        Object.keys(data).forEach(function (k) {
            if (JSON.stringify(data[k]) !== JSON.stringify(snap[k])) {
                changes[k] = data[k];
            }
        });
        Object.keys(snap).forEach(function (k) {
            if (!(k in data)) {
                changes[k] = null; // deleted field
            }
        });
        return changes;
    }

    /** Save to store — recursive, children-first (updates snapshot) */
    save() {
        if (!this.store) throw new Error('save: no store assigned');

        // 1. Save dirty related objects first (children before parent)
        var dirtyList = this._dirtyRelated.slice();
        for (var i = 0; i < dirtyList.length; i++) {
            dirtyList[i].save();
        }
        this._dirtyRelated = [];

        // 2. Rebuild raw ID arrays for relation properties from _related objects
        this._syncRelationIds();

        // 3. Register locally
        var key = this.id || this._id;
        this.store.objects[key] = this;

        // 4. Persist via class-resolved storage
        var storage = this.store._resolveStorage(this.data.class_id);
        if (storage && storage.url) {
            this.store.saveRemote(this, storage);
        }

        this._snapshot = JSON.parse(JSON.stringify(this.data));
    }

    /** Walk relation props, rebuild raw ID arrays/values from actual objects */
    _syncRelationIds() {
        if (!this.store || !this._class) return;
        var data = this.data;
        var objects = this.objects;
        var props = this.store.collectClassProps(this.data.class_id);
        props.forEach(function(propObj) {
            if (propObj.data_type !== 'relation') return;
            var dotIdx = propObj.id.lastIndexOf('.');
            var key = dotIdx >= 0 ? propObj.id.substring(dotIdx + 1) : propObj.id;
            var relObjs = objects[key];
            if (!relObjs) return;
            if (propObj.is_array && Array.isArray(relObjs)) {
                data[key] = relObjs.map(function(o) { return o.id || o._id; });
            } else if (relObjs instanceof AtomObj) {
                data[key] = relObjs.id || relObjs._id;
            }
        });
    }

    /**
     * Add a child object to an array-relation property.
     * Registers in objects[propName], _related, _belongsTo, _dirtyRelated, and data[propName].
     * @param {string} propName - Relation property key (e.g. 'children')
     * @param {AtomObj} child - The child object to add
     */
    addChild(propName, child) {
        // Init objects array if needed
        if (!this.objects[propName]) this.objects[propName] = [];
        // Avoid duplicates
        var childKey = child.id || child._id;
        for (var i = 0; i < this.objects[propName].length; i++) {
            var existing = this.objects[propName][i];
            if (existing === child || existing.id === childKey || existing._id === childKey) return;
        }
        this.objects[propName].push(child);
        // Register relation links
        if (this._related.indexOf(child) === -1) this._related.push(child);
        if (child._belongsTo.indexOf(this) === -1) child._belongsTo.push(this);
        if (this._dirtyRelated.indexOf(child) === -1) this._dirtyRelated.push(child);
        // Keep data array in sync (will be rebuilt by _syncRelationIds on save, but useful for UI reads)
        if (!this.data[propName]) this.data[propName] = [];
        if (this.data[propName].indexOf(childKey) === -1) this.data[propName].push(childKey);
    }

    /**
     * Remove a child object from an array-relation property.
     * @param {string} propName - Relation property key
     * @param {AtomObj} child - The child to remove
     */
    removeChild(propName, child) {
        var childKey = child.id || child._id;
        // Remove from objects array
        if (this.objects[propName]) {
            this.objects[propName] = this.objects[propName].filter(function(o) {
                return o !== child && o.id !== childKey && o._id !== childKey;
            });
        }
        // Remove from _related
        var idx = this._related.indexOf(child);
        if (idx >= 0) this._related.splice(idx, 1);
        // Remove from child's _belongsTo
        idx = child._belongsTo.indexOf(this);
        if (idx >= 0) child._belongsTo.splice(idx, 1);
        // Remove from _dirtyRelated
        idx = this._dirtyRelated.indexOf(child);
        if (idx >= 0) this._dirtyRelated.splice(idx, 1);
        // Remove from data array
        if (this.data[propName]) {
            idx = this.data[propName].indexOf(childKey);
            if (idx >= 0) this.data[propName].splice(idx, 1);
        }
    }

    /** Get related objects that have unsaved changes */
    getDirtyObjects() {
        var dirty = [];
        var objs = this.objects;
        Object.keys(objs).forEach(function (propName) {
            var val = objs[propName];
            if (Array.isArray(val)) {
                val.forEach(function (obj) {
                    if (obj && obj.hasChanges && obj.hasChanges()) dirty.push(obj);
                });
            } else if (val && val.hasChanges && val.hasChanges()) {
                dirty.push(val);
            }
        });
        return dirty;
    }

    /**
     * Validate all props on this object (advisory — server is final authority).
     * Returns null if valid, or { propKey: ['error', ...], ... } if invalid.
     * @returns {Object|null}
     */
    validate() {
        if (!this.store) return null;
        var props = this.store.collectClassProps(this.data.class_id);
        if (!props || props.length === 0) return null;
        var data = this.data;
        var errors = {};
        props.forEach(function(propObj) {
            var key = propObj.data ? propObj.data.key : propObj.key;
            if (!key) {
                var dotIdx = (propObj.data ? propObj.data.id : propObj.id || '').lastIndexOf('.');
                key = dotIdx >= 0 ? (propObj.data ? propObj.data.id : propObj.id).substring(dotIdx + 1) : null;
            }
            if (!key) return;
            var propErrors = [];
            var val = data[key];
            var pData = propObj.data || propObj;

            // Required check
            if (pData.required && (val === null || val === undefined || val === '')) {
                propErrors.push(key + ' is required');
            }

            // Type check (only if value is present)
            if (val !== null && val !== undefined && val !== '') {
                switch (pData.data_type) {
                    case 'integer':
                        if (typeof val === 'string') val = parseInt(val, 10);
                        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
                            propErrors.push(key + ' must be an integer');
                        }
                        break;
                    case 'float':
                        if (typeof val === 'string') val = parseFloat(val);
                        if (typeof val !== 'number' || isNaN(val)) {
                            propErrors.push(key + ' must be a number');
                        }
                        break;
                    case 'boolean':
                        // Coerce — no error for truthy/falsy
                        break;
                    case 'string':
                        if (typeof val !== 'string') {
                            propErrors.push(key + ' must be a string');
                        }
                        break;
                }

                // Options.values check (enum constraint)
                var opts = pData.options;
                if (opts && opts.values && Array.isArray(opts.values) && opts.values.length > 0) {
                    if (opts.values.indexOf(val) < 0 && !(opts.allow_custom)) {
                        propErrors.push(key + ' must be one of: ' + opts.values.join(', '));
                    }
                }

                // String length checks
                if (pData.data_type === 'string' && typeof val === 'string') {
                    if (opts && opts.min_length !== undefined && val.length < opts.min_length) {
                        propErrors.push(key + ' minimum length is ' + opts.min_length);
                    }
                    if (opts && opts.max_length !== undefined && val.length > opts.max_length) {
                        propErrors.push(key + ' maximum length is ' + opts.max_length);
                    }
                    if (opts && opts.pattern) {
                        try {
                            if (!new RegExp(opts.pattern).test(val)) {
                                propErrors.push(key + ' does not match pattern');
                            }
                        } catch (e) { /* ignore invalid regex */ }
                    }
                }

                // Number range checks
                if ((pData.data_type === 'integer' || pData.data_type === 'float') && typeof val === 'number') {
                    if (opts && opts.min !== undefined && val < opts.min) {
                        propErrors.push(key + ' minimum is ' + opts.min);
                    }
                    if (opts && opts.max !== undefined && val > opts.max) {
                        propErrors.push(key + ' maximum is ' + opts.max);
                    }
                }
            }

            if (propErrors.length > 0) errors[key] = propErrors;
        });
        return Object.keys(errors).length > 0 ? errors : null;
    }

    /** Batch update multiple fields at once */
    update(updates) {
        if (!updates || typeof updates !== 'object') return;
        var self = this;
        Object.keys(updates).forEach(function(k) {
            self[k] = updates[k];
        });
    }

    /**
     * Subscribe to changes on this object.
     * @param {Function} fn - Callback: ({obj, prop, value, oldValue}) => void
     * @returns {Function} Unsubscribe function
     */
    subscribe(fn) {
        this._onChange.push(fn);
        var onChange = this._onChange;
        return function() {
            var idx = onChange.indexOf(fn);
            if (idx >= 0) onChange.splice(idx, 1);
        };
    }

    /** Check if this object's class extends a given base class */
    extendsFrom(baseClassId) {
        if (!this.store) return false;
        return this.store.classExtends(this.data.class_id, baseClassId);
    }

    /** Get the full inheritance chain [self, parent, grandparent, ...] */
    getInheritanceChain() {
        if (!this.store) return [this.data.class_id];
        return this.store.getInheritanceChain(this.data.class_id);
    }

    /** Get merged default values from class definition (walks inheritance) */
    getClassDefaults() {
        if (!this.store) return {};
        return this.store.getResolvedDefaults(this.data.class_id);
    }

    /** Serialize to plain object */
    toJSON() {
        return this.data;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ATOM CLASS
// ═══════════════════════════════════════════════════════════════════════════

class AtomClass extends AtomObj {
    static CLASS_ID = '@class';

    class_id = '@class';

    // Returns all @prop objects for this class (including inherited via extends_id)
    getProps() {
        if (!this.store) return [];
        return this.store.collectClassProps(this.id);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ATOM PROP
// ═══════════════════════════════════════════════════════════════════════════

class AtomProp extends AtomObj {
    static CLASS_ID = '@prop';

    class_id = '@prop';
    key = null;
    name = null;
    description = null;
    data_type = null;
    is_array = false;
    object_class_id = null;
    object_class_strict = false;
    on_orphan = null;
    options = null;
    field_type = null;
    required = false;
    readonly = false;
    create_only = false;
    default_value = null;
    display_order = 0;
    group_name = null;
    hidden = false;
    master_only = false;
    server_only = false;

    /** Check if this is a relation property */
    isRelation() {
        return (this.data ? this.data.data_type : this.data_type) === 'relation';
    }

    /** Check if this is a single embedded object (not array) */
    isEmbeddedObject() {
        var dt = this.data ? this.data.data_type : this.data_type;
        var arr = this.data ? this.data.is_array : this.is_array;
        return dt === 'object' && this.hasTargetClasses() && !arr;
    }

    /** Check if this is an ownership relation (single, cascade delete) */
    isOwnershipRelation() {
        var dt = this.data ? this.data.data_type : this.data_type;
        var arr = this.data ? this.data.is_array : this.is_array;
        return dt === 'relation' && this.hasTargetClasses() && !arr;
    }

    /** Check if this is a reference relation (array, many-to-many) */
    isReferenceRelation() {
        var dt = this.data ? this.data.data_type : this.data_type;
        var arr = this.data ? this.data.is_array : this.is_array;
        return dt === 'relation' && this.hasTargetClasses() && !!arr;
    }

    /** Check if target classes are defined */
    hasTargetClasses() {
        var oci = this.data ? this.data.object_class_id : this.object_class_id;
        return oci !== null && oci !== undefined && Array.isArray(oci) && oci.length > 0;
    }

    /** Get target class IDs as array */
    getTargetClasses() {
        var oci = this.data ? this.data.object_class_id : this.object_class_id;
        if (!oci) return [];
        return Array.isArray(oci) ? oci : [oci];
    }

    /** Get the primary (first) target class ID */
    getPrimaryTargetClass() {
        var classes = this.getTargetClasses();
        return classes.length > 0 ? classes[0] : null;
    }

    /** Check if orphaned objects should be deleted */
    shouldDeleteOnOrphan() {
        var orphan = this.data ? this.data.on_orphan : this.on_orphan;
        return orphan === 'delete';
    }

    /**
     * Get typed value from sender object
     * @param {AtomObj} senderObj - The object that holds the value
     * @param {string} propName - The property key
     * @returns {*} object | AtomCollection | AtomObj[] | AtomObj | string | boolean | number | function
     */
    getPropValue(senderObj, propName) {
        // Computed order_id: if item is in a parent's collection, return its index
        if (propName === 'order_id' && senderObj._belongsTo && senderObj._belongsTo.length > 0) {
            var parent = senderObj._belongsTo[0];
            if (parent && parent.objects) {
                var keys = Object.keys(parent.objects);
                for (var ki = 0; ki < keys.length; ki++) {
                    var arr = parent.objects[keys[ki]];
                    if (Array.isArray(arr)) {
                        var idx = arr.indexOf(senderObj);
                        if (idx === -1) {
                            // Try matching by id
                            for (var si = 0; si < arr.length; si++) {
                                if (arr[si].id === senderObj.id || arr[si]._id === senderObj._id) {
                                    idx = si;
                                    break;
                                }
                            }
                        }
                        if (idx >= 0) return idx;
                    }
                }
            }
        }

        var val = senderObj.data[propName];
        if (val === undefined || val === null) return val;

        var store = senderObj.store;

        switch (this.data_type) {
            case 'string':
                return String(val);
            case 'boolean':
                return !!val;
            case 'integer':
                return parseInt(val, 10) || 0;
            case 'float':
                return parseFloat(val) || 0;
            case 'object':
                if (this.is_array && Array.isArray(val)) {
                    var arrCls = Array.isArray(this.data.object_class_id) ? this.data.object_class_id[0] : this.data.object_class_id;
                    return new AtomCollection(val, store, arrCls);
                }
                if (typeof val === 'object' && this.data.object_class_id && store) {
                    var objCls = val._class_id || (Array.isArray(this.data.object_class_id) ? this.data.object_class_id[0] : this.data.object_class_id);
                    if (!val.class_id) val.class_id = objCls;
                    return new AtomObj(val, store);
                }
                return val;
            case 'relation':
                if (!store) return val;
                if (this.is_array && Array.isArray(val)) {
                    // Build/update objects array from _related + store lookups
                    if (!senderObj.objects[propName]) {
                        var items = [];
                        val.forEach(function (refId) {
                            // First check _related, then store
                            var found = null;
                            for (var i = 0; i < senderObj._related.length; i++) {
                                var r = senderObj._related[i];
                                if (r.id === refId || r._id === refId) { found = r; break; }
                            }
                            if (!found && store) found = store.getObject(refId);
                            if (found) items.push(found);
                        });
                        senderObj.objects[propName] = items;
                    }
                    return new AtomCollection(senderObj.objects[propName], store, this.object_class_id);
                }
                // single relation → objects[propName] = AtomObj
                if (!senderObj.objects[propName]) {
                    // Check _related first
                    var found = null;
                    for (var i = 0; i < senderObj._related.length; i++) {
                        var r = senderObj._related[i];
                        if (r.id === val || r._id === val) { found = r; break; }
                    }
                    if (!found) found = store.getObject(val);
                    if (found) senderObj.objects[propName] = found;
                }
                return senderObj.objects[propName] || val;
            case 'function':
                if (typeof val === 'function') return val;
                if (typeof val === 'string') {
                    try { return new Function('return ' + val)(); } catch (e) { return val; }
                }
                return val;
            default:
                return val;
        }
    }

    /**
     * Set and validate value on sender object
     * @param {AtomObj} senderObj - The object to set value on
     * @param {string} propName - The property key
     * @param {*} value - The value to set
     * @returns {boolean} success
     */
    setPropValue(senderObj, propName, value) {
        // Type coercion/validation
        switch (this.data_type) {
            case 'boolean':
                value = !!value;
                break;
            case 'integer':
                value = parseInt(value, 10);
                if (isNaN(value)) {
                    console.warn('setPropValue: expected integer for "' + propName + '"');
                    return false;
                }
                break;
            case 'float':
                value = parseFloat(value);
                if (isNaN(value)) {
                    console.warn('setPropValue: expected float for "' + propName + '"');
                    return false;
                }
                break;
            case 'string':
                if (value !== null && value !== undefined) {
                    value = String(value);
                }
                break;
            case 'relation':
                // Accept AtomObj → store object in objects[propName], id in data
                if (value instanceof AtomObj) {
                    senderObj.objects[propName] = value;
                    // Register in _related and _belongsTo
                    if (senderObj._related.indexOf(value) === -1) {
                        senderObj._related.push(value);
                    }
                    if (value._belongsTo.indexOf(senderObj) === -1) {
                        value._belongsTo.push(senderObj);
                    }
                    if (value.hasChanges && value.hasChanges()) {
                        if (senderObj._dirtyRelated.indexOf(value) === -1) {
                            senderObj._dirtyRelated.push(value);
                        }
                    }
                    value = value.id || value._id;
                }
                if (this.is_array && Array.isArray(value)) {
                    var relObjs = [];
                    value = value.map(function (v) {
                        if (v instanceof AtomObj) {
                            relObjs.push(v);
                            // Register in _related and _belongsTo
                            if (senderObj._related.indexOf(v) === -1) {
                                senderObj._related.push(v);
                            }
                            if (v._belongsTo.indexOf(senderObj) === -1) {
                                v._belongsTo.push(senderObj);
                            }
                            if (v.hasChanges && v.hasChanges()) {
                                if (senderObj._dirtyRelated.indexOf(v) === -1) {
                                    senderObj._dirtyRelated.push(v);
                                }
                            }
                            return v.id || v._id;
                        }
                        return v;
                    });
                    if (relObjs.length > 0) senderObj.objects[propName] = relObjs;
                }
                break;
            case 'object':
                // Accept AtomObj → store its data
                if (value instanceof AtomObj) {
                    value = value.data;
                }
                if (this.is_array && Array.isArray(value)) {
                    value = value.map(function (v) {
                        return v instanceof AtomObj ? v.data : v;
                    });
                }
                break;
        }

        // Required check
        if (this.required && (value === null || value === undefined || value === '')) {
            console.warn('setPropValue: "' + propName + '" is required');
        }

        senderObj.data[propName] = value;
        return true;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ATOM STORAGE
// ═══════════════════════════════════════════════════════════════════════════

class AtomStorage extends AtomObj {
    static CLASS_ID = '@storage';

    class_id = '@storage';
    url = null;
    type = null;

    // ── Auth state ──
    auth = null;            // { user, tokens: {accessToken, refreshToken}, app }
    authUrl = null;         // Auth service base URL (e.g., '/api/auth')
    onAuthRequired = null;  // Callback: () => void — shows login dialog
    _refreshing = false;
    _refreshPromise = null;

    /** Store auth data from login/refresh response. Syncs _jwtToken + localStorage. */
    setAuth(data) {
        this.auth = data;
        _jwtToken = data && data.tokens ? data.tokens.accessToken : null;
        if (data) {
            try { localStorage.setItem('es_auth', JSON.stringify(data)); } catch(e) {}
        } else {
            localStorage.removeItem('es_auth');
        }
    }

    /** Get current access token */
    getToken() {
        return this.auth && this.auth.tokens ? this.auth.tokens.accessToken : null;
    }

    /** Clear all auth state */
    clearAuth() {
        this.auth = null;
        _jwtToken = null;
        localStorage.removeItem('es_auth');
    }

    /** Restore auth from localStorage (call on startup) */
    restoreAuth() {
        try {
            var raw = localStorage.getItem('es_auth');
            if (raw) {
                this.auth = JSON.parse(raw);
                _jwtToken = this.auth && this.auth.tokens ? this.auth.tokens.accessToken : null;
                return true;
            }
        } catch(e) {}
        return false;
    }

    /** Async token refresh with deduplication (used by api.js) */
    refreshAuth() {
        if (this._refreshing && this._refreshPromise) return this._refreshPromise;
        var self = this;
        this._refreshing = true;
        this._refreshPromise = this._doRefreshAsync().finally(function() {
            self._refreshing = false;
            self._refreshPromise = null;
        });
        return this._refreshPromise;
    }

    _doRefreshAsync() {
        var rt = this.auth && this.auth.tokens ? this.auth.tokens.refreshToken : null;
        if (!rt || !this.authUrl) return Promise.resolve(false);
        var self = this;
        return fetch(self.authUrl + '/refresh', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({refreshToken: rt})
        }).then(function(res) {
            if (!res.ok) return false;
            return res.json().then(function(data) {
                self.auth.tokens.accessToken = data.accessToken;
                self.auth.tokens.refreshToken = data.refreshToken;
                _jwtToken = data.accessToken;
                try { localStorage.setItem('es_auth', JSON.stringify(self.auth)); } catch(e) {}
                return true;
            });
        }).catch(function() { return false; });
    }

    /** Sync token refresh (used by fetchRemote/saveRemote) */
    _syncRefreshAuth() {
        var rt = this.auth && this.auth.tokens ? this.auth.tokens.refreshToken : null;
        if (!rt || !this.authUrl) return false;
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', this.authUrl + '/refresh', false);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify({refreshToken: rt}));
            if (xhr.status === 200) {
                var data = JSON.parse(xhr.responseText);
                this.auth.tokens.accessToken = data.accessToken;
                this.auth.tokens.refreshToken = data.refreshToken;
                _jwtToken = data.accessToken;
                try { localStorage.setItem('es_auth', JSON.stringify(this.auth)); } catch(e) {}
                return true;
            }
        } catch(e) {}
        return false;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ELEMENT STORE
// ═══════════════════════════════════════════════════════════════════════════

class ElementStore {

    constructor(id, seedOverride) {
        this.id = id;
        this.objects = {};
        this.storage = null;  // AtomStorage for remote operations
        this._version = 0;    // Monotonic update counter
        this._subscribers = [];

        // Seed core definitions
        this.seed(seedOverride || seedData);
    }

    /** Seed data into the store (creates objects without triggering remote save) */
    seed(data) {
        var self = this;
        Object.values(data).forEach(function (raw) {
            self.setObject(raw);
        });
    }

    /** Resolve JS constructor for a class_id (walks extends_id chain) */
    resolveConstructor(classId) {
        if (classRegistry[classId]) return classRegistry[classId];
        var cls = this.objects[classId];
        if (cls && cls.data && cls.data.extends_id) {
            return this.resolveConstructor(cls.data.extends_id);
        }
        return null;
    }

    /** Find prop definition by walking extends_id chain */
    findPropDef(classId, key) {
        var visited = {};
        var cid = classId;
        while (cid && !visited[cid]) {
            visited[cid] = true;
            var propObj = this.objects[cid + '.' + key];
            if (propObj) return propObj;
            var classObj = this.objects[cid];
            cid = (classObj && classObj.data) ? classObj.data.extends_id || null : null;
        }
        return null;
    }

    /** Collect all prop definitions for a class (inherited, child overrides parent) */
    collectClassProps(classId) {
        var visited = {};
        var propsByKey = {};
        var chain = [];
        var cid = classId;
        while (cid && !visited[cid]) {
            visited[cid] = true;
            chain.push(cid);
            var classObj = this.objects[cid];
            cid = (classObj && classObj.data) ? classObj.data.extends_id || null : null;
        }
        var objs = this.objects;
        for (var i = chain.length - 1; i >= 0; i--) {
            var prefix = chain[i] + '.';
            Object.keys(objs).forEach(function(k) {
                if (k.indexOf(prefix) === 0 && objs[k].class_id === '@prop') {
                    propsByKey[k.substring(prefix.length)] = objs[k];
                }
            });
        }
        return Object.values(propsByKey);
    }

    // Get object — local first, then fetch remote
    // classId is optional optimization hint — without it, uses /find/{id} endpoint
    getObject(id, classId) {
        var obj = this.objects[id];
        if (obj) return obj;

        // Fetch from remote storage if configured
        if (this.storage) {
            var raw = this.fetchRemote(id, classId);
            if (raw) {
                obj = new AtomObj(raw, this);
                this.objects[id] = obj;
                return obj;
            }
        }

        return null;
    }

    // Get class definition
    getClass(classId) {
        var obj = this.getObject(classId);
        if (!obj) {
            throw new Error('getClass: class not found: ' + classId);
        }
        return obj;
    }

    // Register object in store (local memory only — use obj.save() to persist)
    setObject(obj) {
        if (!(obj instanceof AtomObj)) {
            if (!obj.class_id) {
                throw new Error('setObject: class_id is required');
            }
            obj = new AtomObj(obj, this);
        }

        // Store locally — key by id if available, otherwise _id
        var key = obj.id || obj._id;
        this.objects[key] = obj;
        this._version++;

        return obj;
    }

    /**
     * Resolve the storage for a class by walking the extends_id chain.
     * Returns the class-level storage if set, otherwise falls back to store.storage.
     * @param {string} classId
     * @returns {AtomStorage|null}
     */
    _resolveStorage(classId) {
        var visited = {};
        var cid = classId;
        while (cid && !visited[cid]) {
            visited[cid] = true;
            var classObj = this.objects[cid];
            if (!classObj) break;
            if (classObj.data && classObj.data.storage_id) {
                return this.objects[classObj.data.storage_id] || null;
            }
            cid = (classObj.data) ? classObj.data.extends_id || null : null;
        }
        return this.storage; // default store-level storage
    }

    /**
     * Find objects by filter.
     * Supports simple equality and $in operator for array matching.
     * @example store.find({ class_id: '@class' })
     * @example store.find({ class_id: { $in: ['@editor-input', '@editor-selector'] } })
     */
    find(filter) {
        var results = [];
        Object.values(this.objects).forEach(function (obj) {
            var match = true;
            var objData = obj.data || obj;
            Object.keys(filter).forEach(function (k) {
                var filterVal = filter[k];
                var objVal = objData[k] !== undefined ? objData[k] : obj[k];
                if (filterVal && typeof filterVal === 'object' && filterVal.$in) {
                    if (filterVal.$in.indexOf(objVal) < 0) match = false;
                } else {
                    if (objVal !== filterVal) match = false;
                }
            });
            if (match) results.push(obj);
        });
        return results;
    }

    /**
     * Set JWT token for authenticated API calls.
     * @param {string|null} token - JWT Bearer token
     */
    setToken(token) {
        setJwtToken(token);
    }

    // ═══════════════════════════════════════════════════════════════════
    // CLASS HELPERS
    // ═══════════════════════════════════════════════════════════════════

    /** Get class definition — returns null if not found (safe version) */
    getClassSafe(classId) {
        return this.objects[classId] || null;
    }

    /** Check if classId extends baseId (walks extends_id chain) */
    classExtends(classId, baseId) {
        if (classId === baseId) return true;
        var visited = {};
        var cid = classId;
        while (cid && !visited[cid]) {
            visited[cid] = true;
            var cls = this.objects[cid];
            if (!cls) return false;
            var parentId = cls.data ? cls.data.extends_id : cls.extends_id;
            if (parentId === baseId) return true;
            cid = parentId || null;
        }
        return false;
    }

    /** Get full inheritance chain [classId, parentId, grandparentId, ...] */
    getInheritanceChain(classId) {
        var chain = [];
        var visited = {};
        var cid = classId;
        while (cid && !visited[cid]) {
            visited[cid] = true;
            chain.push(cid);
            var cls = this.objects[cid];
            cid = (cls && cls.data) ? cls.data.extends_id || null : null;
        }
        return chain;
    }

    /** Get merged default values from class props (walks inheritance, child overrides parent) */
    getResolvedDefaults(classId) {
        var defaults = {};
        var props = this.collectClassProps(classId);
        props.forEach(function(propObj) {
            var pData = propObj.data || propObj;
            var key = pData.key;
            if (!key) {
                var dotIdx = (pData.id || '').lastIndexOf('.');
                key = dotIdx >= 0 ? pData.id.substring(dotIdx + 1) : null;
            }
            if (key && pData.default_value !== undefined && pData.default_value !== null) {
                defaults[key] = pData.default_value;
            }
        });
        return defaults;
    }

    /** Get all objects of a given class (includes subclasses) */
    getElementsByClass(classId) {
        var self = this;
        var results = [];
        Object.values(this.objects).forEach(function(obj) {
            var objClassId = obj.data ? obj.data.class_id : obj.class_id;
            if (objClassId === classId || self.classExtends(objClassId, classId)) {
                results.push(obj);
            }
        });
        return results;
    }

    /** Get all objects owned by a specific owner */
    getElementsByOwner(ownerId) {
        var results = [];
        Object.values(this.objects).forEach(function(obj) {
            var ownerField = obj.data ? obj.data.owner_id : obj.owner_id;
            if (ownerField === ownerId) results.push(obj);
        });
        return results;
    }

    /** Remove object from store */
    removeObject(id) {
        if (this.objects[id]) {
            delete this.objects[id];
            this._version++;
            this._notifySubscribers({type: 'remove', id: id});
            return true;
        }
        return false;
    }

    /**
     * Subscribe to store-level changes.
     * @param {Function} fn - Callback: ({type, id, obj}) => void
     * @returns {Function} Unsubscribe function
     */
    subscribe(fn) {
        this._subscribers.push(fn);
        var subs = this._subscribers;
        return function() {
            var idx = subs.indexOf(fn);
            if (idx >= 0) subs.splice(idx, 1);
        };
    }

    /** Notify all subscribers of a change */
    _notifySubscribers(event) {
        for (var i = 0; i < this._subscribers.length; i++) {
            try { this._subscribers[i](event); } catch(e) { console.warn('Subscriber error:', e); }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // APPLY REMOTE — merge external data into existing objects
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Apply external/remote data to an existing object.
     * Merges fields, updates snapshot (marks clean), triggers syncToDom.
     * If object doesn't exist, creates it via setObject.
     * @param {Object} raw - Data with at least {id, class_id}
     * @returns {AtomObj}
     */
    applyRemote(raw) {
        if (!raw || !raw.id) throw new Error('applyRemote: id is required');

        var existing = this.objects[raw.id];
        if (existing) {
            // Merge fields into existing data
            Object.keys(raw).forEach(function (k) {
                existing.data[k] = raw[k];
            });
            // Update snapshot — external data = clean state
            existing._snapshot = JSON.parse(JSON.stringify(existing.data));
            // Sync DOM if this is an AtomElement
            if (typeof existing.syncToDom === 'function') existing.syncToDom();
            return existing;
        }

        // Object doesn't exist yet — create it
        return this.setObject(raw);
    }

    /**
     * Save all objects that have unsaved changes.
     * Updates snapshots after saving.
     * @returns {Array} list of saved object ids
     */
    saveDirty() {
        var saved = [];
        var self = this;
        Object.values(this.objects).forEach(function (obj) {
            if (obj.hasChanges && obj.hasChanges()) {
                var storage = self._resolveStorage(obj.data ? obj.data.class_id : obj.class_id);
                if (storage && storage.url) self.saveRemote(obj, storage);
                obj._snapshot = JSON.parse(JSON.stringify(obj.data));
                saved.push(obj.id || obj._id);
            }
        });
        return saved;
    }

    // ═══════════════════════════════════════════════════════════════════
    // REMOTE STORAGE
    // API: http://master.local/elementStore/api/store/{class_id}/{id}
    // ═══════════════════════════════════════════════════════════════════

    fetchRemote(id, classId) {
        if (!this.storage || !this.storage.url) return null;

        var url;
        if (classId) {
            // Direct fetch: /store/{class}/{id}
            url = this.storage.url + '/store/' + encodeURIComponent(classId) + '/' + encodeURIComponent(id);
        } else {
            // Derive class_id from dot-prefix (e.g. '@class.name' → '@class')
            var dotIndex = id.indexOf('.');
            if (dotIndex > 0) {
                url = this.storage.url + '/store/' + encodeURIComponent(id.substring(0, dotIndex)) + '/' + encodeURIComponent(id);
            } else {
                // No class hint — use cross-class find endpoint
                url = this.storage.url + '/find/' + encodeURIComponent(id);
            }
        }

        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false); // sync
            xhr.setRequestHeader('Content-Type', 'application/json');
            if (_jwtToken) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + _jwtToken);
            }
            xhr.send();

            // 401 → try refresh + retry once
            if (xhr.status === 401 && this.storage && this.storage.auth) {
                if (this.storage._syncRefreshAuth()) {
                    xhr = new XMLHttpRequest();
                    xhr.open('GET', url, false);
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.setRequestHeader('Authorization', 'Bearer ' + _jwtToken);
                    xhr.send();
                } else if (this.storage.onAuthRequired) {
                    this.storage.onAuthRequired();
                    return null;
                }
            }

            if (xhr.status === 200) {
                return JSON.parse(xhr.responseText);
            }
        } catch (e) {
            console.warn('fetchRemote failed for ' + id + ':', e.message);
        }
        return null;
    }

    /**
     * Execute an action on an object.
     * PUT /store/{class}/{id}/{prop} — the PHP backend detects action-type props
     * (object_class_id includes '@action') and executes them via ActionExecutor.
     *
     * @param {string} classId    - Class of the target object
     * @param {string} objectId   - Object ID
     * @param {string} actionProp - Property name that references the @action
     * @param {Object} [params]   - Action parameters (sent as request body)
     * @returns {Object|null} Updated object data, or null on failure
     */
    executeAction(classId, objectId, actionProp, params) {
        if (!this.storage || !this.storage.url) {
            console.warn('executeAction: no storage configured');
            return null;
        }

        var url = this.storage.url + '/store/' +
            encodeURIComponent(classId) + '/' +
            encodeURIComponent(objectId) + '/' +
            encodeURIComponent(actionProp);

        try {
            var xhr = new XMLHttpRequest();
            xhr.open('PUT', url, false); // sync
            xhr.setRequestHeader('Content-Type', 'application/json');
            if (_jwtToken) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + _jwtToken);
            }
            xhr.send(JSON.stringify(params || {}));

            // 401 → try refresh + retry once
            if (xhr.status === 401 && this.storage && this.storage.auth) {
                if (this.storage._syncRefreshAuth()) {
                    xhr = new XMLHttpRequest();
                    xhr.open('PUT', url, false);
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.setRequestHeader('Authorization', 'Bearer ' + _jwtToken);
                    xhr.send(JSON.stringify(params || {}));
                } else if (this.storage.onAuthRequired) {
                    this.storage.onAuthRequired();
                    return null;
                }
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                var response = JSON.parse(xhr.responseText);
                // Apply updated object to local store
                if (response && response.id) {
                    this.applyRemote(response);
                }
                return response;
            } else {
                console.warn('executeAction failed: HTTP ' + xhr.status, xhr.responseText);
                return null;
            }
        } catch (e) {
            console.warn('executeAction failed:', e.message);
            return null;
        }
    }

    /**
     * @param {AtomObj} obj
     * @param {AtomStorage} [storage] - Storage to use (defaults to store.storage)
     */
    saveRemote(obj, storage) {
        var st = storage || this.storage;
        if (!st || !st.url) return;

        var classId = obj.class_id;
        var id = obj.id;
        var isNew = !id;
        var url, method;

        if (isNew) {
            url = st.url + '/store/' + encodeURIComponent(classId);
            method = 'POST';
        } else {
            url = st.url + '/store/' + encodeURIComponent(classId) + '/' + encodeURIComponent(id);
            method = 'PUT';
        }

        try {
            var xhr = new XMLHttpRequest();
            xhr.open(method, url, false); // sync
            xhr.setRequestHeader('Content-Type', 'application/json');
            if (_jwtToken) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + _jwtToken);
            }
            if (!isNew) xhr.setRequestHeader('X-Allow-Custom-Ids', 'true');
            xhr.send(JSON.stringify(obj.data));

            // 401 → try refresh + retry once
            if (xhr.status === 401 && this.storage && this.storage.auth) {
                if (this.storage._syncRefreshAuth()) {
                    xhr = new XMLHttpRequest();
                    xhr.open(method, url, false);
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.setRequestHeader('Authorization', 'Bearer ' + _jwtToken);
                    if (!isNew) xhr.setRequestHeader('X-Allow-Custom-Ids', 'true');
                    xhr.send(JSON.stringify(obj.data));
                } else if (this.storage.onAuthRequired) {
                    this.storage.onAuthRequired();
                    return;
                }
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                var response = JSON.parse(xhr.responseText);
                if (isNew && response.id) {
                    // Re-key: _id → id
                    var oldKey = obj._id;
                    obj.data.id = response.id;
                    this.objects[obj.id] = obj;
                    delete this.objects[oldKey];
                }
                // Merge server fields (created_at, updated_at, etc.)
                var self = this;
                Object.keys(response).forEach(function(k) {
                    obj.data[k] = response[k];
                });
            } else {
                console.warn('saveRemote failed: HTTP ' + xhr.status);
            }
        } catch (e) {
            console.warn('saveRemote failed:', e.message);
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// REGISTER CLASSES
// ═══════════════════════════════════════════════════════════════════════════

registerClass('@class', AtomClass);
registerClass('@prop', AtomProp);
registerClass('@storage', AtomStorage);


// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        seedData,
        classRegistry,
        registerClass,
        generateLocalId,
        normalizeClassIds,
        setJwtToken,
        getJwtToken,
        AtomObj,
        AtomClass,
        AtomProp,
        AtomStorage,
        AtomCollection,
        ElementStore,
    };
}

if (typeof window !== 'undefined') {
    window.seedData = seedData;
    window.classRegistry = classRegistry;
    window.registerClass = registerClass;
    window.generateLocalId = generateLocalId;
    window.normalizeClassIds = normalizeClassIds;
    window.setJwtToken = setJwtToken;
    window.getJwtToken = getJwtToken;
    window.AtomObj = AtomObj;
    window.AtomClass = AtomClass;
    window.AtomProp = AtomProp;
    window.AtomStorage = AtomStorage;
    window.AtomCollection = AtomCollection;
    window.ElementStore = ElementStore;

    // initialize
    store = new ElementStore('root.store');
    window.store = store;  // expose for F12 console
    storage = new AtomStorage({id: 'root.storage', class_id: '@storage', url: (typeof API_BASE !== 'undefined' ? API_BASE : '')}, store);
    store.storage = storage;
}
