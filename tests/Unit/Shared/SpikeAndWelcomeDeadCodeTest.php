<?php

namespace Tests\Unit\Shared;

use Tests\TestCase;

/**
 * A13: SpikeController and its spike PDF views were development-only scratch
 * routes and are removed entirely (not disabled).
 * A14: resources/views/welcome.blade.php is the Laravel default landing page;
 * the SPA catch-all serves resources/views/app.blade.php instead, so the
 * welcome view is deleted.
 */
class SpikeAndWelcomeDeadCodeTest extends TestCase
{
    public function test_spike_controller_is_gone(): void
    {
        $this->assertFileDoesNotExist(app_path('Http/Controllers/SpikeController.php'));
        $this->assertFalse(
            class_exists('App\\Http\\Controllers\\SpikeController'),
            'SpikeController must be removed entirely.'
        );
    }

    public function test_spike_views_are_gone(): void
    {
        $this->assertFileDoesNotExist(resource_path('views/spike/wfh-report.blade.php'));
        $this->assertFileDoesNotExist(resource_path('views/spike/change-impl.blade.php'));
        $this->assertDirectoryDoesNotExist(resource_path('views/spike'));
    }

    public function test_spike_routes_are_gone(): void
    {
        $web = file_get_contents(base_path('routes/web.php'));

        $this->assertStringNotContainsString('SpikeController', $web);
        $this->assertStringNotContainsString('/spike/', $web);
        $this->assertStringNotContainsString('use App\\Http\\Controllers\\SpikeController;', $web);
    }

    public function test_welcome_view_is_gone(): void
    {
        $this->assertFileDoesNotExist(resource_path('views/welcome.blade.php'));
    }
}
