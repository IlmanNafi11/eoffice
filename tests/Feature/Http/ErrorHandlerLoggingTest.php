<?php

namespace Tests\Feature\Http;

use App\Exceptions\Handler;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * The error envelope is the app's public contract, but nothing asserted that
 * the handler actually logs. Without the reportable hook an unhandled 500 is
 * silent: the caller gets a message and operations gets nothing, which is the
 * worst combination for diagnosis.
 *
 * Also pins that debug detail is only emitted when explicitly enabled.
 */
class ErrorHandlerLoggingTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_unexpected_exception_is_logged_with_the_exception_context(): void
    {
        $logged = [];

        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged) {
            $logged[] = $event;
        });

        $handler = $this->app->make(Handler::class);
        $handler->report(new \RuntimeException('boom'));

        $this->assertNotSame([], $logged, 'An unhandled exception must produce a log entry.');

        $entry = collect($logged)->firstWhere('level', 'error');

        $this->assertNotNull($entry);
        $this->assertSame('Unhandled exception', $entry->message);
        $this->assertArrayHasKey('exception', $entry->context);
        $this->assertSame('boom', $entry->context['exception']->getMessage());
    }

    public function test_client_errors_are_not_logged_as_unhandled(): void
    {
        // A 422 or a 403 is normal traffic. Logging them as "Unhandled
        // exception" trains operators to ignore the alert that matters.
        $logged = [];

        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged) {
            $logged[] = $event;
        });

        $handler = $this->app->make(Handler::class);

        $handler->report(ValidationException::withMessages(['x' => 'bad']));
        $handler->report(new AuthenticationException);
        $handler->report(new AuthorizationException);

        $unhandled = collect($logged)->where('message', 'Unhandled exception');

        $this->assertCount(
            0,
            $unhandled->all(),
            'Expected client errors to stay out of the unhandled-exception log.',
        );
    }

    public function test_the_envelope_is_stable_for_an_unexpected_error(): void
    {
        // Testing enables app.debug, which adds the debug block; the contract
        // under test here is the production shape.
        config(['app.debug' => false]);

        $response = $this->app->make(Handler::class)->render(
            Request::create('/api/whatever', 'GET', server: ['HTTP_ACCEPT' => 'application/json']),
            new \RuntimeException('internal detail that must not leak'),
        );

        $payload = json_decode($response->getContent(), true);

        $this->assertSame(500, $response->getStatusCode());
        $this->assertFalse($payload['success']);
        $this->assertSame('Terjadi kesalahan pada server.', $payload['message']);
        $this->assertStringNotContainsString(
            'internal detail that must not leak',
            $response->getContent(),
            'Exception text must not reach the client.',
        );
        $this->assertArrayNotHasKey('debug', $payload);
    }

    public function test_debug_detail_is_only_present_when_debug_is_on(): void
    {
        config(['app.debug' => false]);

        $response = $this->app->make(Handler::class)->render(
            Request::create('/api/x', 'GET', server: ['HTTP_ACCEPT' => 'application/json']),
            new \RuntimeException('secret'),
        );

        $payload = json_decode($response->getContent(), true);

        $this->assertArrayNotHasKey('debug', $payload, 'No debug block when app.debug is off.');
    }
}
