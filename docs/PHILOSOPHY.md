# ElementStore Philosophy
**By Asaf Azulay**

---

## Everything Is an Element

In ElementStore, there is no distinction between data and behavior, between schema and instance, between user content and system state. Everything is an element — an object that lives in the store, has a class definition, and follows the same rules.

A class definition is an element. A property definition is an element. A storage provider, an action, an event, an agent, a message, a finding — all elements. They are created, read, updated, and tracked through the same unified interface.

This is not a database. This is **the way data should exist**.

## The Store Is the Source of Truth

All data flows through ElementStore. Not through files, not through direct database calls, not through hardcoded logic. The store is the single point of truth for every piece of information in the system.

- **Genesis files** are exports of the store, not the source. When the store changes, files update. Not the other way around.
- **CouchDB** is a storage provider — one of potentially many. The store doesn't care where data physically lives.
- **WebSocket** broadcasts are change records (`@changes`) that flow through the store, not a separate system.

## Classes Describe the World

Every element has a class (`@class`). The class defines:
- What properties the element has (`@prop`)
- How each property behaves (data type, flags, validation, editors)
- Where the element is stored (storage providers)
- Whether changes are tracked (`track_changes`)
- What actions can be performed on it (`@action`)
- What events it emits (`@event`)

The class system is self-describing: `@class` is itself a class, `@prop` is a class, `@prop_flags` is a class. The schema describes itself using the same schema.

## Properties Have Flags

Every property on every class has behavioral flags (`@prop_flags`):

| Flag | Meaning |
|------|---------|
| `required` | Must have a value |
| `readonly` | Cannot be changed after creation |
| `hidden` | Not shown in default UI views |
| `create_only` | Writable only on creation |
| `server_only` | Never sent to clients |
| `master_only` | Only visible to admin interface |
| `from_parent` | Value auto-populated from parent object on create; protected from direct writes; cascaded when parent changes |

These flags are the rules. The server enforces them. The client respects them. No exceptions.

## Objects Have State

Every object carries `@state` — a server-managed lifecycle record:

| Field | Meaning |
|-------|---------|
| `readonly` | Object is sealed — no modifications allowed |
| `archived` | Object is soft-archived, hidden from default queries |
| `deleted` | Object is soft-deleted; the `@changes` record serves as the deletion notification |
| `version` | Points to the latest `@changes` record — the full change history chain |

`@state` is read-only for clients. Only the server (and system-level tools) can modify it. It is the ground truth of what an object IS, not just what it CONTAINS.

## Relations Bind Everything

Elements relate to each other through typed relations on properties:

- **`data_type: "relation"`** — this property points to another element
- **`is_array: false`** — single reference (belongs to)
- **`is_array: "indexed"`** — array of references (has many)
- **`options.foreign_key`** — which field on the related object points back
- **`options.cascade_delete`** — when this element is deleted, also delete related elements

Relations are not just links — they carry behavior. A `primary_id` with `from_parent` flags means the child automatically inherits context from its parent. This is prototype-chain inheritance for data.

## Changes Are First-Class

Every modification creates a `@changes` record:

```
@changes {
  items: [{
    // Full object data after the change
    name: "new name",
    description: "new desc",
    @state: { version: "this @changes ID" },

    // Previous values of changed fields
    old_values: {
      name: "old name",
      description: "old desc",
      @state: { version: "previous @changes ID" }
    }
  }],
  sender_id: "who made the change"
}
```

The `@state.version` on an object points to its latest `@changes`. Following `old_values.@state.version` backwards creates a linked chain — the complete history of every element.

Classes with `track_changes: false` opt out of this history (logs, temporary data, `@changes` itself).

## Data Structures Before Code

Before writing any code, declare the data structure as an ES class. The class definition IS the specification:
- What fields exist
- What types they have
- What constraints apply
- How they relate to other classes
- What actions operate on them

Agents, clients, and services all read the same class definition. If it's not in the store, it doesn't exist.

## Agents Are Elements Too

AI agents (`ai:agent`) are elements in the store. Their prompts, tools, behaviors, listeners, and sessions are all properties on their class. When an agent works on a task, the progress is recorded as `ai:message` elements linked via `primary_id` and `task_id`.

The agent doesn't need to know about files, databases, or APIs. It knows about elements. It reads elements, creates elements, updates elements. The store handles the rest.

## The Vision: arc3d

**Everything is an element, directly connected to its visual in the real world.**

Unlike an abstract "object" which could be anything, an element is something that has a concrete representation — in a UI, in a diagram, in a feed, in a dashboard. The elementStore doesn't just store data; it powers the visual experience of working with that data.

arc3d — Design, Deploy, Deliver. Every element you design becomes deployable infrastructure, every infrastructure component becomes a visual element you can interact with.

---

*ElementStore is not a product. It is a way of thinking about data.*
