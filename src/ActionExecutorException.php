<?php
/**
 * ActionExecutorException — thrown when an action execution fails
 *
 * @package ElementStore
 */

namespace ElementStore;

class ActionExecutorException extends \RuntimeException
{
    /** @var int HTTP status code if the failure came from an API call */
    private int $httpStatus;

    public function __construct(string $message, int $httpStatus = 0, ?\Throwable $previous = null)
    {
        parent::__construct($message, $httpStatus, $previous);
        $this->httpStatus = $httpStatus;
    }

    public function getHttpStatus(): int
    {
        return $this->httpStatus;
    }

    public function isHttpError(): bool
    {
        return $this->httpStatus >= 400;
    }
}
