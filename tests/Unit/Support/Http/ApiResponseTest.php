<?php

namespace Tests\Unit\Support\Http;

use App\Support\Http\ApiResponse;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Pagination\LengthAwarePaginator;
use Tests\TestCase;

class SampleApiResource extends JsonResource
{
    public function toArray($request): array
    {
        return ['id' => $this->id];
    }
}

class ApiResponseTest extends TestCase
{
    public function test_ok_returns_200_with_data_and_null_message_and_meta(): void
    {
        $response = ApiResponse::ok(['id' => 1]);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(
            ['success' => true, 'data' => ['id' => 1], 'message' => null, 'meta' => null],
            $response->getData(true),
        );
    }

    public function test_ok_accepts_an_optional_message(): void
    {
        $response = ApiResponse::ok(['id' => 1], 'Profil berhasil diperbarui.');

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('Profil berhasil diperbarui.', $response->getData(true)['message']);
    }

    public function test_created_returns_201_with_message(): void
    {
        $response = ApiResponse::created(['id' => 1], 'User berhasil dibuat.');

        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame(
            ['success' => true, 'data' => ['id' => 1], 'message' => 'User berhasil dibuat.'],
            $response->getData(true),
        );
    }

    public function test_deleted_returns_204_without_body_or_json_content_type(): void
    {
        $response = ApiResponse::deleted();

        $this->assertSame(204, $response->getStatusCode());
        $this->assertSame('', $response->getContent());
        $this->assertFalse($response->headers->has('Content-Type'));
    }

    public function test_paginated_emits_exactly_four_meta_keys(): void
    {
        $page = new LengthAwarePaginator(
            ['first' => (object) ['id' => 1], 'second' => (object) ['id' => 2]],
            total: 42,
            perPage: 15,
            currentPage: 2,
        );

        $response = ApiResponse::paginated($page, SampleApiResource::class);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(true, $response->getData(true)['success']);
        $this->assertSame(
            ['current_page', 'last_page', 'per_page', 'total'],
            array_keys($response->getData(true)['meta']),
        );
        $this->assertSame(
            ['current_page' => 2, 'last_page' => 3, 'per_page' => 15, 'total' => 42],
            $response->getData(true)['meta'],
        );
    }

    public function test_paginated_maps_data_through_the_given_resource(): void
    {
        $page = new LengthAwarePaginator(
            [(object) ['id' => 1], (object) ['id' => 2]],
            total: 2,
            perPage: 15,
            currentPage: 1,
        );

        $response = ApiResponse::paginated($page, SampleApiResource::class);

        $this->assertSame(
            [['id' => 1], ['id' => 2]],
            $response->getData(true)['data'],
        );
    }

    public function test_fail_defaults_to_422_without_errors_key(): void
    {
        $response = ApiResponse::fail('Gagal diproses.');

        $this->assertSame(422, $response->getStatusCode());
        $this->assertSame(
            ['success' => false, 'message' => 'Gagal diproses.'],
            $response->getData(true),
        );
    }

    public function test_fail_includes_errors_when_passed(): void
    {
        $response = ApiResponse::fail('Validasi gagal.', errors: ['name' => ['Nama wajib diisi.']]);

        $this->assertSame(422, $response->getStatusCode());
        $this->assertSame(
            ['name' => ['Nama wajib diisi.']],
            $response->getData(true)['errors'],
        );
    }

    public function test_fail_accepts_custom_status(): void
    {
        $response = ApiResponse::fail('Konflik.', status: 409);

        $this->assertSame(409, $response->getStatusCode());
    }
}
