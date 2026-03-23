# Element–Provider Binding

How to connect an element class to external providers with property mapping,
actions, and `_links`-based synchronization.

Uses `infra:vm` as the canonical example throughout.

---

## Overview

An element is **one object** with two identities:

- **Design identity** — position, size, icon, canvas membership (inherited from `core:baseElement`)
- **Resource identity** — domain props (cpu, memory, power) linked to an external provider via `_links`

The client sees one object. Storage persists it locally. The provider enriches it
with live data and executes actions against the external API. These are independent
concerns — an element without `_links` is still a valid design node; provider
actions are simply unavailable.

---

## 1. Class Definition

A class declares **what the element is** (props) and **what you can do with it** (actions).

```json
{
  "id": "infra:vm",
  "class_id": "@class",
  "name": "Virtual Machine",
  "extends_id": "core:baseContainer",

  "providers": ["kamatera_vm"],

  "props": [
    { "key": "cpu",        "data_type": "integer", "default_value": 2 },
    { "key": "memory",     "data_type": "integer", "default_value": 4096 },
    { "key": "disk",       "data_type": "integer", "default_value": 40 },
    { "key": "os",         "data_type": "string",  "default_value": "ubuntu-22.04" },
    { "key": "power",      "data_type": "string",  "flags": {"readonly": true} },
    { "key": "ips",        "data_type": "string",  "is_array": "indexed", "flags": {"readonly": true} },
    { "key": "datacenter", "data_type": "string",  "flags": {"readonly": true} },
    { "key": "status",     "data_type": "string",  "flags": {"readonly": true} }
  ],

  "actions": ["vm:powerOn", "vm:powerOff", "vm:restart", "vm:resize", "vm:refresh"]
}
```

`providers` references the provider definition that knows how to talk to the external API.
`actions` lists the actions the user can invoke. The UI renders these as buttons.

---

## 2. Provider Definition

A provider declares **how to connect** to an external API: endpoints, field mapping,
and available actions.

```json
{
  "id": "kamatera_vm",
  "class_id": "crud_provider",
  "name": "Kamatera VM Provider",

  "base_url": null,
  "auth": null,

  "id_field": "id",
  "write_mode": "actions_only",

  "get_one":  "/server/{id}",
  "get_list": "/servers",

  "mapping": {
    "name":        "name",
    "cpu":         "cpu",
    "ram":         "memory",
    "disk_size_0": "disk",
    "power":       "power",
    "datacenter":  "datacenter",
    "network_ips": "ips"
  },

  "actions": ["vm:powerOn", "vm:powerOff", "vm:restart", "vm:resize", "vm:refresh"]
}
```

### base_url and auth: Resolved at Runtime

The genesis provider has `base_url: null` and `auth: null`. These are resolved from
**provider settings** configured per deployment:

```json
{
  "id": "kamatera-main",
  "driver": "kamatera",
  "name": "Production Kamatera",
  "url": "https://console.kamatera.com/service",
  "clientId": "xxx",
  "secret": "yyy"
}
```

This separates schema (genesis — how to talk to Kamatera) from credentials
(settings — which Kamatera account).

### write_mode

| Mode | Meaning |
|------|---------|
| `crud` | Direct setObject/createObject allowed against provider API |
| `actions_only` | Must use a declared @action; no arbitrary writes |

Cloud APIs typically require `actions_only` because they don't accept arbitrary
JSON — they have specific endpoints for specific operations.

### mapping

Maps between **provider field names** and **ES field names**:

```
Provider API field    ES element field
──────────────────    ────────────────
ram                →  memory
disk_size_0        →  disk
network_ips        →  ips
cpu                →  cpu          (same name — still declared for explicitness)
```

This default mapping is inherited by all actions on the provider. Actions can
override individual fields in their own `request_mapping` / `response_mapping`.

---

## 3. Actions

An action is a **named operation** the user can invoke. It defines parameters,
UI behavior, and how it maps to a provider API call.

### Action Returns the Updated Object

Every action that modifies state **returns the changed properties** in its response.
The response is mapped back onto the element and saved to local ES. This keeps the
local element in sync with the provider's actual state.

```
User: "Power Off"
  → PUT /server/abc123/power { power: "off" }
  ← { id: "abc123", power: "off", status: "stopping" }
  → response_mapping: power→power, status→status
  → element updated: { power: "off", status: "stopping" }
  → saved to local ES
```

If the provider returns additional fields beyond what was requested (like `status`
changing to "stopping" after a power-off), the response mapping captures those too.

### Example Actions

```json
{
  "id": "vm:powerOff",
  "class_id": "@action",
  "name": "Power Off",
  "icon": "power-off",
  "type": "api",
  "target_class_id": "infra:vm",
  "confirm": "Are you sure you want to power off {name}?",

  "params": [
    { "key": "power", "data_type": "string", "default_value": "off", "hidden": true }
  ],

  "provider_id": "kamatera_vm",
  "method": "PUT",
  "endpoint": "/server/{_link_id}/power",

  "request_mapping":  { "power": "power" },
  "response_mapping": { "power": "power", "status": "status" },

  "returns": "object"
}
```

```json
{
  "id": "vm:resize",
  "class_id": "@action",
  "name": "Resize",
  "icon": "scaling",
  "type": "api",
  "target_class_id": "infra:vm",
  "confirm": "Resize {name}? The server may need to restart.",

  "params": [
    { "key": "cpu",    "data_type": "integer", "label": "CPU Cores",   "flags": {"required": true} },
    { "key": "memory", "data_type": "integer", "label": "Memory (MB)", "flags": {"required": true} }
  ],

  "provider_id": "kamatera_vm",
  "method": "PUT",
  "endpoint": "/server/{_link_id}/resize",

  "request_mapping":  { "cpu": "cpu", "memory": "ram" },
  "response_mapping": { "cpu": "cpu", "ram": "memory", "power": "power", "status": "status" },

  "returns": "object"
}
```

```json
{
  "id": "vm:refresh",
  "class_id": "@action",
  "name": "Refresh",
  "icon": "refresh-cw",
  "type": "api",
  "target_class_id": "infra:vm",

  "params": [],

  "provider_id": "kamatera_vm",
  "method": "GET",
  "endpoint": "/server/{_link_id}",

  "response_mapping": {
    "name": "name", "cpu": "cpu", "ram": "memory", "disk_size_0": "disk",
    "power": "power", "datacenter": "datacenter", "network_ips": "ips",
    "status": "status"
  },

  "returns": "object"
}
```

### Action Parameters

Each action declares `params` as an array of @prop-shaped objects:

```
params: [
  { key, data_type, label, flags: {required, hidden}, default_value, options }
]
```

| Pattern | UI Behavior |
|---------|-------------|
| All params hidden | Execute immediately after confirm (powerOff) |
| Some params visible | Show parameter form (resize: cpu, memory) |
| No params | Execute immediately, no prompt (refresh) |

### Action Response Flow

```
1. ActionExecutor receives response from provider API
2. Apply response_mapping (provider fields → ES fields)
3. Merge mapped fields into the element object
4. Update _links if id_field is configured
5. Save updated element to local ES via setObject()
6. Return updated element to client
7. Client applies via store.applyRemote() → UI refreshes
```

The element in local ES always reflects the **last known provider state**.

---

## 4. _links

Every element instance can carry `_links` — a map from provider settings ID to
external object ID:

```json
{
  "id": "vm-web-01",
  "class_id": "infra:vm",
  "name": "Web Server",
  "cpu": 4,
  "_links": {
    "kamatera-main": "abc123",
    "monitoring-prod": "host-456"
  }
}
```

| Key | Value |
|-----|-------|
| Settings provider ID (`kamatera-main`) | External object ID (`abc123`) |

A single element can link to **multiple providers**. Each link is independent.

### _links Properties

- Defined as a prop on `@class` (inherited by all classes)
- `server_only: true` — not exposed in API responses to browser clients
- `hidden: true` — not shown in property editors
- Managed by ActionExecutor — never set manually by users

### {_link_id} Placeholder

Action endpoints use `{_link_id}` to reference the external ID:

```
endpoint: "/server/{_link_id}/power"
```

At execution time, `{_link_id}` resolves to `element._links[provider_settings_id]`.
The provider settings ID is determined from the action's provider + the element's
_links keys.

---

## 5. Assign and Sync

### Assign: Linking an Element to a Provider

Assigning creates the `_links` entry and performs an initial sync:

```
1. User selects element "vm-web-01" + provider server "abc123"
2. System writes: vm._links["kamatera-main"] = "abc123"
3. System executes vm:refresh action
   → GET /server/abc123
   → response mapped to element props
   → element saved with _links + enriched properties
4. Element is now linked — actions are enabled
```

Unassigning removes the _links entry:

```
1. User unlinks element from provider
2. System removes: delete vm._links["kamatera-main"]
3. Provider-sourced props (power, ips, status) become stale
4. Actions that require _links become disabled
5. Element still exists in local ES with last-known values
```

### Sync: Keeping Element in Sync with Provider

Sync fetches the latest state from all linked providers and merges it into the
element. This is the `vm:refresh` action generalized.

**Single element sync** (one-to-one):
```
element._links = { "kamatera-main": "abc123" }
  → GET /server/abc123
  → map response → merge into element → save
```

**Bulk sync** (one-to-many):
```
All infra:vm instances with _links["kamatera-main"]:
  → GET /servers (list all from provider)
  → For each response object:
      Find local element where _links["kamatera-main"] == response.id
      Map response fields → merge into element → save
```

Bulk sync is more efficient than per-element sync when refreshing many objects.
The provider's `get_list` endpoint fetches everything in one call, then the system
matches by _link_id.

**Multi-provider sync** (many-to-one):
```
element._links = {
  "kamatera-main": "abc123",
  "monitoring-prod": "host-456"
}
  → Sync from kamatera: GET /server/abc123 → merge cpu, memory, power
  → Sync from monitoring: GET /host/host-456 → merge uptime, alerts
  → Save element with merged data from both providers
```

When multiple providers write to the **same** field, the last sync wins. To avoid
conflicts, each provider should map to **distinct** fields, or a sync priority
order should be configured.

### Sync Direction

| Direction | Trigger | Flow |
|-----------|---------|------|
| Provider → Element | Refresh action, bulk sync, periodic poll | Fetch from provider, map, merge, save locally |
| Element → Provider | Action execution (resize, power, etc.) | Send mapped params to provider, apply response |
| Element → Element  | Not via _links (use relations for that) | — |

Sync is always **provider-initiated-via-action** — the system never pushes raw
element data to a provider (that's what `write_mode: "actions_only"` enforces).

---

## 6. Error Handling

### Provider Unavailable

```
Action execution fails (timeout, 503, network error)
  → Local ES is NOT modified (element keeps last-known state)
  → Error returned to client with action_id and error message
  → UI shows error toast
  → Actions remain enabled for retry
```

### Provider Returns Error

```
Action execution returns 4xx/5xx
  → Error details extracted from response
  → Local ES is NOT modified
  → Error returned to client: { success: false, error: "...", action_id: "..." }
  → UI shows error with provider message
```

### Partial Success on Bulk Sync

```
Bulk sync: 10 VMs, 8 succeed, 2 fail
  → 8 elements updated and saved
  → 2 elements unchanged (keep last-known state)
  → Summary returned: { synced: 8, failed: 2, errors: [...] }
```

### Stale _links

If an element's `_link_id` no longer exists at the provider (server deleted):

```
GET /server/abc123 → 404
  → Element NOT deleted (design artifact still valid)
  → Status marked: "provider_not_found" or similar
  → User decides: unlink, re-assign, or delete
```

---

## 7. Applying to Other Element Types

The same pattern works for any element that connects to an external system:

### infra:network

```json
{
  "id": "infra:network",
  "providers": ["kamatera_network"],
  "props": [
    { "key": "subnet", "data_type": "string",  "flags": {"readonly": true} },
    { "key": "vlan",   "data_type": "integer", "flags": {"readonly": true} },
    { "key": "gateway","data_type": "string",  "flags": {"readonly": true} }
  ],
  "actions": ["network:refresh"]
}
```

### infra:k8sCluster

```json
{
  "id": "infra:k8sCluster",
  "providers": ["kamatera_k8s"],
  "props": [
    { "key": "version",    "data_type": "string" },
    { "key": "totalNodes", "data_type": "integer", "flags": {"readonly": true} },
    { "key": "status",     "data_type": "string",  "flags": {"readonly": true} }
  ],
  "actions": ["k8s:scale", "k8s:upgrade", "k8s:refresh"]
}
```

### app:deployment (different provider entirely)

```json
{
  "id": "app:deployment",
  "providers": ["argocd_provider"],
  "props": [
    { "key": "revision",  "data_type": "string", "flags": {"readonly": true} },
    { "key": "syncStatus","data_type": "string", "flags": {"readonly": true} },
    { "key": "health",    "data_type": "string", "flags": {"readonly": true} }
  ],
  "actions": ["deploy:sync", "deploy:rollback", "deploy:refresh"]
}
```

The pattern is always:
1. **Class** declares props + actions
2. **Provider** declares connection + field mapping
3. **Actions** declare parameters + request/response mapping + returns updated object
4. **_links** maps each instance to its external ID
5. **Assign** creates the link + initial sync
6. **Sync** keeps local state current with provider state
7. **Actions** modify via provider, response updates local state
