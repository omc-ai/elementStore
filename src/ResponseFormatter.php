<?php

namespace ElementStore;

/**
 * ResponseFormatter — renders query results in different formats based on Accept header.
 *
 * Supported formats:
 *   application/json  (default) — raw JSON
 *   text/plain         — CLI-friendly text table
 *   text/html          — HTML table
 *
 * Headers:
 *   Accept: text/plain              → text table
 *   X-Response-Format: text         → text table (alias)
 *   X-Fields: name,status,id        → select specific fields (all formats)
 */
class ResponseFormatter
{
    /**
     * Detect requested format from request headers.
     * @return string 'json'|'text'|'html'
     */
    public static function detectFormat(): string
    {
        // Explicit header takes priority
        $explicit = $_SERVER['HTTP_X_RESPONSE_FORMAT'] ?? '';
        if ($explicit) {
            $explicit = strtolower(trim($explicit));
            if (in_array($explicit, ['text', 'plain', 'table'])) return 'text';
            if (in_array($explicit, ['html'])) return 'html';
            return 'json';
        }

        // Standard Accept header
        $accept = $_SERVER['HTTP_ACCEPT'] ?? 'application/json';
        if (str_contains($accept, 'text/plain')) return 'text';
        if (str_contains($accept, 'text/html') && !str_contains($accept, 'application/json')) return 'html';

        return 'json';
    }

    /**
     * Get requested field selection from X-Fields header.
     * @return array|null  null = all fields, array = selected field keys
     */
    public static function getFields(): ?array
    {
        $fields = $_SERVER['HTTP_X_FIELDS'] ?? '';
        if (!$fields) return null;
        return array_map('trim', explode(',', $fields));
    }

    /**
     * Format data according to detected format.
     * @param mixed $data  The response data (array of objects, single object, or scalar)
     * @param int $code    HTTP status code
     * @return \Phalcon\Http\Response
     */
    public static function format($data, int $code = 200): \Phalcon\Http\Response
    {
        $format = self::detectFormat();
        $fields = self::getFields();

        if ($format === 'json') {
            // Standard JSON — apply field filtering if requested
            if ($fields && is_array($data)) {
                $data = self::filterFields($data, $fields);
            }
            return (new \Phalcon\Http\Response())
                ->setStatusCode($code)
                ->setJsonContent($data);
        }

        if ($format === 'text') {
            $text = self::toTextTable($data, $fields);
            $response = new \Phalcon\Http\Response();
            $response->setStatusCode($code);
            $response->setContentType('text/plain', 'UTF-8');
            $response->setContent($text);
            return $response;
        }

        if ($format === 'html') {
            $html = self::toHtmlTable($data, $fields);
            $response = new \Phalcon\Http\Response();
            $response->setStatusCode($code);
            $response->setContentType('text/html', 'UTF-8');
            $response->setContent($html);
            return $response;
        }

        // Fallback
        return (new \Phalcon\Http\Response())->setStatusCode($code)->setJsonContent($data);
    }

    /**
     * Filter object fields to only include selected keys.
     */
    private static function filterFields(array $data, array $fields): array
    {
        // If it's a list of objects
        if (isset($data[0]) && is_array($data[0])) {
            return array_map(function ($item) use ($fields) {
                if (!is_array($item)) return $item;
                $filtered = [];
                foreach ($fields as $f) {
                    if (array_key_exists($f, $item)) $filtered[$f] = $item[$f];
                }
                return $filtered;
            }, $data);
        }

        // Single object
        if (is_array($data) && !isset($data[0])) {
            $filtered = [];
            foreach ($fields as $f) {
                if (array_key_exists($f, $data)) $filtered[$f] = $data[$f];
            }
            return $filtered;
        }

        return $data;
    }

    /**
     * Render data as a CLI-friendly text table.
     */
    public static function toTextTable($data, ?array $fields = null): string
    {
        if (!is_array($data)) return (string)$data;

        // Single object → key-value pairs
        if (is_array($data) && !isset($data[0])) {
            if ($fields) {
                $data = array_intersect_key($data, array_flip($fields));
            }
            $lines = [];
            $maxKey = 0;
            foreach ($data as $k => $v) {
                if (str_starts_with($k, '_') && $k !== '_id') continue;
                $maxKey = max($maxKey, strlen($k));
            }
            foreach ($data as $k => $v) {
                if (str_starts_with($k, '_') && $k !== '_id') continue;
                $val = self::formatValue($v);
                $lines[] = str_pad($k, $maxKey) . '  ' . $val;
            }
            return implode("\n", $lines) . "\n";
        }

        // Empty array
        if (empty($data)) return "(empty)\n";

        // List of objects → table
        $rows = [];
        foreach ($data as $item) {
            if (!is_array($item)) {
                $rows[] = ['value' => (string)$item];
                continue;
            }
            if ($fields) {
                $item = array_intersect_key($item, array_flip($fields));
            } else {
                // Auto-exclude internal fields and large text fields
                $item = array_filter($item, function ($v, $k) {
                    if (str_starts_with($k, '_') && $k !== '_id') return false;
                    if (is_string($v) && strlen($v) > 200) return false;
                    if (is_array($v)) return false;
                    return true;
                }, ARRAY_FILTER_USE_BOTH);
            }
            $rows[] = $item;
        }

        if (empty($rows)) return "(empty)\n";

        // Collect all column keys
        $cols = [];
        foreach ($rows as $row) {
            foreach (array_keys($row) as $k) {
                if (!in_array($k, $cols)) $cols[] = $k;
            }
        }

        // Calculate column widths
        $widths = [];
        foreach ($cols as $col) {
            $widths[$col] = strlen($col);
        }
        foreach ($rows as $row) {
            foreach ($cols as $col) {
                $val = self::formatValue($row[$col] ?? '');
                $widths[$col] = max($widths[$col], min(strlen($val), 50));
            }
        }

        // Render
        $lines = [];

        // Header
        $header = '';
        $separator = '';
        foreach ($cols as $col) {
            $w = $widths[$col];
            $header .= str_pad($col, $w) . '  ';
            $separator .= str_repeat('─', $w) . '  ';
        }
        $lines[] = rtrim($header);
        $lines[] = rtrim($separator);

        // Rows
        foreach ($rows as $row) {
            $line = '';
            foreach ($cols as $col) {
                $val = self::formatValue($row[$col] ?? '');
                if (strlen($val) > 50) $val = substr($val, 0, 47) . '...';
                $line .= str_pad($val, $widths[$col]) . '  ';
            }
            $lines[] = rtrim($line);
        }

        $lines[] = ''; // trailing newline
        $count = count($rows);
        $lines[] = "({$count} rows)";

        return implode("\n", $lines) . "\n";
    }

    /**
     * Render data as an HTML table.
     */
    public static function toHtmlTable($data, ?array $fields = null): string
    {
        if (!is_array($data)) return '<pre>' . htmlspecialchars((string)$data) . '</pre>';

        // Single object
        if (is_array($data) && !isset($data[0])) {
            if ($fields) $data = array_intersect_key($data, array_flip($fields));
            $html = '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse; font-family:monospace; font-size:13px">';
            foreach ($data as $k => $v) {
                if (str_starts_with($k, '_') && $k !== '_id') continue;
                $html .= '<tr><th style="text-align:left; background:#f5f5f5">' . htmlspecialchars($k) . '</th>';
                $html .= '<td>' . htmlspecialchars(self::formatValue($v)) . '</td></tr>';
            }
            $html .= '</table>';
            return $html;
        }

        if (empty($data)) return '<p>(empty)</p>';

        // List → table
        $rows = [];
        foreach ($data as $item) {
            if (!is_array($item)) { $rows[] = ['value' => $item]; continue; }
            if ($fields) $item = array_intersect_key($item, array_flip($fields));
            $rows[] = $item;
        }

        $cols = [];
        foreach ($rows as $row) {
            foreach (array_keys($row) as $k) {
                if (!in_array($k, $cols)) $cols[] = $k;
            }
        }

        $html = '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse; font-family:monospace; font-size:13px">';
        $html .= '<tr>';
        foreach ($cols as $col) {
            $html .= '<th style="text-align:left; background:#f5f5f5">' . htmlspecialchars($col) . '</th>';
        }
        $html .= '</tr>';

        foreach ($rows as $row) {
            $html .= '<tr>';
            foreach ($cols as $col) {
                $val = self::formatValue($row[$col] ?? '');
                $html .= '<td>' . htmlspecialchars($val) . '</td>';
            }
            $html .= '</tr>';
        }
        $html .= '</table>';
        $html .= '<p>(' . count($rows) . ' rows)</p>';

        return $html;
    }

    /**
     * Format a value for text display.
     */
    private static function formatValue($v): string
    {
        if (is_null($v)) return '';
        if (is_bool($v)) return $v ? 'true' : 'false';
        if (is_array($v)) return json_encode($v, JSON_UNESCAPED_UNICODE);
        return (string)$v;
    }
}
