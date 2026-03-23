# ElementStore Validation & Comparison Guide

This guide explains how to validate objects against their class definitions and compare local classes with staging classes.

## Overview

ElementStore includes three validation tools:

1. **PHP Validator** (`util/validate-and-compare.php`) — File-level validation
2. **CLI Tool** (`util/es-validate.sh`) — Server-based validation via es-cli
3. **API Endpoint** (`index-validate.php`) — HTTP REST validation endpoint

## Issue Types & Severity

### Issue Categories

Issues are tagged by **type** for grouping and bulk fixes:

| Type | Severity | Meaning | Fix |
|------|----------|---------|-----|
| `MISSING_CLASS_ID` | CRITICAL | Object has no `class_id` field | Add `class_id` to object |
| `CLASS_NOT_FOUND` | CRITICAL | Referenced class doesn't exist | Create the class or fix reference |
| `MISSING_CLASS_NAME` | CRITICAL | Class definition missing `name` | Add `name` to class |
| `REQUIRED_PROPERTY_MISSING` | CRITICAL | Required field is null | Add missing field with value |
| `TYPE_MISMATCH` | WARNING | Property type wrong (not castable) | Convert value to expected type |
| `TYPE_MISMATCH_CASTABLE` | INFO | Property can be auto-cast (e.g., "123" → 123) | Safe to leave or fix |
| `INVALID_ENUM_VALUE` | WARNING | Value not in allowed options | Use one of the allowed values |
| `BROKEN_REFERENCE` | WARNING | Referenced object doesn't exist | Create referenced object or fix ID |
| `EXTRA_PROPERTY` | WARNING | Property not defined in class | Either add to class definition or remove from object |
| `INVALID_DATETIME` | WARNING | Not valid ISO 8601 format | Fix date format to YYYY-MM-DDTHH:MM:SSZ |
| `PROPERTY_TYPE_MISMATCH` | CRITICAL | Local & staging have different types | Reconcile class definitions |
| `PROPERTY_FLAG_MISMATCH` | WARNING | Flag differs between local & staging | Sync class flags |
| `PROPERTY_EXTRA_IN_STAGING` | INFO | Property exists in staging but not local | May be intentional |
| `CLASS_NOT_IN_STAGING` | WARNING | Local class missing from staging | Deploy class to staging |

## Usage

### Method 1: PHP File-Level Validator

Validates local objects against classes without needing the server running.

```bash
# Validate all objects
php util/validate-and-compare.php --objects-only

# Verbose output with details
php util/validate-and-compare.php --objects-only --verbose

# JSON output for scripting
php util/validate-and-compare.php --objects-only --json

# Compare with staging server
php util/validate-and-compare.php --classes --staging-url http://staging.local/elementStore
```

### Method 2: CLI Tool (Server-based)

Connects to running ElementStore server for real validation.

```bash
# Validate via server (recommended - more accurate)
bash util/es-validate.sh

# With specific server
bash util/es-validate.sh --url http://localhost:8000/elementStore

# Critical issues only
bash util/es-validate.sh --critical-only

# Generate fix script
bash util/es-validate.sh --fix-script > fixes.sh
```

### Method 3: API Endpoint

Query validation results via HTTP.

```bash
# Get all object validation issues
curl -s http://arc3d.master.local/elementStore/validate/objects | jq

# Group by type
curl -s http://arc3d.master.local/elementStore/validate/objects?group_by=type | jq

# Only critical issues
curl -s "http://arc3d.master.local/elementStore/validate/objects?severity=CRITICAL" | jq

# Get summary
curl -s http://arc3d.master.local/elementStore/validate/summary | jq
```

## Recent Validation Results

### Object Validation Summary

```
Total Objects Validated:  170
Total Issues Found:       217

Issues by Type:
  • TYPE_MISMATCH           168 (mostly castable)
  • BROKEN_REFERENCE         41
  • EXTRA_PROPERTY            8
```

### Top Issues to Fix

#### 1. **TYPE_MISMATCH** (168 issues, mostly WARNING/INFO)
```
Property definitions expect scalar types but have arrays:
  • repositories: array, expects string
  • genesis_files: array, expects string
  • crud_providers: array, expects string
  • server_endpoints: array, expects string
```

**Status**: ✅ Safe — values are arrays but should be arrays. Fix class definitions to use `data_type: "object"` or `is_array: true`.

**Fix Strategy**:
```bash
# Update @app class properties to support arrays
bash util/es-cli.sh set --data '{
  "id": "@app",
  "class_id": "@class",
  "props": [
    {
      "key": "repositories",
      "data_type": "string",
      "is_array": true
    },
    {
      "key": "genesis_files",
      "data_type": "string",
      "is_array": true
    }
  ]
}' --url $ES_URL
```

#### 2. **BROKEN_REFERENCE** (41 issues, WARNING)
```
Objects reference non-existent IDs:
  • af:es-client-npm references app:es-client-npm (doesn't exist)
  • af:es-python references app:es-python (doesn't exist)
  • ... and 39 more
```

**Status**: ⚠️ Needs resolution — referenced objects missing.

**Fix Strategy**:
1. Create missing `@app` objects:
   ```bash
   bash util/es-cli.sh set --data '{
     "id": "app:es-client-npm",
     "class_id": "@app",
     "name": "ES Client NPM",
     "description": "ElementStore TypeScript client package"
   }' --url $ES_URL
   ```

2. Or remove references if apps aren't needed.

#### 3. **EXTRA_PROPERTY** (8 issues, WARNING)
```
@cloudwm object has properties not in @cloudwm class:
  • name (defined in class but marked as undefined)
  • description
  • base_url
  • auth_type
  • region
  • auth_fields
```

**Status**: 🤔 Class definition incomplete — properties exist in object but not declared in class.

**Fix Strategy**:
Update @cloudwm class definition to include all properties:
```bash
bash util/es-cli.sh set --data '{
  "id": "@cloudwm",
  "class_id": "@class",
  "props": [
    {"key": "name", "data_type": "string", "flags": {"required": true}},
    {"key": "description", "data_type": "string"},
    {"key": "base_url", "data_type": "string"},
    {"key": "auth_type", "data_type": "string"},
    {"key": "region", "data_type": "string"},
    {"key": "auth_fields", "data_type": "object"}
  ]
}' --url $ES_URL
```

## Validation Priority

### 🔴 Critical Issues (Fix First)
- `MISSING_CLASS_ID` — Objects can't be processed
- `CLASS_NOT_FOUND` — Class definitions missing
- `REQUIRED_PROPERTY_MISSING` — Data incomplete
- `PROPERTY_TYPE_MISMATCH` (local vs staging) — Sync needed

### 🟡 Warnings (Fix Second)
- `BROKEN_REFERENCE` — Reference integrity
- `TYPE_MISMATCH` (non-castable) — Data type errors
- `EXTRA_PROPERTY` — Schema inconsistencies
- `CLASS_NOT_IN_STAGING` — Deployment needed

### 🔵 Info (Fix if Needed)
- `TYPE_MISMATCH_CASTABLE` — Auto-castable (OK to leave)
- `PROPERTY_EXTRA_IN_STAGING` — Not a problem
- `CLASS_EXTRA_IN_STAGING` — Staging has extras

## Bulk Fixing by Type

The validation tools group issues by type for easy bulk fixing:

```bash
# Get all issues of one type
php util/validate-and-compare.php --json | jq '.object_validation.issues[] | select(.type == "BROKEN_REFERENCE")'

# Count issues per type
php util/validate-and-compare.php --json | jq '.object_validation.by_type'

# Generate fixes for specific type
php util/validate-and-compare.php --json | jq '.object_validation.issues[] | select(.type == "TYPE_MISMATCH") | {object: .object_id, property: .details.key}'
```

## Comparison: Local vs Staging

### Purpose
Ensures local class definitions stay in sync with staging server.

### Usage
```bash
# Compare local classes with staging
php util/validate-and-compare.php --classes --staging-url http://staging.local/elementStore

# Show mismatches
curl -s "http://staging.local/elementStore/validate/classes" | jq '.issues[] | select(.severity == "CRITICAL")'
```

### What Gets Checked
1. **Class existence**: Is each local class in staging?
2. **Properties**: Do all local props exist in staging?
3. **Data types**: Are types consistent?
4. **Flags**: Are required/readonly/hidden flags the same?

### Resolution Workflow
1. Identify differences: `php util/validate-and-compare.php --classes --staging-url ...`
2. Review impact: Are these intentional divergences?
3. Sync strategy:
   - **Add to staging**: Deploy local changes
   - **Remove from local**: Pull staging changes
   - **Reconcile**: Decide which is correct

## Integration with es-cli

All tools work seamlessly with `es-cli.sh`:

```bash
# Validate, find issues, then fix via es-cli
bash util/es-validate.sh --critical-only | while read issue; do
  # Parse and create fix
  bash util/es-cli.sh set --data "$fix_json" --url $ES_URL
done
```

## Performance Notes

- **File-level validator** (~1-2 seconds): Good for quick checks, doesn't require server
- **API endpoint** (~500ms): Real validation through ClassModel, requires running server
- **es-cli** (~2-5 seconds): Connects to server, validates via API

For large datasets (>10MB), use API endpoint with `--critical-only` to reduce response size.

## Troubleshooting

### Server Not Responding
```bash
# Check server health
bash util/es-cli.sh health --url http://arc3d.master.local/elementStore

# Start server
cd platform_root/pc_inst/docker
./build.sh up
```

### File-Level Validator Shows Issues Server Doesn't
This is expected — file validator checks schema, server validator checks runtime behavior. Trust server validator when divergent.

### High Volume of TYPE_MISMATCH Warnings
Most are castable (INFO level). Filter to see actual problems:
```bash
php util/validate-and-compare.php --json | jq '.object_validation.issues[] | select(.severity == "CRITICAL" or (.type == "TYPE_MISMATCH" and .severity == "WARNING"))'
```

## Next Steps

1. **Fix CRITICAL issues first**:
   ```bash
   php util/validate-and-compare.php --json | jq '.object_validation.issues[] | select(.severity == "CRITICAL")' | wc -l
   ```

2. **For each type, create fix script**:
   ```bash
   bash util/es-validate.sh --type BROKEN_REFERENCE --fix-script > fix-references.sh
   ```

3. **Test fixes in staging**:
   ```bash
   bash fix-references.sh --url http://staging.local/elementStore --dry-run
   ```

4. **Deploy to production**:
   ```bash
   bash fix-references.sh --url http://arc3d.master.local/elementStore
   ```

---

**Last Updated**: 2026-03-23
**Validation Tools Version**: 1.0
