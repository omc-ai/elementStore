// =====================================================================
// SEED DATA — Admin system class + prop definitions
//
// Loaded after dist/element-store.js.
// Seeds the store with system class schemas so the admin UI can
// render editors, modals, and validation rules for @class, @prop, etc.
//
// To update seed data: edit this file, then reload the admin page.
// The canonical source of truth for seed structure is:
//   elementStore/genesis/data/system.genesis.json
// =====================================================================

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
    '@prop.editor':              {id: '@prop.editor',              class_id: '@prop', key: 'editor',              label: 'Editor',         data_type: 'object', object_class_id: ['@editor'], options: {filter_by: {field: 'data_types', source: 'data_type'}}, display_order: 40, group_name: 'UI'},
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
    '@action.mapping':            {id: '@action.mapping',            class_id: '@prop', key: 'mapping',            label: 'Field Mapping (deprecated)', data_type: 'object', display_order: 13, group_name: 'API'},
    '@action.request_mapping':    {id: '@action.request_mapping',    class_id: '@prop', key: 'request_mapping',    label: 'Request Mapping',    data_type: 'object', display_order: 14, group_name: 'API'},
    '@action.response_mapping':   {id: '@action.response_mapping',   class_id: '@prop', key: 'response_mapping',   label: 'Response Mapping',   data_type: 'object', display_order: 15, group_name: 'API'},
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

// Seed into the store singleton (created by dist/element-store.js)
if (typeof store !== 'undefined' && store.seed) {
    store.seed(seedData);
}
