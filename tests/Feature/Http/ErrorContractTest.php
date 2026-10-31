<?php

namespace Tests\Feature\Http;

use App\Exceptions\ApiException;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Spatie\Permission\Exceptions\UnauthorizedException;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Tests\TestCase;

/**
 * Error-contract module (T2): every exception escaping to HTTP is rendered by
 * Handler::render() as the error envelope {success:false, message, errors?}
 * with the spec'd status — never leaking internals (FQCN, trace, raw messages).
 */
class ErrorContractTest extends TestCase
{
    use RefreshDatabase;

    private const GENERIC_500 = 'Terjadi kesalahan pada server.';

    private int $probe = 0;

    protected function setUp(): void
    {
        parent::setUp();

        // phpunit.xml does not pin APP_DEBUG, so the ambient value comes from
        // .env. Pin it explicitly so "no internals leaked" assertions are
        // deterministic and the debug tests opt in on purpose.
        config(['app.debug' => false]);
    }

    /**
     * Register a throwaway API route that throws the given exception instance.
     */
    private function probe(callable $throws): string
    {
        $uri = 'probe/'.++$this->probe;

        Route::middleware('api')->prefix('api')->get($uri, $throws);

        return '/api/'.$uri;
    }

    private function assertErrorEnvelope($response, int $status, string $message): void
    {
        $response->assertStatus($status)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', $message);

        $body = (string) $response->getContent();
        $this->assertStringNotContainsString('App\\', $body);
        $this->assertStringNotContainsString('Tests\\', $body);
    }

    // ─── mapping table ───────────────────────────────────────────────────

    public function test_api_exception_uses_its_own_status_message_and_errors(): void
    {
        $route = $this->probe(fn () => throw new ApiException(
            'Stok tidak mencukupi.',
            409,
            ['sku' => ['Stok habis.']],
        ));

        $this->getJson($route)
            ->assertStatus(409)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Stok tidak mencukupi.')
            ->assertJsonPath('errors.sku.0', 'Stok habis.');
    }

    public function test_validation_exception_renders_422_with_indonesian_message_and_errors(): void
    {
        $route = $this->probe(fn () => throw ValidationException::withMessages([
            'field' => ['Isi field ini.'],
        ]));

        $response = $this->getJson($route);

        $this->assertErrorEnvelope($response, 422, 'Data yang diberikan tidak valid.');
        $response->assertJsonPath('errors.field.0', 'Isi field ini.');
    }

    public function test_authentication_exception_renders_401(): void
    {
        $route = $this->probe(fn () => throw new AuthenticationException);

        $this->assertErrorEnvelope($this->getJson($route), 401, 'Unauthenticated.');
    }

    public function test_authorization_exception_renders_403(): void
    {
        $route = $this->probe(fn () => throw new AuthorizationException);

        $this->assertErrorEnvelope($this->getJson($route), 403, 'Anda tidak memiliki izin untuk aksi ini.');
    }

    public function test_spatie_unauthorized_exception_renders_403(): void
    {
        $route = $this->probe(fn () => throw UnauthorizedException::forPermissions(['user.manage']));

        $this->assertErrorEnvelope($this->getJson($route), 403, 'Anda tidak memiliki izin untuk aksi ini.');
    }

    public function test_model_not_found_renders_404_without_fqcn_or_id(): void
    {
        $route = $this->probe(fn () => throw (new ModelNotFoundException)
            ->setModel(User::class, 99999));

        $response = $this->getJson($route);

        $this->assertErrorEnvelope($response, 404, 'Data tidak ditemukan.');
        $this->assertStringNotContainsString('99999', (string) $response->getContent());
        $this->assertStringNotContainsString('User', (string) $response->getContent());
    }

    public function test_not_found_http_exception_renders_404(): void
    {
        // Unknown API route: framework 404, not the SPA catch-all.
        $this->assertErrorEnvelope($this->getJson('/api/definitely/not/here'), 404, 'Data tidak ditemukan.');
    }

    public function test_throttle_requests_exception_renders_429_and_keeps_retry_after(): void
    {
        $route = $this->probe(fn () => throw new ThrottleRequestsException(
            'Too Many Attempts.',
            null,
            ['Retry-After' => 42],
        ));

        $response = $this->getJson($route);

        $this->assertErrorEnvelope($response, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
        $this->assertSame('42', $response->headers->get('Retry-After'));
    }

    public function test_method_not_allowed_renders_405_and_keeps_allow_header(): void
    {
        $route = $this->probe(fn () => throw new MethodNotAllowedHttpException(['GET'], 'nope'));

        $response = $this->getJson($route);

        $this->assertErrorEnvelope($response, 405, 'Metode tidak diizinkan.');
        $this->assertSame('GET', $response->headers->get('Allow'));
    }

    public function test_other_http_exception_keeps_its_status(): void
    {
        $route = $this->probe(fn () => throw new BadRequestHttpException('raw internal detail'));

        $response = $this->getJson($route);

        $this->assertErrorEnvelope($response, 400, 'Permintaan tidak dapat diproses.');
        $this->assertStringNotContainsString('raw internal detail', (string) $response->getContent());
    }

    public function test_unexpected_exception_renders_500_without_internals(): void
    {
        $route = $this->probe(fn () => throw new RuntimeException('secret internal detail'));

        $response = $this->getJson($route);

        $this->assertErrorEnvelope($response, 500, self::GENERIC_500);
        $this->assertStringNotContainsString('secret internal detail', (string) $response->getContent());
    }

    // ─── debug key ───────────────────────────────────────────────────────

    public function test_debug_key_present_only_when_debug_true_and_non_production(): void
    {
        $route = $this->probe(fn () => throw new RuntimeException('debuggable'));

        config(['app.debug' => true]);
        $this->getJson($route)
            ->assertStatus(500)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', self::GENERIC_500)
            ->assertJsonPath('debug.class', RuntimeException::class);

        config(['app.debug' => false]);
        $this->getJson($route)
            ->assertStatus(500)
            ->assertJsonMissingPath('debug');
    }

    public function test_debug_key_absent_in_production_even_when_debug_true(): void
    {
        $route = $this->probe(fn () => throw new RuntimeException('debuggable'));

        config(['app.debug' => true, 'app.env' => 'production']);

        $this->getJson($route)
            ->assertStatus(500)
            ->assertJsonMissingPath('debug');
    }

    // ─── envelope integrity on every error ───────────────────────────────

    public function test_every_error_response_carries_success_false_and_message(): void
    {
        $cases = [
            [$this->probe(fn () => throw new AuthenticationException), 401],
            [$this->probe(fn () => throw new AuthorizationException), 403],
            [$this->probe(fn () => throw ValidationException::withMessages(['x' => ['y']])), 422],
            [$this->probe(fn () => throw new NotFoundHttpException), 404],
            [$this->probe(fn () => throw new RuntimeException('boom')), 500],
        ];

        foreach ($cases as [$route, $status]) {
            $response = $this->getJson($route);

            $response->assertStatus($status);
            $this->assertFalse($response->json('success'));
            $this->assertNotEmpty($response->json('message'));
        }
    }

    // ─── non-JSON requests keep framework behavior ───────────────────────

    public function test_web_request_still_falls_back_to_framework_rendering(): void
    {
        // No Accept: application/json and not an /api/* path → HTML rendering,
        // so the envelope must not be forced onto the SPA surface.
        //
        // POST on purpose: the SPA catch-all is `Route::get('/{any}')`, so a GET
        // probe is shadowed by it and the test would only assert that the SPA
        // view renders — and would flip red as soon as `public/build` exists.
        Route::post('probe-web', fn () => throw new RuntimeException('boom'));

        $response = $this->post('/probe-web');

        $this->assertSame(500, $response->getStatusCode());
        $this->assertStringContainsString('text/html', (string) $response->headers->get('content-type'));
        $this->assertStringNotContainsString('"success"', (string) $response->getContent());
    }
}
