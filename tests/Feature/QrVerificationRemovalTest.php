<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * QR document verification is cut off (SPEC wfh-ux-remediation, Task 2):
 * the public endpoint, the controller behind it, and the per-document
 * verification tokens existing solely to feed it are all gone. Dompdf 3.x
 * never rendered the inline SVG QR, so no consumer ever resolved a token —
 * carrying the surface would only keep a public, unauthenticated lookup
 * alive with no reader.
 *
 * Failures here mean a piece of the removed feature is still reachable.
 */
class QrVerificationRemovalTest extends TestCase
{
    use RefreshDatabase;

    public function test_no_route_serves_verification_tokens(): void
    {
        $verificationRoutes = collect(Route::getRoutes()->getRoutes())
            ->map(fn ($route) => $route->uri())
            ->filter(fn (string $uri) => str_starts_with($uri, 'api/verify'))
            ->values()
            ->all();

        $this->assertSame([], $verificationRoutes, 'No route may serve document verification.');
    }

    public function test_verification_controller_is_gone(): void
    {
        // class_exists() would make Composer try to include the deleted PSR-4
        // file and blow up as an ErrorException; the file path is the truth
        // this assertion needs.
        $this->assertFalse(
            file_exists(app_path('Http/Controllers/QrVerificationController.php')),
            'QrVerificationController must not exist once the endpoint is removed.'
        );
    }

    public function test_verification_token_columns_are_dropped(): void
    {
        foreach (['wfh_reports', 'change_initiations', 'wfh_team_reports'] as $table) {
            $this->assertFalse(
                Schema::hasColumn($table, 'verification_token'),
                "{$table}.verification_token must be dropped."
            );
        }
    }

    public function test_approval_no_longer_writes_verification_columns(): void
    {
        // The state machines wrote the token through forceFill(); after the
        // column drop that write would raise an SQL error on approval. Assert
        // the column list itself, which is what broke.
        $this->assertSame(
            [],
            array_values(array_filter(
                Schema::getColumnListing('wfh_reports'),
                fn (string $column) => str_contains($column, 'verification'),
            )),
        );
    }
}
