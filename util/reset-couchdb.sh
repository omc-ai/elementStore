#!/bin/bash
# Reset CouchDB — wipe all databases and restart PHP
# Usage: bash util/reset-couchdb.sh

COUCH_HOST="${COUCHDB_SERVER:-http://elementstore_couchdb:5984}"
COUCH_USER="${COUCHDB_USER:-admin}"
COUCH_PASS="${COUCHDB_PASSWORD:-elementstore}"
COUCH_URL="http://${COUCH_USER}:${COUCH_PASS}@${COUCH_HOST#http://}"

echo "Wiping CouchDB at ${COUCH_HOST}..."

# Delete all non-system databases
DBS=$(docker exec elementstore_couchdb curl -sf "${COUCH_URL}/_all_dbs" 2>/dev/null)
if [ -z "$DBS" ]; then
    echo "ERROR: Cannot connect to CouchDB"
    exit 1
fi

COUNT=0
for db in $(echo "$DBS" | python3 -c "import sys,json; [print(d) for d in json.load(sys.stdin) if not d.startswith('_')]" 2>/dev/null); do
    docker exec elementstore_couchdb curl -sf -X DELETE "${COUCH_URL}/${db}" > /dev/null 2>&1
    COUNT=$((COUNT+1))
done

echo "Deleted ${COUNT} databases"

# Fix .es/ permissions for genesis write-back
echo "Fixing .es/ permissions..."
docker exec elementstore_php83 chown -R www-data:www-data /var/www/elementStore/.es/ 2>/dev/null || true

# Verify
REMAINING=$(docker exec elementstore_couchdb curl -sf "${COUCH_URL}/_all_dbs" 2>/dev/null)
echo "Remaining: ${REMAINING}"
echo "Done."
