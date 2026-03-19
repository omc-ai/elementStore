/**
 * Tool Generator — converts elementStore classes into MCP tool definitions.
 *
 * Each class gets up to 5 tools: list, get, create, update, delete.
 * Plus generic tools: query, find, classes, class_props, health.
 */

/** Convert an ES data_type to a JSON Schema type */
function esTypeToJsonSchema(prop) {
  const typeMap = {
    string: { type: 'string' },
    boolean: { type: 'boolean' },
    integer: { type: 'integer' },
    float: { type: 'number' },
    number: { type: 'number' },
    datetime: { type: 'string', description: 'ISO 8601 datetime' },
    relation: { type: 'string', description: 'Object ID reference' },
    object: { type: 'object' },
    function: { type: 'string' },
  };

  let schema = typeMap[prop.data_type] || { type: 'string' };

  if (prop.is_array && prop.is_array !== 'false') {
    schema = { type: 'array', items: schema };
  }

  if (prop.options?.values) {
    if (Array.isArray(prop.options.values)) {
      schema.enum = prop.options.values;
    }
  }

  if (prop.description) schema.description = prop.description;
  if (prop.label && !schema.description) schema.description = prop.label;

  return schema;
}

/** Build JSON Schema properties from ES class props */
function propsToJsonSchema(props) {
  const properties = {};
  const required = [];

  for (const prop of props) {
    if (!prop.key || prop.key.startsWith('_')) continue;
    if (prop.server_only || prop.flags?.server_only) continue;
    if (prop.data_type === 'action') continue;

    properties[prop.key] = esTypeToJsonSchema(prop);

    if (prop.required || prop.flags?.required) {
      required.push(prop.key);
    }
  }

  return { properties, required };
}

/** Generate tools for a single class */
export function generateClassTools(classDef, props) {
  const classId = classDef.id;
  const className = classDef.name || classId;
  const safeName = classId.replace(/[^a-zA-Z0-9]/g, '_');
  const { properties, required } = propsToJsonSchema(props);

  const tools = [];

  // LIST
  tools.push({
    name: `es_list_${safeName}`,
    description: `List ${className} objects. Returns all instances of class "${classId}".`,
    inputSchema: {
      type: 'object',
      properties: {
        _limit: { type: 'integer', description: 'Max results (default 50)', default: 50 },
        _offset: { type: 'integer', description: 'Skip N results', default: 0 },
        _sort: { type: 'string', description: 'Sort field' },
        _order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
        filter: { type: 'object', description: 'Filter fields as key:value pairs', additionalProperties: true },
      },
    },
    _meta: { classId, operation: 'list' },
  });

  // GET
  tools.push({
    name: `es_get_${safeName}`,
    description: `Get a single ${className} object by ID.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: `The ${className} object ID` },
      },
      required: ['id'],
    },
    _meta: { classId, operation: 'get' },
  });

  // CREATE
  tools.push({
    name: `es_create_${safeName}`,
    description: `Create a new ${className} object. Class: "${classId}". Props: ${Object.keys(properties).join(', ')}`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Optional custom ID (auto-generated if omitted)' },
        ...properties,
      },
      required,
    },
    _meta: { classId, operation: 'create' },
  });

  // UPDATE
  tools.push({
    name: `es_update_${safeName}`,
    description: `Update an existing ${className} object. Only include fields you want to change.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: `The ${className} object ID to update` },
        ...properties,
      },
      required: ['id'],
    },
    _meta: { classId, operation: 'update' },
  });

  // DELETE
  tools.push({
    name: `es_delete_${safeName}`,
    description: `Delete a ${className} object by ID.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: `The ${className} object ID to delete` },
      },
      required: ['id'],
    },
    _meta: { classId, operation: 'delete' },
  });

  return tools;
}

/** Generate the static/generic tools that don't depend on class discovery */
export function generateGenericTools() {
  return [
    {
      name: 'es_health',
      description: 'Check elementStore server health and connectivity.',
      inputSchema: { type: 'object', properties: {} },
      _meta: { operation: 'health' },
    },
    {
      name: 'es_classes',
      description: 'List all available elementStore classes with their names and descriptions.',
      inputSchema: { type: 'object', properties: {} },
      _meta: { operation: 'classes' },
    },
    {
      name: 'es_class_props',
      description: 'Get the property definitions (schema) for a specific class, including inherited props.',
      inputSchema: {
        type: 'object',
        properties: {
          class_id: { type: 'string', description: 'The class ID (e.g. "@class", "ai:agent", "@feature")' },
        },
        required: ['class_id'],
      },
      _meta: { operation: 'class_props' },
    },
    {
      name: 'es_find',
      description: 'Find an object by ID across all classes.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The object ID to find' },
        },
        required: ['id'],
      },
      _meta: { operation: 'find' },
    },
    {
      name: 'es_query',
      description: 'Query objects of any class with filters. Use this for ad-hoc queries when you know the class ID.',
      inputSchema: {
        type: 'object',
        properties: {
          class_id: { type: 'string', description: 'The class to query' },
          filter: { type: 'object', description: 'Filter fields as key:value pairs', additionalProperties: true },
          _limit: { type: 'integer', description: 'Max results', default: 50 },
          _offset: { type: 'integer', description: 'Skip N results' },
          _sort: { type: 'string', description: 'Sort field' },
          _order: { type: 'string', enum: ['asc', 'desc'] },
        },
        required: ['class_id'],
      },
      _meta: { operation: 'query' },
    },
    {
      name: 'es_create',
      description: 'Create an object of any class. Use this when you know the class_id and want to create without a typed tool.',
      inputSchema: {
        type: 'object',
        properties: {
          class_id: { type: 'string', description: 'The class of the object to create' },
          data: { type: 'object', description: 'Object data (must include class_id)', additionalProperties: true },
        },
        required: ['class_id', 'data'],
      },
      _meta: { operation: 'generic_create' },
    },
    {
      name: 'es_update',
      description: 'Update an object of any class by ID.',
      inputSchema: {
        type: 'object',
        properties: {
          class_id: { type: 'string', description: 'The class of the object' },
          id: { type: 'string', description: 'Object ID' },
          data: { type: 'object', description: 'Fields to update', additionalProperties: true },
        },
        required: ['class_id', 'id', 'data'],
      },
      _meta: { operation: 'generic_update' },
    },
    {
      name: 'es_delete',
      description: 'Delete an object of any class by ID.',
      inputSchema: {
        type: 'object',
        properties: {
          class_id: { type: 'string', description: 'The class of the object' },
          id: { type: 'string', description: 'Object ID to delete' },
        },
        required: ['class_id', 'id'],
      },
      _meta: { operation: 'generic_delete' },
    },
    {
      name: 'es_action',
      description: 'Execute an elementStore @action by ID.',
      inputSchema: {
        type: 'object',
        properties: {
          action_id: { type: 'string', description: 'The action ID to execute' },
          params: { type: 'object', description: 'Parameters for the action', additionalProperties: true },
        },
        required: ['action_id'],
      },
      _meta: { operation: 'action' },
    },
  ];
}
