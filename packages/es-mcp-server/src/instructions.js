/**
 * Server instructions — injected as MCP prompts so Claude knows
 * how to use the elementStore tools effectively.
 */

export const ES_SERVER_INSTRUCTIONS = `
# ElementStore MCP Server

You have access to a live elementStore instance — a self-describing object store where
classes are objects and everything is queryable via the same API.

## IMPORTANT: All Operations Through the Store

Every task, session, agent, and object operation MUST go through the elementStore.
The store is the single source of truth. Do NOT bypass it with direct file edits
or ad-hoc scripts when the store can handle the operation.

## Available Tools

### Generic CRUD (work with ANY class)
- **es_health** — Check server connectivity
- **es_classes** — List all classes (id, name, description)
- **es_class_props** — Get property schema for a class (including inherited props)
- **es_query** — Query objects with filters, sorting, pagination
- **es_create** — Create an object (provide class_id + data)
- **es_update** — Update an object (provide class_id, id, data)
- **es_delete** — Delete an object
- **es_find** — Find object by ID across all classes
- **es_action** — Execute an @action definition

## Session Startup

On every new session:
1. Call **es_health** to verify the store is up
2. Call **es_classes** to discover available classes
3. Register this session by creating an ai:session object:
   es_create({ class_id: "ai:session", data: { project: "<current_project>", branch: "<git_branch>", status: "active" } })
4. Check for the correct agent via: es_query({ class_id: "ai:agent", filter: { is_active: true } })

## Task Management — Everything Through the Store

When working on tasks, ALL tracking goes through elementStore:

### Start a task:
es_create({ class_id: "ai:task", data: {
  name: "<task_description>",
  status: "in_progress",
  project: "<project_name>",
  agent_id: "<assigned_agent>"
}})

### Complete a task:
es_update({ class_id: "ai:task", id: "<task_id>", data: {
  status: "done",
  result: "<summary_of_what_was_done>"
}})

### Task statuses: open → in_progress → blocked → done → wont_do

## Agent Management

Agents are defined as ai:agent objects in the store. Before starting ANY task:
1. Query active agents: es_query({ class_id: "ai:agent", filter: { is_active: true } })
2. Find the agent whose domain matches the task
3. Reference the agent in task creation

## Workflow

1. Use **es_classes** to discover what classes exist
2. Use **es_class_props** to understand a class's schema before creating/updating
3. Use **es_query** to list/search objects of a class
4. Use **es_create** / **es_update** / **es_delete** to mutate objects

## Key Concepts

- **class_id**: Every object belongs to a class (e.g. "ai:agent", "es:feature", "mcp:server")
- **id**: Objects have unique IDs, often namespaced (e.g. "agent:cdo", "feat:object_crud")
- **System classes**: Prefixed with @ (e.g. @class, @prop) — the meta-schema
- **Inheritance**: Classes can extend other classes via extends_id
- **Relations**: Properties can reference other objects via data_type: "relation"

## Feature-Driven Development

Every feature MUST be tracked:
1. Check if es:feature exists for it. If not, create one.
2. Check if es:app_feature exists for the target app. If not, create one with progress: "in_progress".
3. Implement the feature.
4. Update es:app_feature: set progress to "implemented", update implemented_in.

## Important Rules

- Always check es_class_props before creating objects to know required fields
- Use es_query with filters rather than listing all objects
- Object IDs should follow namespace:name convention
- All operations through the store — no bypassing with direct file edits
- Register sessions and tasks to maintain traceability
`;
