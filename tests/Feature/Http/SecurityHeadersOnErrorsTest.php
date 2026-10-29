<?php

namespace Tests\Feature\Http;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Error-contract module (T8): security headers must also be present on error
 * responses.
 *
 * Exceptions raised inside the router are rendered by the routing pipeline,
 * which sits inside the global SecurityHeaders middleware — those already
 * carry the headers. Exceptions raised by a global middleware ordered BEFORE
 * SecurityHeaders are rendered by the Kernel after the pipeline unwinds, so
 * they bypass the middleware entirely; the RequestHandled listener in
 * AppServiceProvider is what covers them.
 */
class SecurityHeadersOnErrorsTest extends TestCase
{
    use RefreshDatabase;

    private int $probe = 0;

    private const HEADERS = [
        'X-Content-Type-Options' => 'nosniff',
        'X-Frame-Options' => 'DENY',
        'Referrer-Policy' => 'strict-origin-when-cross-origin',
        'Permissions-Policy' => 'geolocation=(), microphone=(), camera=()',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.debug' => false]);
    }

    private function probe(callable $throws): string
    {
        $uri = 'probe/'.++$this->probe;

        Route::middleware('api')->prefix('api')->get($uri, $throws);

        return '/api/'.$uri;
    }

    private function assertSecurityHeaders($response): void
    {
        foreach (self::HEADERS as $name => $value) {
            $response->assertHeader($name, $value);
        }
    }

    // ─── rendered inside the pipeline (middleware covers these) ──────────

    public function test_401_response_carries_security_headers(): void
    {
        $this->assertSecurityHeaders(
            $this->getJson($this->probe(fn () => throw new AuthenticationException)),
        );
    }

    public function test_403_response_carries_security_headers(): void
    {
        $this->assertSecurityHeaders(
            $this->getJson($this->probe(fn () => throw new AuthorizationException)),
        );
    }

    public function test_404_response_carries_security_headers(): void
    {
        $this->assertSecurityHeaders($this->getJson('/api/definitely-not-a-route'));
    }

    public function test_422_response_carries_security_headers(): void
    {
        $this->assertSecurityHeaders(
            $this->getJson($this->probe(fn () => throw ValidationException::withMessages([
                'field' => ['Isi field ini.'],
            ]))),
        );
    }

    public function test_500_response_carries_security_headers(): void
    {
        $this->assertSecurityHeaders(
            $this->getJson($this->probe(fn () => throw new \RuntimeException('internal'))),
        );
    }

    public function test_success_response_still_carries_security_headers(): void
    {
        $this->assertSecurityHeaders($this->getJson('/api/health'));
    }

    // ─── rendered after the pipeline unwinds (listener covers these) ─────

    public function test_error_from_earlier_middleware_carries_security_headers(): void
    {
        // A global middleware prepended before SecurityHeaders: its exception
        // escapes the pipeline and is rendered by the Kernel, so only the
        // RequestHandled listener can add the headers.
        $this->app->make(HttpKernel::class)->prependMiddleware(BoomMiddleware::class);

        $this->assertSecurityHeaders($this->getJson('/api/health'));
    }
}

class BoomMiddleware
{
    public function handle($request, \Closure $next)
    {
        throw new \RuntimeException('boom before SecurityHeaders');
    }
}
