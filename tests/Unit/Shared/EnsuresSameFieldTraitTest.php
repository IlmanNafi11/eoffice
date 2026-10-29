<?php

namespace Tests\Unit\Shared;

use App\Domains\Wfh\Http\Controllers\Concerns\EnsuresSameField;
use App\Domains\Wfh\Http\Controllers\ReportApprovalController;
use App\Domains\Wfh\Http\Controllers\TeamReportController;
use ReflectionClass;
use Tests\TestCase;

/**
 * The same-field guard ("Laporan tidak berada dalam bidang Anda.") must live in
 * exactly one definition: the EnsuresSameField trait. Both WFH approval
 * controllers consume it rather than declaring their own copy.
 */
class EnsuresSameFieldTraitTest extends TestCase
{
    public function test_trait_exists_and_declares_the_same_field_guard(): void
    {
        $this->assertTrue(
            trait_exists(EnsuresSameField::class),
            'EnsuresSameField trait must exist.'
        );

        $trait = new ReflectionClass(EnsuresSameField::class);

        $this->assertTrue(
            $trait->hasMethod('ensureSameField'),
            'The trait must declare ensureSameField().'
        );
    }

    public function test_report_approval_controller_uses_the_trait_without_own_copy(): void
    {
        $this->assertContains(
            EnsuresSameField::class,
            (new ReflectionClass(ReportApprovalController::class))->getTraitNames(),
            'ReportApprovalController must use the EnsuresSameField trait.'
        );

        $this->assertStringNotContainsString(
            'function ensureSameField',
            file_get_contents((new ReflectionClass(ReportApprovalController::class))->getFileName()),
            'ReportApprovalController must not declare its own ensureSameField copy.'
        );
    }

    public function test_team_report_controller_uses_the_trait_without_own_copy(): void
    {
        $this->assertContains(
            EnsuresSameField::class,
            (new ReflectionClass(TeamReportController::class))->getTraitNames(),
            'TeamReportController must use the EnsuresSameField trait.'
        );

        $this->assertStringNotContainsString(
            'function ensureSameField',
            file_get_contents((new ReflectionClass(TeamReportController::class))->getFileName()),
            'TeamReportController must not declare its own ensureSameField copy.'
        );
    }
}
