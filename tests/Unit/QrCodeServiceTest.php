<?php

namespace Tests\Unit;

use App\Support\QrCode\QrCodeService;
use Tests\TestCase;

class QrCodeServiceTest extends TestCase
{
    private QrCodeService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(QrCodeService::class);
    }

    public function test_generates_valid_svg(): void
    {
        $svg = $this->service->generate('test-data');

        $this->assertStringStartsWith('<?xml', $svg);
        $this->assertStringContainsString('<svg', $svg);
        $this->assertStringContainsString('</svg>', $svg);
    }

    public function test_generates_different_output_for_different_data(): void
    {
        $svg1 = $this->service->generate('data-1');
        $svg2 = $this->service->generate('data-2');

        $this->assertNotEquals($svg1, $svg2);
    }

    public function test_generates_deterministic_output_for_same_data(): void
    {
        $svg1 = $this->service->generate('test-data');
        $svg2 = $this->service->generate('test-data');

        $this->assertEquals($svg1, $svg2);
    }

    public function test_generates_verification_url_with_token(): void
    {
        $token = bin2hex(random_bytes(32));

        $url = $this->service->generateVerificationUrl($token);

        $this->assertStringContainsString('/verify/', $url);
        $this->assertStringNotContainsString('/api/verify', $url);
        $this->assertStringContainsString(config('app.url'), $url);
        $this->assertStringEndsWith("/verify/{$token}", $url);
    }
}
