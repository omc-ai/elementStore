<?php
/**
 * ElementStore Autoloader
 *
 * PSR-4 style autoloader for ElementStore namespace with support for
 * classes defined in multi-class files.
 *
 * Usage:
 *   require_once __DIR__ . '/../elementStore/autoload.php';
 *
 *   use ElementStore\ClassModel;
 *   use ElementStore\AtomObj;
 *   use ElementStore\EntityObj;
 *   use ElementStore\Prop;
 *   use ElementStore\ClassMeta;
 *   use ElementStore\SystemClasses;
 *   use ElementStore\JsonStorageProvider;
 *   use ElementStore\MongoStorageProvider;
 *   use ElementStore\CouchDbStorageProvider;
 *   use ElementStore\StorageException;
 *   use ElementStore\Constants;
 *
 * Available storage providers:
 *   - JsonStorageProvider: File-based JSON storage
 *   - MongoStorageProvider: MongoDB storage
 *   - CouchDbStorageProvider: CouchDB storage
 *
 * Example:
 *   $storage = new JsonStorageProvider('/path/to/data');
 *   $model = new ClassModel($storage);
 *
 * Or use boot() to auto-configure from @init.json:
 *   $model = ClassModel::boot(__DIR__);
 */

namespace ElementStore;

/**
 * Class map for classes that don't match their file names
 * (e.g., EntityObj is defined in AtomObj.php)
 */
$elementStoreClassMap = [
    'ElementStore\\EntityObj' => __DIR__ . '/src/AtomObj.php',
];

/**
 * Namespace to directory mapping
 */
$elementStoreNamespaces = [
    'ElementStore\\Genesis\\' => __DIR__ . '/genesis/',
    'ElementStore\\' => __DIR__ . '/src/',
];

spl_autoload_register(function ($class) use ($elementStoreClassMap, $elementStoreNamespaces) {
    // Check class map first (for classes in multi-class files)
    if (isset($elementStoreClassMap[$class])) {
        require_once $elementStoreClassMap[$class];
        return;
    }

    // Check each namespace
    foreach ($elementStoreNamespaces as $prefix => $baseDir) {
        $len = strlen($prefix);
        if (strncmp($prefix, $class, $len) !== 0) {
            continue;
        }

        // Get relative class name
        $relativeClass = substr($class, $len);

        // Replace namespace separator with directory separator
        $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';

        if (file_exists($file)) {
            require_once $file;
            return;
        }
    }
});
