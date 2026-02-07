<?php
/**
 * Storage Exception
 *
 * Custom exception for ElementStore errors.
 * Provides context about what operation failed and why, including validation errors.
 *
 * @package ElementStore
 */

namespace ElementStore;

class StorageException extends \Exception
{
    /** @var string Error code (e.g., 'not_found', 'validation_failed', 'forbidden') */
    private string $errorCode;

    /** @var array Validation errors [{path, message, code}] */
    private array $errors;

    /** @var mixed Additional context data */
    private mixed $context;

    /**
     * Create storage exception
     *
     * @param string          $message   Error message
     * @param string          $errorCode Error code (e.g., 'not_found', 'forbidden')
     * @param array           $errors    Validation errors
     * @param mixed           $context   Additional context
     * @param \Throwable|null $previous  Previous exception if wrapping
     */
    public function __construct(
        string $message,
        string $errorCode = 'error',
        array $errors = [],
        mixed $context = null,
        ?\Throwable $previous = null
    ) {
        parent::__construct($message, 0, $previous);
        $this->errorCode = $errorCode;
        $this->errors = $errors;
        $this->context = $context;
    }

    /**
     * Get the error code
     *
     * @return string
     */
    public function getErrorCode(): string
    {
        return $this->errorCode;
    }

    /**
     * Get validation errors
     *
     * @return array
     */
    public function getErrors(): array
    {
        return $this->errors;
    }

    /**
     * Get additional context data
     *
     * @return mixed
     */
    public function getContext(): mixed
    {
        return $this->context;
    }

    /**
     * Check if this is a validation error
     *
     * @return bool
     */
    public function isValidationError(): bool
    {
        return $this->errorCode === 'validation_failed' && !empty($this->errors);
    }

    /**
     * Convert to array for JSON serialization
     *
     * @return array
     */
    public function toArray(): array
    {
        $result = [
            'error' => $this->getMessage(),
            'code' => $this->errorCode,
        ];

        if (!empty($this->errors)) {
            $result['errors'] = $this->errors;
        }

        if ($this->context !== null) {
            $result['context'] = $this->context;
        }

        return $result;
    }

    /**
     * Create exception from legacy JSON error format
     *
     * @param string $json JSON error string
     *
     * @return static
     */
    public static function fromJson(string $json): static
    {
        $data = json_decode($json, true);
        if ($data === null) {
            return new static($json);
        }

        return new static(
            $data['message'] ?? $data['error'] ?? 'Unknown error',
            $data['code'] ?? 'error',
            $data['errors'] ?? []
        );
    }
}
