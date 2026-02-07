<?php
/**
 * MongoDB Storage Provider
 *
 * MongoDB-based storage implementation.
 * Each class is stored in a separate collection.
 *
 * STORAGE STRUCTURE:
 * Database: elementstore (configurable)
 *   _class (collection)    - Class definitions (@ replaced with _)
 *   _prop (collection)     - Property definitions
 *   user (collection)      - User objects
 *   product (collection)   - Product objects
 *   _counters (collection) - Auto-increment counters
 *
 * DOCUMENT FORMAT:
 * {
 *   "id": 1,              // Our ID (not MongoDB _id)
 *   "class_id": "user",
 *   "name": "John",
 *   ...
 * }
 *
 * THREAD SAFETY:
 * MongoDB handles concurrent access natively. This implementation
 * is suitable for multi-process/multi-server environments.
 *
 * REQUIREMENTS:
 * - MongoDB PHP extension
 * - mongodb/mongodb composer package
 */

namespace ElementStore;

class MongoStorageProvider implements IStorageProvider
{
    /** @var \MongoDB\Client MongoDB client instance */
    private \MongoDB\Client $client;

    /** @var \MongoDB\Database Selected database */
    private \MongoDB\Database $database;

    /**
     * Create MongoDB storage provider
     *
     * @param string $connectionString MongoDB connection URI
     * @param string $dbName Database name
     * @throws StorageException On connection failure
     */
    public function __construct(
        string $connectionString = 'mongodb://localhost:27017',
        string $dbName = 'elementstore'
    ) {
        try {
            $this->client = new \MongoDB\Client($connectionString);
            $this->database = $this->client->selectDatabase($dbName);
        } catch (\MongoDB\Driver\Exception\Exception $e) {
            throw new StorageException(
                "Failed to connect to MongoDB: " . $e->getMessage(),
                'MongoDB',
                'constructor',
                ['connectionString' => $connectionString, 'dbName' => $dbName],
                $e
            );
        }
    }

    /**
     * Get MongoDB collection for a class
     *
     * @param string $class Class identifier
     * @return \MongoDB\Collection MongoDB collection
     */
    private function getCollection(string $class): \MongoDB\Collection
    {
        // Replace @ with _ for valid collection names
        $collectionName = str_replace('@', '_', $class);
        return $this->database->selectCollection($collectionName);
    }

    /**
     * Generate next auto-increment ID for a class
     *
     * Uses a separate _counters collection to track sequences per class.
     *
     * @param string $class Class identifier
     * @return int Next available integer ID
     */
    private function nextId(string $class): int
    {
        $counters = $this->database->selectCollection('_counters');
        $result = $counters->findOneAndUpdate(
            ['_id' => $class],
            ['$inc' => ['seq' => 1]],
            [
                'upsert' => true,
                'returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER
            ]
        );
        return $result['seq'];
    }

    /**
     * @inheritDoc
     * @throws StorageException On MongoDB operation failure
     */
    public function getobj(string $class, mixed $id = null): array|null
    {
        try {
            $collection = $this->getCollection($class);

            if ($id === null) {
                $cursor = $collection->find();
                $results = [];
                foreach ($cursor as $doc) {
                    $results[] = $this->documentToArray($doc);
                }
                return $results;
            }

            $doc = $collection->findOne([Constants::F_ID => $this->normalizeId($id)]);
            return $doc ? $this->documentToArray($doc) : null;
        } catch (\MongoDB\Driver\Exception\Exception $e) {
            throw new StorageException(
                "MongoDB getobj failed: " . $e->getMessage(),
                'MongoDB',
                'getobj',
                ['class' => $class, 'id' => $id],
                $e
            );
        }
    }

    /**
     * @inheritDoc
     *
     * Uses upsert for atomic create/update operations.
     * @throws StorageException On MongoDB operation failure
     */
    public function setobj(string $class, array $obj): array
    {
        try {
            $collection = $this->getCollection($class);
            $id = $obj[Constants::F_ID] ?? null;
            $existing = $id ? $this->getobj($class, $id) : null;
            $isNew = ($existing === null);

            if ($isNew) {
                // Create: generate ID, set class_id and created_at
                if (!isset($obj[Constants::F_ID])) {
                    $obj[Constants::F_ID] = $this->nextId($class);
                }
                $obj[Constants::F_CLASS_ID] = $class;
                $obj[Constants::F_CREATED_AT] = date('Y-m-d H:i:s');
            }

            // Always update timestamp
            $obj[Constants::F_UPDATED_AT] = date('Y-m-d H:i:s');

            // Upsert: insert if not exists, replace if exists
            $result = $collection->replaceOne(
                [Constants::F_ID => $this->normalizeId($obj[Constants::F_ID])],
                $obj,
                ['upsert' => true]
            );

            // Check if operation was acknowledged
            if (!$result->isAcknowledged()) {
                throw new StorageException(
                    "MongoDB write not acknowledged",
                    'MongoDB',
                    'setobj',
                    ['class' => $class, 'id' => $obj[Constants::F_ID]]
                );
            }

            return $obj;
        } catch (StorageException $e) {
            throw $e; // Re-throw our own exceptions
        } catch (\MongoDB\Driver\Exception\Exception $e) {
            throw new StorageException(
                "MongoDB setobj failed: " . $e->getMessage(),
                'MongoDB',
                'setobj',
                ['class' => $class, 'id' => $obj[Constants::F_ID] ?? null],
                $e
            );
        }
    }

    /**
     * @inheritDoc
     * @throws StorageException On MongoDB operation failure
     */
    public function delobj(string $class, mixed $id): bool
    {
        try {
            $collection = $this->getCollection($class);
            $result = $collection->deleteOne([Constants::F_ID => $this->normalizeId($id)]);

            if (!$result->isAcknowledged()) {
                throw new StorageException(
                    "MongoDB delete not acknowledged",
                    'MongoDB',
                    'delobj',
                    ['class' => $class, 'id' => $id]
                );
            }

            return $result->getDeletedCount() > 0;
        } catch (StorageException $e) {
            throw $e;
        } catch (\MongoDB\Driver\Exception\Exception $e) {
            throw new StorageException(
                "MongoDB delobj failed: " . $e->getMessage(),
                'MongoDB',
                'delobj',
                ['class' => $class, 'id' => $id],
                $e
            );
        }
    }

    /**
     * @inheritDoc
     *
     * Uses MongoDB native operators for efficient querying.
     * Array filter values are converted to $in queries.
     * @throws StorageException On MongoDB operation failure
     */
    public function query(string $class, array $filters = [], array $options = []): array
    {
        try {
            $collection = $this->getCollection($class);

            $findOptions = [];

            // Apply sorting
            if (isset($options['sort'])) {
                $sortDir = ($options['sortDir'] ?? 'asc') === 'desc' ? -1 : 1;
                $findOptions['sort'] = [$options['sort'] => $sortDir];
            }

            // Apply pagination
            if (isset($options['offset'])) {
                $findOptions['skip'] = $options['offset'];
            }
            if (isset($options['limit'])) {
                $findOptions['limit'] = $options['limit'];
            }

            // Convert filters for MongoDB
            $mongoFilters = [];
            foreach ($filters as $key => $value) {
                if (is_array($value)) {
                    $mongoFilters[$key] = ['$in' => $value];
                } else {
                    $mongoFilters[$key] = $value;
                }
            }

            $cursor = $collection->find($mongoFilters, $findOptions);

            $results = [];
            foreach ($cursor as $doc) {
                $results[] = $this->documentToArray($doc);
            }

            return $results;
        } catch (\MongoDB\Driver\Exception\Exception $e) {
            throw new StorageException(
                "MongoDB query failed: " . $e->getMessage(),
                'MongoDB',
                'query',
                ['class' => $class, 'filters' => $filters, 'options' => $options],
                $e
            );
        }
    }

    /**
     * @inheritDoc
     *
     * Uses MongoDB $rename operator for atomic bulk update.
     * @throws StorageException On MongoDB operation failure
     */
    public function renameProp(string $classId, string $oldKey, string $newKey): int
    {
        try {
            $collection = $this->getCollection($classId);

            $result = $collection->updateMany(
                [$oldKey => ['$exists' => true]],
                [
                    '$rename' => [$oldKey => $newKey],
                    '$set' => [Constants::F_UPDATED_AT => date('Y-m-d H:i:s')]
                ]
            );

            if (!$result->isAcknowledged()) {
                throw new StorageException(
                    "MongoDB property rename not acknowledged",
                    'MongoDB',
                    'renameProp',
                    ['classId' => $classId, 'oldKey' => $oldKey, 'newKey' => $newKey]
                );
            }

            return $result->getModifiedCount();
        } catch (StorageException $e) {
            throw $e;
        } catch (\MongoDB\Driver\Exception\Exception $e) {
            throw new StorageException(
                "MongoDB renameProp failed: " . $e->getMessage(),
                'MongoDB',
                'renameProp',
                ['classId' => $classId, 'oldKey' => $oldKey, 'newKey' => $newKey],
                $e
            );
        }
    }

    /**
     * @inheritDoc
     *
     * Moves all documents to new collection and drops old collection.
     * @throws StorageException On MongoDB operation failure
     */
    public function renameClass(string $oldClassId, string $newClassId): int
    {
        try {
            $oldCollection = $this->getCollection($oldClassId);
            $newCollection = $this->getCollection($newClassId);

            // Get all documents from old collection
            $docs = $oldCollection->find()->toArray();
            $count = 0;

            foreach ($docs as $doc) {
                $arr = $this->documentToArray($doc);
                $arr[Constants::F_CLASS_ID] = $newClassId;
                $arr[Constants::F_UPDATED_AT] = date('Y-m-d H:i:s');

                $result = $newCollection->insertOne($arr);
                if (!$result->isAcknowledged()) {
                    throw new StorageException(
                        "MongoDB insert not acknowledged during class rename",
                        'MongoDB',
                        'renameClass',
                        ['oldClassId' => $oldClassId, 'newClassId' => $newClassId, 'docId' => $arr[Constants::F_ID] ?? null]
                    );
                }
                $count++;
            }

            // Drop old collection after successful migration
            if ($count > 0) {
                $oldCollection->drop();
            }

            return $count;
        } catch (StorageException $e) {
            throw $e;
        } catch (\MongoDB\Driver\Exception\Exception $e) {
            throw new StorageException(
                "MongoDB renameClass failed: " . $e->getMessage(),
                'MongoDB',
                'renameClass',
                ['oldClassId' => $oldClassId, 'newClassId' => $newClassId],
                $e
            );
        }
    }

    /**
     * Convert MongoDB document to plain array
     *
     * Removes MongoDB _id field, keeps our id field.
     *
     * @param mixed $doc MongoDB document (BSONDocument)
     * @return array Plain associative array
     */
    private function documentToArray($doc): array
    {
        $arr = (array)$doc;
        // Remove MongoDB _id, keep our id
        unset($arr['_id']);
        return $arr;
    }

    /**
     * Normalize ID for MongoDB queries
     *
     * Converts numeric strings to integers for consistent matching.
     *
     * @param mixed $id ID value
     * @return mixed Normalized ID
     */
    private function normalizeId(mixed $id): mixed
    {
        if (is_numeric($id)) {
            return (int)$id;
        }
        return $id;
    }
}
