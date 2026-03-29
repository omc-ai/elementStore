# Object Flow — getObject & setObject

Complete condition chain for reading and writing objects in ElementStore.

---

## getObject(class_id, id)

```
INPUT: class_id, id
OUTPUT: AtomObj | null

1. VALIDATE INPUT
   → class_id and id required

2. CACHE CHECK
   → if cached, return cached object

3. LOAD FROM STORAGE
   → storage.getobj(class_id, id)
   → if null → return null

4. SECURITY ACCESS
   → if non-system class AND enforceOwnership:
     → checkSecurityAccess(data) — owner_id, app_id, domain, tenant_id
     → if denied → return null

5. SOFT DELETE FILTER
   → if @state.deleted = true → return null (unless explicitly requested)

6. RESOLVE INHERITED DATA (NEW)
   → load class meta + parent chain via extends_id
   → for each prop with options.source = "inherit":
     → walk chain via options.link = "chain", options.link_field
     → collect values from parent chain
     → merge with self using options.merge strategy:
       - "replace": self wins (default)
       - "override": assoc merge, self keys win
       - "append": concat arrays
     → group_by options.group_by field to deduplicate

7. RESOLVE RELATIONS (NEW)
   → for each prop with data_type = "relation":
     → if options.link = "embedded" (default):
       → read IDs from this object's prop (current behavior)
     → if options.link = "foreign_key":
       → query target class WHERE options.link_field = self.id
     → if options.link = "chain":
       → walk link_field recursively, collect + merge
     → apply options.filter_by if set
     → apply options.fields if set (project only these fields)

8. APPLY CONTEXT (NEW)
   → if request has context (e.g. "grid", "form", "me:app-name"):
     → read class contexts[context_name]
     → filter props by context.fields
     → override per-prop via prop.contexts[context_name]

9. CAST ON READ
   → normalizeObjectData — fill defaults, normalize arrays
   → apply options.fields from @options_object (default field set)

10. FACTORY + CACHE
    → create AtomObj
    → cache and return
```

---

## setObject(class_id, data)

```
INPUT: class_id, data (partial or full)
OUTPUT: AtomObj (saved)
THROWS: StorageException

1. BOOTSTRAP
   → ensureBootstrap()

2. LOAD CLASS META
   → getClass(class_id)
   → if null → simple merge mode (no validation)

3. LOAD OLD OBJECT (if id provided)
   → storage.getobj(class_id, id)
   → if null + non-system + no custom IDs → throw not_found

4. GUARDS (on existing object)

   4a. @state.readonly
       → if old @state.readonly = true:
         → admin/system role can override
         → others → throw forbidden

   4b. System class protection
       → if modifying @class + is_system:
         → admin/system role required
         → others → throw forbidden

   4c. CLI action protection
       → if class = @action + type = "cli":
         → admin role required

   4d. Security access
       → if non-system + enforceOwnership:
         → checkSecurityAccess(oldData)
         → if denied → throw forbidden

5. VALIDATE + MERGE
   → validate(class_id, data, oldData)
   → type checking, required fields, data_type validation
   → merge: oldData + incoming data
   → if validation errors → throw validation_failed

6. PROP FLAGS ENFORCEMENT

   6a. readonly props
       → if prop.flags.readonly = true AND oldData exists:
         → reject change, keep old value

   6b. create_only props
       → if prop.flags.create_only = true AND oldData exists:
         → reject change, keep old value

   6c. server_only props
       → strip from user input (unless system role)

   6d. from_parent props
       → ON CREATE: auto-populate from parent object via primary_id
       → ON UPDATE: reject direct writes, keep old value

7. DEFAULT VALUES (NEW)
   → for each prop with default value:
     → ON CREATE: if field not set → apply default
     → if prop.flags.readonly + default → always apply (locked default)
     → child class prop overrides parent default

8. STRIP INHERITED DATA (NEW)
   → for each prop with options.source = "inherit":
     → calculate parent chain value
     → compare incoming vs inherited
     → if same → strip from save (don't store inherited data)
     → if different → keep (this is an override)
     → result: only store the diff

9. UNIQUE KEY VALIDATION
   → for each key in class.keys (assoc object):
     → check fields[] combination is unique
     → exclude self (by id) on update
     → if auto_field set → generate next value
     → throw if duplicate

10. @state PROTECTION
    → non-system users: preserve old @state, strip user input
    → system role: can modify @state directly

11. STAMP SECURITY FIELDS (new objects only)
    → owner_id = current userId
    → app_id = current appId
    → domain = current domain
    → tenant_id = current tenantId

12. DETECT CHANGES
    → compare data vs oldData
    → if no changes → return existing object (skip save)

13. CREATE @changes RECORD
    → if class.track_changes != false:
      → create @changes object with items[] + old_values
      → compute schema_hash for @class changes
      → set @state.version = @changes ID

14. SAVE + SIDE EFFECTS (onChange)
    → storage.setobj(class_id, data)
    → broadcast via WebSocket
    → seed write-back (genesis sync)

15. FACTORY + CACHE + RETURN
    → create AtomObj
    → clearChanges, markSaved
    → cache and return
```

---

## deleteObject(class_id, id)

```
INPUT: class_id, id
OUTPUT: boolean

1. LOAD existing object
   → if null → return false

2. SECURITY ACCESS
   → checkSecurityAccess if non-system + enforceOwnership

3. @state.readonly GUARD
   → admin/system can override

4. SOFT DELETE
   → set @state.deleted = true
   → save via setObject (triggers @changes, WebSocket, etc.)

5. CLEAR CACHE

6. SEED DELETE-BACK
   → remove from genesis file if applicable
```

---

## query(class_id, filters, options)

```
INPUT: class_id, filters, options (sort, limit, offset)
OUTPUT: AtomObj[]

1. BOOTSTRAP

2. SECURITY FILTERS
   → if non-system + enforceOwnership + non-privileged:
     → inject owner_id, app_id, domain, tenant_id filters

3. STORAGE QUERY
   → storage.query(class_id, filters, options)

4. SOFT DELETE FILTER
   → exclude @state.deleted = true (unless explicitly queried)

5. RESOLVE INHERITED DATA (NEW — per object)
   → same as getObject step 6, applied to each result

6. APPLY CONTEXT (NEW)
   → same as getObject step 8

7. CAST ON READ
   → normalize each object

8. FACTORY
   → convert to AtomObj array
```

---

## Prop Resolution Order (NEW)

When reading a prop value, the engine resolves in this order:

```
1. options.source = "inherit" → walk parent chain, merge
2. self stored value → overlay on inherited
3. options.link = "foreign_key" → query reverse relations
4. options.aggregate → compute from related set
5. context override → filter/project fields
```

Write order (reverse — strip before save):

```
1. Strip inherited values that match parent (don't duplicate)
2. Apply defaults for missing fields
3. Enforce flags (readonly, create_only, from_parent)
4. Validate unique keys
5. Save only the diff
```

---

## Options Reference

### @options_object
```
object_class    string[]    typed: allowed class(es) as schema
extensible      boolean     allow extra keys (default: false)
fields          string[]    which fields to expose (default: all)
filter_by       object      query conditions
display_field   string      label field for UI
```

### @options_relation (extends @options_object)
```
link            string      "embedded" | "foreign_key" | "chain" (default: "embedded")
link_field      string      field name for FK or chain walk
merge           string      "replace" | "override" | "append" (default: "replace")
group_by        string      deduplicate by this field
on_delete       string      "nullify" | "restrict" | "cascade" (default: "nullify")
```

### @key
```
fields          string[]    composite key field names
auto_field      string      which field auto-increments (optional)
prefix          string      auto-inc prefix (optional)
start           integer     auto-inc start (default: 1)
step            integer     auto-inc step (default: 1)
```

### @prop_flags
```
required        boolean
readonly        boolean
hidden          boolean
create_only     boolean
server_only     boolean
master_only     boolean
from_parent     boolean
```

---

## Three Layers — Who Does What

The same object flow runs on server, client, and editor. Each layer has a role:

### Server (PHP — ClassModel.php)
**Authority.** All validation, security, storage.
```
getObject:  storage → security → resolve inherited → resolve relations → return
setObject:  guards → validate → flags → defaults → strip inherited → keys → save
```
- Enforces ALL rules (flags, keys, security, @state)
- Resolves inherited data on read (options.link = "chain")
- Strips inherited data on write (save only diff)
- Handles server_only props (never sent to client)
- Runs @changes tracking, WebSocket broadcast, genesis sync

### Client (TypeScript — es-client)
**Local store + resolution.** Mirrors server behavior for offline/fast access.
```
Current state:
  AtomObj        — proxy-based get/set, dirty tracking
  AtomClass      — getProps() walks extends_id chain (merge by key)
  AtomProp       — getPropValue/setPropValue with type coercion
  ElementStore   — local object cache, collectClassProps(), findPropDef()
  ElementStoreClient — HTTP calls to server API

Needs to add:
  1. options.link resolution    — resolve "chain" and "foreign_key" on read
  2. options.merge handling     — "override" for assoc, "append" for indexed
  3. options.fields projection  — expose only listed fields
  4. context application        — read context, filter/override props
  5. strip inherited on save    — don't send inherited data back to server
  6. default value application  — apply defaults from class + parent chain
  7. @key validation            — client-side unique check before submit
```

What client already does right:
- `collectClassProps()` — walks extends_id, merges props by key (child wins)
- `findPropDef()` — walks chain to find prop definition
- `resolveConstructor()` — walks extends_id for class hierarchy
- `AtomObj.applyDefaults()` — applies defaults from class chain
- Dirty tracking via Proxy — knows what changed

What client does NOT do yet:
- Read `options.link` / `options.merge` on relation props
- Resolve foreign_key relations (query target class)
- Apply context-based field filtering
- Strip inherited values before sending to server
- Validate unique keys locally

### Editor (UI — cwm-architect, admin)
**Presentation + input.** Reads class meta to render forms/grids.
```
Needs to understand:
  1. @prop_flags     → readonly: disable input
                     → hidden: don't show
                     → server_only: don't show
                     → create_only: disable after create
                     → required: show required indicator
                     → from_parent: show as inherited, disable

  2. @options_object → object_class: which class schema for nested object
                     → extensible: show "add field" button or not
                     → fields: which fields to show in nested editor

  3. @options_relation → object_class (static or dynamic from_field):
                           what class(es) to show in picker
                        → link: "embedded" → show ID picker
                                "foreign_key" → show reverse query results
                                "chain" → show inherited chain
                        → display_field: what to show as label
                        → filter_by: pre-filter picker options
                        → on_delete: show warning on delete

  4. @key            → fields[]: highlight unique key fields
                     → auto_field: show as auto-generated (disable input)
                     → prefix: show prefix in auto field

  5. contexts        → read context for current view (grid/form/detail)
                     → apply: fields list, display_order, editable, label override
                     → per-prop context overrides (width, formatter, editor)

  6. defaults        → show default value as placeholder
                     → if readonly + default → show as locked value

  7. is_array        → false: single value input
                     → "indexed": ordered list editor (add/remove/reorder)
                     → "assoc": key-value editor (add key, edit value)
```

### Flow Alignment Table

| Step | Server | Client | Editor |
|---|---|---|---|
| Load class meta | getClass() | store.getObject(classId) | fetch class + props |
| Resolve props (inheritance) | getClassProps() merge by key | collectClassProps() merge by key | getProps() for form fields |
| Resolve options | read prop.options | read prop.options | render input by options |
| Apply context | filter by context name | filter by context name | use context for layout |
| Validate flags | enforce readonly/create_only/etc | warn user | disable inputs |
| Validate keys | checkUniqueConstraints() | pre-check before submit | show error on field |
| Apply defaults | fill on create | fill on create | show as placeholder |
| Resolve relations | query by link mode | query by link mode | render picker by link mode |
| Strip inherited | remove unchanged parent data | remove before POST/PUT | don't send locked fields |
| Save | storage + broadcast + genesis | HTTP POST/PUT to server | trigger client save |
