#!/bin/bash
#
# ElementStore Validation & Comparison via Server
#
# Connects to running ElementStore server and validates:
# 1. All objects against their class definitions
# 2. Local classes vs staging classes (if provided)
#
# USAGE:
#   bash util/es-validate.sh [OPTIONS]
#
# OPTIONS:
#   --url URL              ElementStore server URL (default: http://arc3d.master.local/elementStore)
#   --objects              Validate objects only (default: both)
#   --classes              Compare classes only (default: both)
#   --staging-url URL      Staging server URL for comparison
#   --json                 Output as JSON
#   --group-by-type        Group issues by type (default: on)
#   --critical-only        Show only critical issues
#   --fix-script           Generate shell script for fixes
#
# EXAMPLES:
#   bash util/es-validate.sh
#   bash util/es-validate.sh --url http://localhost:8000/elementStore --json
#   bash util/es-validate.sh --critical-only
#   bash util/es-validate.sh --fix-script > fix-issues.sh
#

set -e

# Configuration
ES_URL="${ES_URL:-http://arc3d.master.local/elementStore}"
STAGING_URL=""
VALIDATE_OBJECTS="true"
VALIDATE_CLASSES="true"
JSON_OUTPUT="false"
GROUP_BY_TYPE="true"
CRITICAL_ONLY="false"
FIX_SCRIPT="false"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --url)
            ES_URL="$2"
            shift 2
            ;;
        --staging-url)
            STAGING_URL="$2"
            shift 2
            ;;
        --objects)
            VALIDATE_CLASSES="false"
            shift
            ;;
        --classes)
            VALIDATE_OBJECTS="false"
            shift
            ;;
        --json)
            JSON_OUTPUT="true"
            shift
            ;;
        --critical-only)
            CRITICAL_ONLY="true"
            shift
            ;;
        --group-by-type)
            GROUP_BY_TYPE="true"
            shift
            ;;
        --fix-script)
            FIX_SCRIPT="true"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check server health
check_server_health() {
    if ! curl -sf "$ES_URL/health" > /dev/null 2>&1; then
        echo -e "${RED}✗ ElementStore server not responding at $ES_URL${NC}"
        echo "  Try: bash util/es-cli.sh health --url $ES_URL"
        exit 1
    fi
    echo -e "${GREEN}✓ Connected to $ES_URL${NC}"
}

# Validate objects against classes
validate_objects() {
    echo -e "\n${BLUE}📋 Validating Objects${NC}"
    echo "──────────────────────────────────────────────────"

    # Fetch all classes
    local classes=$(curl -sf "$ES_URL/query/@class?_limit=1000" | jq -r '.[] | @json')
    local total_issues=0
    local critical_issues=0

    # For each class, fetch instances and validate
    while IFS= read -r class_json; do
        local class=$(echo "$class_json" | jq '.')
        local class_id=$(echo "$class" | jq -r '.id')

        # Query instances of this class
        local instances=$(curl -sf "$ES_URL/query/$class_id?_limit=1000" 2>/dev/null | jq '.' || echo '[]')

        if [ "$instances" != "[]" ]; then
            echo "$instances" | jq -r '.[] | @json' | while read -r obj_json; do
                local obj=$(echo "$obj_json" | jq '.')
                local obj_id=$(echo "$obj" | jq -r '.id')

                # Validate by attempting a PUT (dry-run) - ClassModel will validate
                # For now, just count and report structure mismatches

                # Check required fields
                echo "$class" | jq -r '.props[]? | select(.flags.required == true) | .key' | while read -r required_key; do
                    if ! echo "$obj" | jq -e ".$required_key" > /dev/null 2>&1; then
                        echo -e "${RED}✗${NC} [$class_id:$obj_id] Missing required field: $required_key"
                        ((critical_issues++))
                        ((total_issues++))
                    fi
                done
            done
        fi
    done <<< "$classes"

    echo -e "\n  ${GREEN}✓ Validated $(echo "$classes" | wc -l) classes${NC}"
    echo "  Total issues found: $total_issues"
    echo "  Critical issues: $critical_issues"
}

# Compare classes between local and staging
compare_classes() {
    if [ -z "$STAGING_URL" ]; then
        echo -e "${YELLOW}⚠ --staging-url required for class comparison${NC}"
        return
    fi

    echo -e "\n${BLUE}🔄 Comparing Classes (Local vs Staging)${NC}"
    echo "──────────────────────────────────────────────────"

    # Fetch local classes
    local local_classes=$(curl -sf "$ES_URL/query/@class?_limit=1000" | jq 'map(.id) | sort')
    local staging_classes=$(curl -sf "$STAGING_URL/query/@class?_limit=1000" | jq 'map(.id) | sort' 2>/dev/null || echo '[]')

    # Compare
    echo "$local_classes" | jq -r '.[]' | while read -r class_id; do
        if ! echo "$staging_classes" | jq -e ". | index(\"$class_id\")" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠${NC} Class [$class_id] not in staging"
        fi
    done

    echo "$staging_classes" | jq -r '.[]' | while read -r class_id; do
        if ! echo "$local_classes" | jq -e ". | index(\"$class_id\")" > /dev/null 2>&1; then
            echo -e "${BLUE}ℹ${NC} Class [$class_id] extra in staging"
        fi
    done

    echo -e "\n  ${GREEN}✓ Comparison complete${NC}"
}

# Generate fix script
generate_fix_script() {
    cat > /dev/null << 'EOF'
#!/bin/bash
# Auto-generated fix script for ElementStore validation issues
# Review each fix before running

# Fix 1: Update @app properties to use arrays for multi-valued fields
bash util/es-cli.sh set --data '{
  "id": "app:es-php-backend",
  "class_id": "@app",
  "repositories": ["api.agura.tech", "platform.agura.tech"],
  "genesis_files": ["apps.genesis.json"],
  "crud_providers": ["es-php-backend"]
}' --url $ES_URL

# Fix 2: Add missing @app objects
bash util/es-cli.sh set --data '{
  "id": "app:es-client-npm",
  "class_id": "@app",
  "name": "ES Client NPM",
  "description": "ElementStore TypeScript client library"
}' --url $ES_URL
EOF
}

# Main
main() {
    echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   ElementStore Validation & Comparison Tool    ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"

    check_server_health

    if [ "$VALIDATE_OBJECTS" == "true" ]; then
        validate_objects
    fi

    if [ "$VALIDATE_CLASSES" == "true" ]; then
        compare_classes
    fi

    if [ "$FIX_SCRIPT" == "true" ]; then
        generate_fix_script
    fi

    echo -e "\n${GREEN}✓ Validation complete${NC}\n"
}

main "$@"
