#!/usr/bin/env php
<?php
/**
 * ElementStore Genesis Initialization Script
 *
 * Initializes the ElementStore with all system classes and seed data.
 *
 * Usage:
 *   php init.php                    # Initialize (skip existing)
 *   php init.php --force            # Force reinitialize all
 *   php init.php --verify           # Verify only, don't create
 *   php init.php --reset            # Reset all data and reinitialize
 *   php init.php --export           # Export genesis data as JSON
 *   php init.php --url=<url>        # Custom API URL
 *
 * Environment:
 *   ELEMENTSTORE_API_URL - API base URL (default: http://localhost/elementStore)
 */

require_once __DIR__ . '/Genesis.php';

use ElementStore\Genesis\Genesis;

// Parse command line arguments
$options = getopt('', ['force', 'verify', 'reset', 'export', 'url:', 'help']);

if (isset($options['help'])) {
    echo <<<HELP
ElementStore Genesis Initialization

Usage:
  php init.php [options]

Options:
  --force     Force reinitialize all data (update existing)
  --verify    Verify only, don't create anything
  --reset     Reset all data and reinitialize from scratch
  --export    Export genesis data as JSON file
  --url=URL   Custom API URL (default: from env or http://localhost/elementStore)
  --help      Show this help message

Environment Variables:
  ELEMENTSTORE_API_URL   API base URL

Examples:
  php init.php                                    # Normal initialization
  php init.php --force                            # Force update all
  php init.php --verify                           # Check if data exists
  php init.php --url=http://wallet-bo.master.local/elementStore

HELP;
    exit(0);
}

// Get API URL
$apiUrl = $options['url']
    ?? getenv('ELEMENTSTORE_API_URL')
    ?: 'http://wallet-bo.master.local/elementStore';

echo "ElementStore Genesis\n";
echo "====================\n";
echo "API URL: {$apiUrl}\n\n";

$genesis = new Genesis($apiUrl);

// Handle different modes
if (isset($options['export'])) {
    echo "Exporting genesis data...\n";
    $data = $genesis->getGenesisData();
    $filename = __DIR__ . '/genesis-data.json';
    file_put_contents($filename, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo "Exported to: {$filename}\n";
    echo "Classes: " . count($data['classes']) . "\n";
    echo "Editors: " . count($data['editors']) . "\n";
    exit(0);
}

if (isset($options['verify'])) {
    echo "Verifying genesis data...\n\n";
    $result = $genesis->verify();

    echo "Classes:\n";
    foreach ($result['classes'] as $id => $info) {
        $status = $info['exists'] ? "\033[32m✓\033[0m" : "\033[31m✗\033[0m";
        $name = $info['name'] ?? $id;
        $props = isset($info['props_count']) ? " ({$info['props_count']} props)" : '';
        echo "  {$status} {$id}: {$name}{$props}\n";
    }

    echo "\nEditors:\n";
    if (isset($result['editors']['count'])) {
        echo "  Found {$result['editors']['count']} editors\n";
        echo "  IDs: " . implode(', ', $result['editors']['ids']) . "\n";
    }

    if (!empty($result['missing'])) {
        echo "\n\033[31mMissing:\033[0m\n";
        foreach ($result['missing'] as $item) {
            echo "  - {$item}\n";
        }
    }

    echo "\n";
    if ($result['valid']) {
        echo "\033[32mAll genesis data verified successfully!\033[0m\n";
        exit(0);
    } else {
        echo "\033[31mVerification failed - some data is missing\033[0m\n";
        exit(1);
    }
}

if (isset($options['reset'])) {
    echo "\033[33mWARNING: This will reset ALL data!\033[0m\n";
    echo "Continue? [y/N]: ";
    $confirm = trim(fgets(STDIN));
    if (strtolower($confirm) !== 'y') {
        echo "Aborted.\n";
        exit(0);
    }

    echo "\nResetting and reinitializing...\n\n";
    $result = $genesis->reset();

    echo "Reset result: " . ($result['reset']['reset'] ?? 'unknown') . "\n";
    printInitResult($result['init']);
    exit($result['init']['success'] ? 0 : 1);
}

// Default: Initialize
$force = isset($options['force']);
echo "Initializing" . ($force ? " (force mode)" : "") . "...\n\n";

$result = $genesis->init($force);
printInitResult($result);
exit($result['success'] ? 0 : 1);

/**
 * Print initialization results
 */
function printInitResult(array $result): void
{
    echo "API Version: {$result['api_version']}\n\n";

    if (!empty($result['classes'])) {
        echo "Classes created:\n";
        foreach ($result['classes'] as $id => $status) {
            echo "  \033[32m✓\033[0m {$id}: {$status}\n";
        }
    }

    if (!empty($result['editors'])) {
        echo "\nEditors created:\n";
        foreach ($result['editors'] as $id => $status) {
            echo "  \033[32m✓\033[0m {$id}: {$status}\n";
        }
    }

    if (!empty($result['skipped'])) {
        echo "\nSkipped (already exists):\n";
        foreach ($result['skipped'] as $item) {
            echo "  \033[33m-\033[0m {$item}\n";
        }
    }

    if (!empty($result['errors'])) {
        echo "\n\033[31mErrors:\033[0m\n";
        foreach ($result['errors'] as $error) {
            echo "  ✗ {$error}\n";
        }
    }

    echo "\n";
    echo "Started: {$result['started_at']}\n";
    echo "Completed: {$result['completed_at']}\n";

    if ($result['success']) {
        echo "\n\033[32mGenesis initialization completed successfully!\033[0m\n";
    } else {
        echo "\n\033[31mGenesis initialization completed with errors.\033[0m\n";
    }
}
