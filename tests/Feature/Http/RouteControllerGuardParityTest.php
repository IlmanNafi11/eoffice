<?php

namespace Tests\Feature\Http;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * SPEC-authorization-consistency: a controller must re-check the same
 * permission its route requires. Route middleware alone means a route-table
 * edit silently opens the action (which is exactly what happened to
 * ChangePackageController::destroy, which authorized `update` while its route
 * required `delete`).
 *
 * This guards the whole surface, not one endpoint: every mutating API route
 * that declares `permission:<name>` must have a controller that calls
 * $this->authorize('<name>'). The method body is read from source, so a deleted
 * guard fails here instead of after a deploy.
 */
class RouteControllerGuardParityTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_mutating_route_permission_is_rechecked_in_its_controller(): void
    {
        $violations = [];

        foreach (Route::getRoutes() as $route) {
            if (! $this->isAuditable($route)) {
                continue;
            }

            $permission = $this->permissionOf($route);

            if ($permission === null) {
                continue;
            }

            $action = $route->getActionName();

            if (! str_contains($action, '@')) {
                continue;
            }

            [$class, $method] = explode('@', $action, 2);

            if (! class_exists($class)) {
                continue;
            }

            if (! $this->authorizes($class, $method, $permission)) {
                $violations[] = sprintf('%s %s -> %s::%s() requires permission:%s but does not call $this->authorize() with it',
                    implode('|', $route->methods()), $route->uri(), $class, $method, $permission);
            }
        }

        $this->assertSame([], $violations, "Route/controller authorization drift:\n".implode("\n", $violations));
    }

    private function isAuditable(RoutingRoute $route): bool
    {
        if (! str_starts_with($route->uri(), 'api/')) {
            return false;
        }

        return (bool) array_intersect($route->methods(), ['POST', 'PUT', 'PATCH', 'DELETE']);
    }

    private function permissionOf(RoutingRoute $route): ?string
    {
        foreach ($route->gatherMiddleware() as $middleware) {
            if (is_string($middleware) && str_starts_with($middleware, 'permission:')) {
                return substr($middleware, strlen('permission:'));
            }
        }

        return null;
    }

    /**
     * True when the method source contains $this->authorize('<permission>').
     */
    private function authorizes(string $class, string $method, string $permission): bool
    {
        $reflection = new \ReflectionMethod($class, $method);
        $file = $reflection->getFileName();
        $lines = file((string) $file);

        if ($lines === false) {
            return false;
        }

        $source = implode('', array_slice($lines, $reflection->getStartLine() - 1, $reflection->getEndLine() - $reflection->getStartLine() + 1));

        return (bool) preg_match("/\\\$this->authorize\(\s*'?\"?".preg_quote($permission, '/')."'?\"?\s*\)/", $source);
    }
}
