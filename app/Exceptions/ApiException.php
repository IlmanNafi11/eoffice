<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * The only exception whose message may be shown to the client. Carries the
 * HTTP status and optional validation-style errors for the error envelope.
 */
final class ApiException extends RuntimeException
{
    public function __construct(
        string $message,
        private readonly int $status = 422,
        private readonly ?array $errors = null,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }

    public function status(): int
    {
        return $this->status;
    }

    public function errors(): ?array
    {
        return $this->errors;
    }
}
