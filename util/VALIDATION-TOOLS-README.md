# Validation Tools — Quick Reference

Three tools for validating ElementStore objects against classes and comparing local vs staging classes.

## 🚀 Quick Start

```bash
# File-level validation (no server needed)
php util/validate-and-compare.php

# Server-based validation (more accurate)
bash util/es-validate.sh

# JSON output for scripting
php util/validate-and-compare.php --json > report.json
```

## 📊 Current Status

```
✅ Validated 170 objects
⚠️  Found 217 issues

Critical:    0 🔴
Warnings:  217 🟡
Info:        0 🔵

By Type:
  • TYPE_MISMATCH        168 (mostly castable arrays)
  • BROKEN_REFERENCE      41 (missing app objects)
  • EXTRA_PROPERTY         8 (class def incomplete)
```

## 🔧 Fix Strategies by Type

### 1. TYPE_MISMATCH (168 issues) — ✅ Low Priority
Properties are arrays but class defines them as strings.

**Root Cause**: `@app` and `@app_feature` classes define array properties as `data_type: "string"` instead of supporting arrays.

**Fix**:
```bash
# Option A: Update class to support arrays
bash util/es-cli.sh set --data '{
  "id": "@app",
  "class_id": "@class",
  "props": [
    {"key": "repositories", "data_type": "string", "is_array": true},
    {"key": "genesis_files", "data_type": "string", "is_array": true},
    {"key": "crud_providers", "data_type": "string", "is_array": true}
  ]
}' --url $ES_URL

# Option B: Change objects to use string values (less ideal)
```

**Impact**: Can be left as-is (castable) or fixed for schema accuracy.

---

### 2. BROKEN_REFERENCE (41 issues) — ⚠️ Medium Priority
Objects reference non-existent `@app` instances.

**Root Cause**: 41 `@app_feature` objects reference missing apps like `app:es-client-npm`.

**Missing Objects**:
```
app:es-client-npm        (referenced by 20 @app_feature objects)
app:es-python            (referenced by 10 objects)
... 3 more
```

**Fix**:
```bash
# Create missing @app objects
bash util/es-cli.sh set --data '{
  "id": "app:es-client-npm",
  "class_id": "@app",
  "name": "ES Client NPM",
  "description": "ElementStore TypeScript client package"
}' --url $ES_URL

bash util/es-cli.sh set --data '{
  "id": "app:es-python",
  "class_id": "@app",
  "name": "ES Python",
  "description": "ElementStore Python client"
}' --url $ES_URL
```

**Impact**: Blocks proper feature tracking if objects are needed.

---

### 3. EXTRA_PROPERTY (8 issues) — ⚠️ Low-Medium Priority
`@cloudwm` objects have properties not defined in class schema.

**Properties Missing from Class**:
- `name` (required)
- `description`
- `base_url` (required)
- `auth_type`
- `region`
- `auth_fields` (object)

**Fix**:
```bash
# Update @cloudwm class to include all properties
bash util/es-cli.sh set --data '{
  "id": "@cloudwm",
  "class_id": "@class",
  "props": [
    {"key": "name", "data_type": "string", "flags": {"required": true}},
    {"key": "description", "data_type": "string"},
    {"key": "base_url", "data_type": "string", "flags": {"required": true}},
    {"key": "auth_type", "data_type": "string"},
    {"key": "region", "data_type": "string"},
    {"key": "auth_fields", "data_type": "object"}
  ]
}' --url $ES_URL
```

**Impact**: Object validation passes but schema is incomplete.

---

## 📋 Tool Comparison

| Feature | PHP Validator | CLI Tool | API Endpoint |
|---------|---------------|----------|--------------|
| **Server Required** | ❌ No | ✅ Yes | ✅ Yes |
| **Speed** | Fast | Medium | Fast |
| **Accuracy** | Good | Best | Best |
| **Class Comparison** | ✅ Yes | ✅ Yes | ❌ No |
| **Bulk Fixes** | ✅ Yes | ✅ Yes | Via API |
| **JSON Output** | ✅ Yes | ❌ No | ✅ Yes |

## 🎯 Usage Patterns

### Find Issues of One Type
```bash
php util/validate-and-compare.php --json | \
  jq '.object_validation.issues[] | select(.type == "BROKEN_REFERENCE")'
```

### Count by Severity
```bash
php util/validate-and-compare.php --json | \
  jq '.summary.by_severity'
```

### Export for Spreadsheet
```bash
php util/validate-and-compare.php --json | \
  jq -r '.object_validation.issues[] | [.type, .severity, .object_id, .message] | @csv' > issues.csv
```

### Fix Specific Object
```bash
# Find all issues for one object
php util/validate-and-compare.php --json | \
  jq '.object_validation.issues[] | select(.object_id == "app:es-php-backend")'
```

## 🔍 Full Documentation

See `docs/VALIDATION_AND_COMPARISON_GUIDE.md` for:
- Detailed fix procedures
- Issue type reference
- Class comparison workflow
- Server integration
- Troubleshooting

## ⚡ One-Liner Workflows

### Count all issues
```bash
php util/validate-and-compare.php --json | jq '.summary.total_issues'
```

### Show only critical
```bash
php util/validate-and-compare.php --json | \
  jq '.object_validation.issues[] | select(.severity == "CRITICAL")'
```

### Export issues by type for bulk fixing
```bash
for type in $(php util/validate-and-compare.php --json | jq -r '.summary.by_type | keys[]'); do
  echo "=== $type ==="
  php util/validate-and-compare.php --json | \
    jq ".object_validation.issues[] | select(.type == \"$type\")" | wc -l
done
```

## 📞 Next Steps

1. **Review** this summary
2. **Choose** which issues to fix (suggest: BROKEN_REFERENCE first)
3. **Use** the fix commands above
4. **Validate** with: `php util/validate-and-compare.php --objects-only`

---

**Tools Created**: 2026-03-23
**Tools Location**: `util/validate-and-compare.php`, `util/es-validate.sh`, `index-validate.php`
**Documentation**: `docs/VALIDATION_AND_COMPARISON_GUIDE.md`
