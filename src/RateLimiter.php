<?php
/**
 * RateLimiter — Simple file-based IP rate limiting
 *
 * Uses APCu if available, otherwise falls back to /tmp file storage.
 * Designed for single-server deployments. For multi-server, use Redis-backed limiter.
 *
 * @package ElementStore
 */

namespace ElementStore;

class RateLimiter
{
    private int $maxRequests;
    private int $windowSeconds;
    private string $storageDir;

    /**
     * @param int    $maxRequests   Maximum requests per window per IP
     * @param int    $windowSeconds Rolling window size in seconds
     * @param string $storageDir    Directory for file-based counters (fallback)
     */
    public function __construct(int $maxRequests = 200, int $windowSeconds = 60, string $storageDir = '/tmp/es_rate_limit')
    {
        $this->maxRequests = $maxRequests;
        $this->windowSeconds = $windowSeconds;
        $this->storageDir = $storageDir;
    }

    /**
     * Check if a request from the given IP should be allowed.
     *
     * @param  string $ip Client IP address
     * @return array{allowed: bool, remaining: int, reset: int}
     */
    public function check(string $ip): array
    {
        $key = 'es_rl_' . md5($ip);
        $now = time();
        $windowStart = $now - $this->windowSeconds;

        // Try APCu first (fastest, shared across FPM workers)
        if (function_exists('apcu_enabled') && apcu_enabled()) {
            return $this->checkApcu($key, $now, $windowStart);
        }

        // Fallback: file-based
        return $this->checkFile($key, $now, $windowStart);
    }

    /**
     * Get the client IP, respecting X-Forwarded-For behind trusted proxies.
     */
    public static function getClientIp(): string
    {
        // If behind a reverse proxy (common in Docker), use X-Forwarded-For
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            // Take the first (client) IP from the chain
            $ips = array_map('trim', explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']));
            return $ips[0];
        }
        return $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    }

    // =========================================================================
    // APCu backend
    // =========================================================================

    private function checkApcu(string $key, int $now, int $windowStart): array
    {
        $data = apcu_fetch($key);
        if ($data === false) {
            $data = ['timestamps' => [$now]];
        } else {
            // Prune old entries outside window
            $data['timestamps'] = array_values(array_filter(
                $data['timestamps'],
                fn($t) => $t > $windowStart
            ));
            $data['timestamps'][] = $now;
        }

        $count = count($data['timestamps']);
        apcu_store($key, $data, $this->windowSeconds);

        return [
            'allowed'   => $count <= $this->maxRequests,
            'remaining' => max(0, $this->maxRequests - $count),
            'reset'     => $now + $this->windowSeconds,
        ];
    }

    // =========================================================================
    // File backend (fallback)
    // =========================================================================

    private function checkFile(string $key, int $now, int $windowStart): array
    {
        if (!is_dir($this->storageDir)) {
            @mkdir($this->storageDir, 0755, true);
        }

        $file = $this->storageDir . '/' . $key;

        // Simple counter with expiry — less accurate but low overhead
        $data = ['count' => 0, 'window_start' => $now];
        if (file_exists($file)) {
            $raw = @file_get_contents($file);
            $stored = $raw ? json_decode($raw, true) : null;
            if ($stored && ($stored['window_start'] ?? 0) > $windowStart) {
                $data = $stored;
            }
        }

        $data['count']++;
        @file_put_contents($file, json_encode($data), LOCK_EX);

        // Periodic cleanup: remove stale files (1 in 100 requests)
        if (mt_rand(1, 100) === 1) {
            $this->cleanupStaleFiles($windowStart);
        }

        return [
            'allowed'   => $data['count'] <= $this->maxRequests,
            'remaining' => max(0, $this->maxRequests - $data['count']),
            'reset'     => ($data['window_start'] ?? $now) + $this->windowSeconds,
        ];
    }

    private function cleanupStaleFiles(int $windowStart): void
    {
        $files = @glob($this->storageDir . '/es_rl_*');
        if (!$files) return;

        foreach ($files as $file) {
            if (filemtime($file) < $windowStart) {
                @unlink($file);
            }
        }
    }
}
