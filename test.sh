#!/bin/bash
#
# ElementStore Full Test Script
#
# Usage: ./test.sh [--couchdb]
#

set -e  # Stop on first error

BASE_URL="${BASE_URL:-http://wallet-bo.master.local/elementStore}"
USE_COUCHDB=false

# Parse args
for arg in "$@"; do
    case $arg in
        --couchdb) USE_COUCHDB=true ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

# Helper functions
log() { echo -e "${BLUE}[TEST]${NC} $1"; }
pass() { echo -e "${GREEN}[PASS]${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); exit 1; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Test mode headers (disable ownership, allow custom IDs for seeding)
TEST_HEADERS=(
    -H "Content-Type: application/json"
    -H "X-Disable-Ownership: true"
    -H "X-Allow-Custom-Ids: true"
    -H "X-User-Id: test_user_001"
)

# Verbose API call - shows URL, body, response
api() {
    local method=$1
    local endpoint=$2
    local data=$3
    local url="${BASE_URL}${endpoint}"

    echo "" >&2
    echo -e "${CYAN}>>> ${method} ${url}${NC}" >&2

    if [ -n "$data" ]; then
        echo -e "${GRAY}Body: ${data}${NC}" >&2
        RESPONSE=$(curl -s -X "$method" "$url" \
            "${TEST_HEADERS[@]}" \
            -d "$data")
    else
        RESPONSE=$(curl -s -X "$method" "$url" "${TEST_HEADERS[@]}")
    fi

    echo -e "${GRAY}Response: ${RESPONSE}${NC}" >&2
    echo "$RESPONSE"
}

# Show result object (pretty print key fields)
show_result() {
    local response=$1
    local label=$2
    echo -e "${GREEN}[RESULT]${NC} ${label}:" >&2
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response" >&2
}

# Check response for error
check_success() {
    local response=$1
    local test_name=$2

    if echo "$response" | grep -q '"error"'; then
        fail "$test_name"
    else
        pass "$test_name"
    fi
}

# Check response has error (expected failure)
check_error() {
    local response=$1
    local test_name=$2

    if echo "$response" | grep -q '"error"'; then
        pass "$test_name (expected error)"
    else
        fail "$test_name: Expected error but got success"
    fi
}

echo ""
echo "=============================================="
echo "      ElementStore Full Test Suite"
echo "=============================================="
echo ""
log "Base URL: $BASE_URL"
log "CouchDB mode: $USE_COUCHDB"

# =============================================================================
# STEP 0: Health Check
# =============================================================================
log "Step 0: Health Check"
RESULT=$(api GET /health)
if echo "$RESULT" | grep -q '"status":"ok"'; then
    pass "Health check OK"
else
    fail "Health check failed"
fi

# =============================================================================
# STEP 1: Reset Database
# =============================================================================
log "Step 1: Reset Database"
RESULT=$(api POST /reset)
check_success "$RESULT" "Database reset"

# =============================================================================
# STEP 2: Create Class Metadata
# =============================================================================
log "Step 2: Create Class Metadata"

# Customer class
log "Creating 'customer' class..."
RESULT=$(api POST /class '{
    "id": "customer",
    "name": "Customer",
    "props": {
        "name": {
            "key": "name",
            "data_type": "string",
            "required": true,
            "validators": [{"type": "minLength", "value": 2}]
        },
        "email": {
            "key": "email",
            "data_type": "string",
            "required": true,
            "validators": [{"type": "email"}]
        },
        "phone": {
            "key": "phone",
            "data_type": "string",
            "required": false
        },
        "status": {
            "key": "status",
            "data_type": "string",
            "required": true,
            "default_value": "active",
            "validators": [{"type": "enum", "values": ["active", "inactive", "pending"]}]
        },
        "balance": {
            "key": "balance",
            "data_type": "number",
            "required": false,
            "default_value": 0
        }
    }
}')
check_success "$RESULT" "Create customer class"

# Invoice class
log "Creating 'invoice' class..."
RESULT=$(api POST /class '{
    "id": "invoice",
    "name": "Invoice",
    "props": {
        "invoice_number": {
            "key": "invoice_number",
            "data_type": "string",
            "required": true
        },
        "customer_id": {
            "key": "customer_id",
            "data_type": "relation",
            "object_class_id": "customer",
            "required": true
        },
        "amount": {
            "key": "amount",
            "data_type": "number",
            "required": true,
            "validators": [{"type": "min", "value": 0}]
        },
        "currency": {
            "key": "currency",
            "data_type": "string",
            "required": true,
            "default_value": "USD"
        },
        "status": {
            "key": "status",
            "data_type": "string",
            "required": true,
            "default_value": "pending",
            "validators": [{"type": "enum", "values": ["pending", "paid", "cancelled", "overdue"]}]
        },
        "issue_date": {
            "key": "issue_date",
            "data_type": "string",
            "required": true
        },
        "due_date": {
            "key": "due_date",
            "data_type": "string",
            "required": false
        },
        "items": {
            "key": "items",
            "data_type": "object",
            "is_array": true,
            "required": false,
            "default_value": []
        }
    }
}')
check_success "$RESULT" "Create invoice class"

# Receipt class
log "Creating 'receipt' class..."
RESULT=$(api POST /class '{
    "id": "receipt",
    "name": "Receipt",
    "props": {
        "receipt_number": {
            "key": "receipt_number",
            "data_type": "string",
            "required": true
        },
        "invoice_id": {
            "key": "invoice_id",
            "data_type": "relation",
            "object_class_id": "invoice",
            "required": true
        },
        "customer_id": {
            "key": "customer_id",
            "data_type": "relation",
            "object_class_id": "customer",
            "required": true
        },
        "amount_paid": {
            "key": "amount_paid",
            "data_type": "number",
            "required": true,
            "validators": [{"type": "min", "value": 0}]
        },
        "payment_method": {
            "key": "payment_method",
            "data_type": "string",
            "required": true,
            "validators": [{"type": "enum", "values": ["cash", "credit_card", "bank_transfer", "crypto"]}]
        },
        "payment_date": {
            "key": "payment_date",
            "data_type": "string",
            "required": true
        },
        "notes": {
            "key": "notes",
            "data_type": "string",
            "required": false
        }
    }
}')
check_success "$RESULT" "Create receipt class"

# Verify classes created
log "Verifying classes..."
RESULT=$(api GET /class)
if echo "$RESULT" | grep -q '"customer"' && echo "$RESULT" | grep -q '"invoice"' && echo "$RESULT" | grep -q '"receipt"'; then
    pass "All 3 classes exist"
else
    fail "Missing classes"
fi

# =============================================================================
# STEP 3: Create Test Data - Customers (no custom IDs - auto-generated)
# =============================================================================
log "Step 3: Create Customer Data"

RESULT=$(api POST /store/customer '{
    "name": "Test Customer Alpha",
    "email": "alpha@test.com",
    "phone": "+1-555-1234",
    "status": "active",
    "balance": 1000
}')
check_success "$RESULT" "Create customer Alpha"
show_result "$RESULT" "Customer 1"
CUST_1_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
log "Customer 1 ID: $CUST_1_ID"

RESULT=$(api POST /store/customer '{
    "name": "Test Customer Beta",
    "email": "beta@test.com",
    "phone": "+1-555-5678",
    "status": "active",
    "balance": 2500
}')
check_success "$RESULT" "Create customer Beta"
show_result "$RESULT" "Customer 2"
CUST_2_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
log "Customer 2 ID: $CUST_2_ID"

RESULT=$(api POST /store/customer '{
    "name": "Test Customer Gamma",
    "email": "gamma@test.com",
    "status": "pending",
    "balance": 0
}')
check_success "$RESULT" "Create customer Gamma"
show_result "$RESULT" "Customer 3"
CUST_3_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
log "Customer 3 ID: $CUST_3_ID"

# =============================================================================
# STEP 4: Create Test Data - Invoices (using captured customer IDs)
# =============================================================================
log "Step 4: Create Invoice Data"

RESULT=$(api POST /store/invoice "{
    \"invoice_number\": \"INV-2026-001\",
    \"customer_id\": \"$CUST_1_ID\",
    \"amount\": 500,
    \"currency\": \"USD\",
    \"status\": \"pending\",
    \"issue_date\": \"2026-01-15\",
    \"due_date\": \"2026-02-15\",
    \"items\": [{\"description\": \"Consulting Service\", \"qty\": 5, \"price\": 100}]
}")
check_success "$RESULT" "Create invoice INV-2026-001"
show_result "$RESULT" "Invoice 1"
INV_1_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
log "Invoice 1 ID: $INV_1_ID"

RESULT=$(api POST /store/invoice "{
    \"invoice_number\": \"INV-2026-002\",
    \"customer_id\": \"$CUST_1_ID\",
    \"amount\": 1200,
    \"currency\": \"USD\",
    \"status\": \"paid\",
    \"issue_date\": \"2026-01-10\",
    \"due_date\": \"2026-02-10\",
    \"items\": [{\"description\": \"Software License\", \"qty\": 1, \"price\": 1200}]
}")
check_success "$RESULT" "Create invoice INV-2026-002"
show_result "$RESULT" "Invoice 2"
INV_2_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
log "Invoice 2 ID: $INV_2_ID"

RESULT=$(api POST /store/invoice "{
    \"invoice_number\": \"INV-2026-003\",
    \"customer_id\": \"$CUST_2_ID\",
    \"amount\": 750,
    \"currency\": \"EUR\",
    \"status\": \"pending\",
    \"issue_date\": \"2026-01-20\",
    \"items\": [{\"description\": \"Design Work\", \"qty\": 3, \"price\": 250}]
}")
check_success "$RESULT" "Create invoice INV-2026-003"
show_result "$RESULT" "Invoice 3"
INV_3_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
log "Invoice 3 ID: $INV_3_ID"

# =============================================================================
# STEP 5: Create Test Data - Receipts (using captured IDs)
# =============================================================================
log "Step 5: Create Receipt Data"

RESULT=$(api POST /store/receipt "{
    \"receipt_number\": \"RCPT-2026-001\",
    \"invoice_id\": \"$INV_2_ID\",
    \"customer_id\": \"$CUST_1_ID\",
    \"amount_paid\": 1200,
    \"payment_method\": \"credit_card\",
    \"payment_date\": \"2026-01-12\",
    \"notes\": \"Payment received in full\"
}")
check_success "$RESULT" "Create receipt RCPT-2026-001"
show_result "$RESULT" "Receipt 1"
RCPT_1_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
log "Receipt 1 ID: $RCPT_1_ID"

# =============================================================================
# STEP 6: Test Read Operations (using captured IDs)
# =============================================================================
log "Step 6: Test Read Operations"

# Get single object
RESULT=$(api GET "/store/customer/$CUST_1_ID")
if echo "$RESULT" | grep -q '"name":"Test Customer Alpha"'; then
    pass "Get customer by ID"
else
    fail "Get customer by ID"
fi

# Get property
RESULT=$(api GET "/store/customer/$CUST_1_ID/email")
if echo "$RESULT" | grep -q 'alpha@test.com'; then
    pass "Get customer email property"
else
    fail "Get email property"
fi

# Get relation (customer from invoice)
RESULT=$(api GET "/store/invoice/$INV_1_ID/customer_id")
if echo "$RESULT" | grep -q '"name":"Test Customer Alpha"'; then
    pass "Get related customer from invoice"
else
    warn "Relation resolution: $RESULT"
fi

# =============================================================================
# STEP 7: Test Update Operations (using captured IDs)
# =============================================================================
log "Step 7: Test Update Operations"

# Update customer balance (partial update)
RESULT=$(api PUT "/store/customer/$CUST_1_ID" '{"balance": 1500}')
check_success "$RESULT" "Update customer balance"
show_result "$RESULT" "Updated Customer"

# Verify update
RESULT=$(api GET "/store/customer/$CUST_1_ID")
if echo "$RESULT" | grep -q '"balance":1500'; then
    pass "Balance updated correctly"
else
    fail "Balance not updated"
fi

# Update invoice status
RESULT=$(api PUT "/store/invoice/$INV_1_ID" '{"status": "paid"}')
check_success "$RESULT" "Update invoice status to paid"
show_result "$RESULT" "Updated Invoice"

# =============================================================================
# STEP 8: Test Query Operations
# =============================================================================
log "Step 8: Test Query Operations"

RESULT=$(api GET '/query/customer?status=active')
if echo "$RESULT" | grep -q '"status":"active"'; then
    pass "Query active customers"
else
    warn "Query returned: $RESULT"
fi

# =============================================================================
# STEP 9: Test Validation Errors
# =============================================================================
log "Step 9: Test Validation Errors"

# Missing required field
RESULT=$(api POST /store/customer '{"name": "Test User"}')
check_error "$RESULT" "Missing required email"

# Invalid email format
RESULT=$(api POST /store/customer '{"name": "Test", "email": "not-an-email", "status": "active"}')
check_error "$RESULT" "Invalid email format"

# Invalid enum value
RESULT=$(api POST /store/customer '{"name": "Test", "email": "test@test.com", "status": "invalid_status"}')
check_error "$RESULT" "Invalid status enum"

# Negative amount (use captured customer ID)
RESULT=$(api POST /store/invoice "{
    \"invoice_number\": \"TEST-001\",
    \"customer_id\": \"$CUST_1_ID\",
    \"amount\": -100,
    \"status\": \"pending\",
    \"issue_date\": \"2026-01-28\"
}")
check_error "$RESULT" "Negative invoice amount"

# Invalid relation
RESULT=$(api POST /store/invoice '{
    "invoice_number": "TEST-002",
    "customer_id": "non_existent_customer",
    "amount": 100,
    "status": "pending",
    "issue_date": "2026-01-28"
}')
check_error "$RESULT" "Invalid customer relation"

# =============================================================================
# STEP 10: Test Delete Operations (using captured IDs)
# =============================================================================
log "Step 10: Test Delete Operations"

RESULT=$(api DELETE "/store/receipt/$RCPT_1_ID")
if echo "$RESULT" | grep -q '"deleted":true'; then
    pass "Delete receipt"
else
    fail "Delete receipt"
fi

# Verify deleted
RESULT=$(api GET "/store/receipt/$RCPT_1_ID")
if echo "$RESULT" | grep -q '"error"'; then
    pass "Receipt no longer exists"
else
    fail "Receipt still exists"
fi

# =============================================================================
# STEP 11: Test Ownership (owner_id isolation)
# =============================================================================
log "Step 11: Test Ownership Isolation"

# Create object as user_001
log "Creating object as user_001..."
RESULT=$(curl -s -X POST "${BASE_URL}/store/customer" \
    -H "Content-Type: application/json" \
    -H "X-User-Id: user_001" \
    -d '{"name": "User1 Customer", "email": "user1@test.com", "status": "active"}')
check_success "$RESULT" "User 001 creates customer"
show_result "$RESULT" "User 001's Customer"
USER1_CUST_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
log "User 001's customer ID: $USER1_CUST_ID"

# Verify owner_id is set
if echo "$RESULT" | grep -q '"owner_id":"user_001"'; then
    pass "owner_id correctly set to user_001"
else
    fail "owner_id not set correctly"
fi

# Create object as user_002
log "Creating object as user_002..."
RESULT=$(curl -s -X POST "${BASE_URL}/store/customer" \
    -H "Content-Type: application/json" \
    -H "X-User-Id: user_002" \
    -d '{"name": "User2 Customer", "email": "user2@test.com", "status": "active"}')
check_success "$RESULT" "User 002 creates customer"
USER2_CUST_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
log "User 002's customer ID: $USER2_CUST_ID"

# User 001 tries to read User 002's object (should fail/return null)
log "User 001 trying to read User 002's object..."
RESULT=$(curl -s -X GET "${BASE_URL}/store/customer/${USER2_CUST_ID}" \
    -H "X-User-Id: user_001")
if echo "$RESULT" | grep -q '"error"'; then
    pass "User 001 cannot read User 002's object (ownership enforced)"
else
    fail "User 001 should NOT be able to read User 002's object"
fi

# User 001 tries to update User 002's object (should fail)
log "User 001 trying to update User 002's object..."
RESULT=$(curl -s -X PUT "${BASE_URL}/store/customer/${USER2_CUST_ID}" \
    -H "Content-Type: application/json" \
    -H "X-User-Id: user_001" \
    -d '{"name": "Hacked Name"}')
if echo "$RESULT" | grep -q '"error"'; then
    pass "User 001 cannot update User 002's object (ownership enforced)"
else
    fail "User 001 should NOT be able to update User 002's object"
fi

# User 002 can read their own object
log "User 002 reading their own object..."
RESULT=$(curl -s -X GET "${BASE_URL}/store/customer/${USER2_CUST_ID}" \
    -H "X-User-Id: user_002")
if echo "$RESULT" | grep -q '"name":"User2 Customer"'; then
    pass "User 002 can read their own object"
else
    fail "User 002 should be able to read their own object"
fi

# User 001 lists customers - should only see their own
log "User 001 listing all customers (should only see own)..."
RESULT=$(curl -s -X GET "${BASE_URL}/store/customer" \
    -H "X-User-Id: user_001")
COUNT=$(echo "$RESULT" | python3 -c "import sys,json; data=json.load(sys.stdin); print(len([x for x in data if x.get('owner_id')=='user_001']))" 2>/dev/null)
TOTAL=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ "$COUNT" = "$TOTAL" ] && [ "$TOTAL" != "0" ]; then
    pass "User 001 only sees their own objects ($COUNT objects)"
else
    fail "User 001 sees objects from other users (own: $COUNT, total: $TOTAL)"
fi

# Admin mode (no user_id) - can see all
log "Admin (no user_id, ownership disabled) listing all customers..."
RESULT=$(curl -s -X GET "${BASE_URL}/store/customer" \
    -H "X-Disable-Ownership: true")
TOTAL=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ "$TOTAL" -gt "1" ]; then
    pass "Admin can see all objects ($TOTAL objects)"
else
    warn "Admin should see multiple objects (got $TOTAL)"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "=============================================="
echo "               Test Summary"
echo "=============================================="
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"
echo "=============================================="

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
