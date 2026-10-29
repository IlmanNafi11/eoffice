<?php

namespace Tests\Feature\ChangeManagement;

use App\Domains\ChangeManagement\Http\Controllers\ChangePackageController;
use App\Domains\ChangeManagement\Services\ChangePackageDecision;
use ReflectionClass;
use ReflectionMethod;
use Tests\TestCase;

/**
 * dedup-state Task 3 — one approve/reject decision path.
 *
 * The controller must delegate the pending/access/self guard sequence and the
 * transition to ChangePackageDecision::decide(); it must not retain inline
 * copies of those guards. This pins the structural contract guard-by-guard so
 * a future duplication slips back in as a failing test.
 */
class ChangePackageDecisionTest extends TestCase
{
    public function test_decision_service_exists(): void
    {
        $this->assertTrue(
            class_exists(ChangePackageDecision::class),
            'ChangePackageDecision service must exist.'
        );

        $this->assertTrue(
            (new ReflectionClass(ChangePackageDecision::class))->hasMethod('decide'),
            'ChangePackageDecision must declare decide().'
        );
    }

    public function test_controller_delegates_instead_of_inlining_guards(): void
    {
        $controller = new ReflectionClass(ChangePackageController::class);

        foreach (['approve', 'reject'] as $action) {
            $method = $controller->getMethod($action);
            $source = $this->methodSource($method);

            $this->assertStringNotContainsString(
                'Hanya paket pending',
                $source,
                "{$action}() must not inline the pending guard."
            );
            $this->assertStringNotContainsString(
                'packageVisibleTo',
                $source,
                "{$action}() must not inline the access guard."
            );
            $this->assertStringNotContainsString(
                'Inisiator tidak dapat',
                $source,
                "{$action}() must not inline the self-approval guard."
            );
            $this->assertStringNotContainsString(
                'transitionPackage',
                $source,
                "{$action}() must delegate the transition to the decision service."
            );
        }
    }

    public function test_controller_is_under_300_lines(): void
    {
        $reflector = new ReflectionClass(ChangePackageController::class);
        $lines = $reflector->getEndLine() - $reflector->getStartLine() + 1;

        $this->assertLessThan(
            300,
            $lines,
            'ChangePackageController must be under 300 lines after dedup.'
        );
    }

    private function methodSource(ReflectionMethod $method): string
    {
        $file = file($method->getFileName());
        $start = $method->getStartLine() - 1;
        $length = $method->getEndLine() - $method->getStartLine() + 1;

        return implode('', array_slice($file, $start, $length));
    }
}
