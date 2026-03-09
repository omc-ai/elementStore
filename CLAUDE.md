# CLAUDE.md — elementStore

Instructions for Claude Code when working in this repository.

## Rule: Never Read `.es/*.json` Directly

**ALWAYS query the live ElementStore server via `es-cli.sh`.** Never read `.es/*.json` files directly.

```bash
# Wrong — bypasses server pipeline
cat .es/@es-feature.json

# Correct — tests full recursive genesis→seed chain
bash util/es-cli.sh list --class es:feature --url http://arc3d.master.local/elementStore
```

This validates the full server→genesis→seed loading pipeline on every query. A failure is a signal that the genesis chain is broken.

See `README.md § AI Interaction Guide` for the full query reference.

## Local Server

```
ES_URL=http://arc3d.master.local/elementStore
```

Always run `bash util/es-cli.sh health --url $ES_URL` first to confirm the server is up.

## Syncing the Feature Registry

When a feature is implemented or its status changes:

1. **Update the live server** via `es-cli.sh set` (updates `es:feature` / `es:app_feature` objects)
2. **Sync `docs/CLIENT_FEATURE_REGISTRY.md`** from the live data — query via es-cli, then update the markdown

The JSON files in `.es/` will auto-update when the server persists the changes. Do not edit them manually.

## Key Data Classes

| Class | Purpose |
|-------|---------|
| `es:feature` | Feature definitions (canonical list of ES capabilities) |
| `es:app_feature` | Per-app implementation status (`progress`: implemented / partial / not_started) |
| `es:app` | Registered applications (PHP backend, Admin UI, arch-fe, arch-be, ...) |

## Feature IDs — Naming Convention

```
feat:<group>_<name>        e.g. feat:filter_by, feat:client_atomobj
af:<app-short>:<feat-id>   e.g. af:es-admin:filter_by, af:arch-fe:filter_by
app:<slug>                 e.g. app:es-admin, app:es-php-backend, app:architect-frontend
```
