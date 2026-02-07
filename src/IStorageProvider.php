<?php
/**
 * Storage Provider Interface
 *
 * Standard interface for all storage implementations (JSON, MongoDB, SQL, etc.).
 * Storage providers are "dumb" - they only handle raw data persistence.
 * All validation, change detection, and business logic happens in ClassModel.
 *
 * FLOW:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  ClassModel (smart)                                                     │
 * │    ↓                                                                    │
 * │  setObject() → validate → detectChanges() → onChange()                  │
 * │                                                ↓                        │
 * │                                          storage->setobj()              │
 * │                                                ↓                        │
 * │                                    (if @class meta changed)             │
 * │                                          storage->renameProp()          │
 * │                                          storage->renameClass()         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * STORAGE RESPONSIBILITIES:
 * - Store/retrieve raw objects (no validation)
 * - Handle ID generation for new objects
 * - Manage timestamps (created_at, updated_at)
 * - Provide rename utilities for bulk updates
 *
 * IMPLEMENTATIONS:
 * - JsonStorageProvider: File-based, one JSON file per class
 * - MongoStorageProvider: MongoDB, one collection per class
 * - (Future) SqlStorageProvider: SQL with table columns + JSON data column
 */

namespace ElementStore;

interface IStorageProvider
{
    /**
     * Get object(s) by class and optional ID
     *
     * @param string $class Class identifier (class_id)
     * @param mixed $id Optional object ID. If null, returns all objects of class.
     * @return array|null Single object array, array of objects, or null if not found
     *
     * @example
     * // Get all users
     * $users = $storage->getobj('user');
     *
     * // Get specific user
     * $user = $storage->getobj('user', 123);
     */
    public function getobj(string $class, mixed $id = null): array|null;

    /**
     * Set/update object (data already validated by ClassModel)
     *
     * Storage determines if create or update based on ID existence in storage.
     * For new objects: generates ID if not provided, sets class_id and created_at.
     * For all objects: sets updated_at timestamp.
     *
     * @param string $class Class identifier (class_id)
     * @param array $obj Object to store (validated, with defaults applied)
     * @return array Saved object with ID and timestamps
     *
     * @example
     * // Create new object (no ID)
     * $user = $storage->setobj('user', ['name' => 'John']);
     * // Returns: ['id' => 1, 'class_id' => 'user', 'name' => 'John', ...]
     *
     * // Update existing object
     * $user = $storage->setobj('user', ['id' => 1, 'name' => 'Jane']);
     */
    public function setobj(string $class, array $obj): array;

    /**
     * Delete object by class and ID
     *
     * @param string $class Class identifier
     * @param mixed $id Object ID
     * @return bool True if deleted, false if not found
     */
    public function delobj(string $class, mixed $id): bool;

    /**
     * Query objects with filters and options
     *
     * @param string $class Class identifier
     * @param array $filters Key-value filters. Array values use IN matching.
     * @param array $options Query options:
     *   - sort: string - Field to sort by
     *   - sortDir: string - 'asc' or 'desc' (default: 'asc')
     *   - limit: int - Max results
     *   - offset: int - Skip first N results
     * @return array Matching objects
     *
     * @example
     * $active = $storage->query('user', ['status' => 'active'], [
     *     'sort' => 'created_at',
     *     'sortDir' => 'desc',
     *     'limit' => 10
     * ]);
     */
    public function query(string $class, array $filters = [], array $options = []): array;

    /**
     * Rename a property key across all objects of a class
     *
     * Called by ClassModel when a property key is renamed in class meta.
     * Updates all existing objects to use the new key name.
     *
     * @param string $classId Class identifier
     * @param string $oldKey Old property key name
     * @param string $newKey New property key name
     * @return int Number of objects updated
     *
     * @example
     * // Rename 'email' to 'contact_email' in all user objects
     * $count = $storage->renameProp('user', 'email', 'contact_email');
     */
    public function renameProp(string $classId, string $oldKey, string $newKey): int;

    /**
     * Rename a class (move all objects to new class identifier)
     *
     * Called by ClassModel when a class ID is changed.
     * Updates class_id field in all objects and moves to new storage location.
     *
     * @param string $oldClassId Old class identifier
     * @param string $newClassId New class identifier
     * @return int Number of objects updated
     *
     * @example
     * // Rename 'user' class to 'account'
     * $count = $storage->renameClass('user', 'account');
     */
    public function renameClass(string $oldClassId, string $newClassId): int;
}
