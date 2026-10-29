<?php

namespace Tests\Unit\Exceptions;

use App\Exceptions\ApiException;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class ApiExceptionTest extends TestCase
{
    public function test_defaults_to_422_without_errors(): void
    {
        $e = new ApiException('Gagal diproses.');

        $this->assertSame(422, $e->status());
        $this->assertNull($e->errors());
        $this->assertSame('Gagal diproses.', $e->getMessage());
    }

    public function test_keeps_explicit_status_and_errors(): void
    {
        $errors = ['value' => ['Nilai wajib diisi.']];

        $e = new ApiException('Data tidak valid.', 404, $errors);

        $this->assertSame(404, $e->status());
        $this->assertSame($errors, $e->errors());
    }

    public function test_keeps_previous_exception(): void
    {
        $previous = new RuntimeException('boom');

        $e = new ApiException('Terjadi kesalahan.', 500, null, $previous);

        $this->assertSame($previous, $e->getPrevious());
        $this->assertSame(500, $e->status());
    }

    public function test_is_a_runtime_exception(): void
    {
        $this->assertInstanceOf(RuntimeException::class, new ApiException('x'));
    }
}
