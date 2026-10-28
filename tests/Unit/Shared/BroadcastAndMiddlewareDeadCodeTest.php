<?php

namespace Tests\Unit\Shared;

use App\Http\Kernel;
use App\Providers\RouteServiceProvider;
use ReflectionClass;
use Tests\TestCase;

/**
 * A10/A12: the application serves JSON APIs only, so the broadcasting stack and
 * the unused `guest`/`signed` middleware aliases carry no runtime purpose. They
 * are removed outright rather than left disabled.
 */
class BroadcastAndMiddlewareDeadCodeTest extends TestCase
{
    public function test_broadcasting_stack_is_gone(): void
    {
        $this->assertFileDoesNotExist(base_path('routes/channels.php'));
        $this->assertFileDoesNotExist(base_path('config/broadcasting.php'));
        $this->assertFileDoesNotExist(app_path('Providers/BroadcastServiceProvider.php'));

        $this->assertStringNotContainsString(
            'BroadcastServiceProvider',
            file_get_contents(base_path('config/app.php')),
            'config/app.php must not keep a commented-out dead provider line.'
        );
    }

    public function test_unused_middleware_aliases_and_classes_are_gone(): void
    {
        $defaults = (new ReflectionClass(Kernel::class))->getDefaultProperties();
        $aliases = $defaults['middlewareAliases'];

        foreach (['guest', 'signed'] as $removed) {
            $this->assertArrayNotHasKey(
                $removed,
                $aliases,
                "Middleware alias '{$removed}' must be removed."
            );
        }

        $this->assertFileDoesNotExist(app_path('Http/Middleware/RedirectIfAuthenticated.php'));
        $this->assertFileDoesNotExist(app_path('Http/Middleware/ValidateSignature.php'));

        $this->assertFalse(
            (new ReflectionClass(RouteServiceProvider::class))->hasConstant('HOME'),
            'RouteServiceProvider::HOME existed only to serve RedirectIfAuthenticated.'
        );
    }
}
