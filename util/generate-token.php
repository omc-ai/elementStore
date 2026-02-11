#!/usr/bin/env php
<?php
/**
 * Generate a JWT token for ElementStore
 *
 * Usage:
 *   php util/generate-token.php
 *   php util/generate-token.php --user=admin --app=arc3d --domain=agura.tech --days=365
 *
 * First run generates RSA keypair in keys/ directory.
 * Outputs the token and the ES_JWT_PUBLIC_KEY env var value.
 */

$keysDir = __DIR__ . '/../keys';
$privateKeyFile = $keysDir . '/private.pem';
$publicKeyFile  = $keysDir . '/public.pem';

// Parse CLI args
$opts = getopt('', ['user:', 'app:', 'domain:', 'days:']);
$userId = $opts['user']   ?? 'admin';
$appId  = $opts['app']    ?? 'arc3d';
$domain = $opts['domain'] ?? null;
$days   = (int)($opts['days'] ?? 365);

// --- Generate keypair if missing ---
if (!file_exists($privateKeyFile) || !file_exists($publicKeyFile)) {
    if (!is_dir($keysDir)) {
        mkdir($keysDir, 0700, true);
    }

    echo "Generating RSA-2048 keypair in keys/ ...\n";
    $config = ['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA];
    $key = openssl_pkey_new($config);
    if (!$key) {
        fwrite(STDERR, "ERROR: openssl_pkey_new() failed\n");
        exit(1);
    }

    openssl_pkey_export($key, $privPem);
    $pubDetails = openssl_pkey_get_details($key);
    $pubPem = $pubDetails['key'];

    file_put_contents($privateKeyFile, $privPem);
    chmod($privateKeyFile, 0600);
    file_put_contents($publicKeyFile, $pubPem);

    echo "  private: {$privateKeyFile}\n";
    echo "  public:  {$publicKeyFile}\n\n";
}

// --- Build JWT ---
$privateKey = file_get_contents($privateKeyFile);
$publicKey  = file_get_contents($publicKeyFile);

$now = time();
$exp = $now + ($days * 86400);

$header = ['alg' => 'RS256', 'typ' => 'JWT'];
$payload = [
    'sub'    => $userId,
    'app_id' => $appId,
    'iat'    => $now,
    'exp'    => $exp,
];
if ($domain !== null) {
    $payload['domain'] = $domain;
}

$segments = [];
$segments[] = base64url_encode(json_encode($header));
$segments[] = base64url_encode(json_encode($payload));

$signingInput = implode('.', $segments);
openssl_sign($signingInput, $signature, $privateKey, OPENSSL_ALGO_SHA256);
$segments[] = base64url_encode($signature);

$token = implode('.', $segments);

// --- Output ---
echo "=== JWT Token ===\n";
echo $token . "\n\n";

echo "=== Payload ===\n";
echo json_encode($payload, JSON_PRETTY_PRINT) . "\n\n";

echo "=== Expires ===\n";
echo date('Y-m-d H:i:s', $exp) . " ({$days} days from now)\n\n";

echo "=== Usage ===\n";
echo "curl -H \"Authorization: Bearer {$token}\" \$BASE_URL/store/customer\n\n";

echo "=== Environment variable (set on server) ===\n";
$pubOneLine = str_replace("\n", "\\n", trim($publicKey));
echo "ES_JWT_PUBLIC_KEY=\"{$pubOneLine}\"\n";

// --- base64url helpers ---
function base64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
