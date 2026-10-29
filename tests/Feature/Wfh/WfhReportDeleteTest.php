<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WfhReportDeleteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
    }

    public function test_staf_can_delete_own_draft_report(): void
    {
        // RED: staf has wfh.report.delete? No — seeder only gives admin this perm.
        // Bug: ownership guard + perm guard deadlock means nobody can delete.
        $staf = User::factory()->create();
        $staf->assignRole('staf');
        Sanctum::actingAs($staf);

        $report = WfhReport::factory()->create([
            'user_id' => $staf->id,
            'status' => 'draft',
        ]);

        $this->deleteJson("/api/wfh/reports/{$report->id}")
            ->assertNoContent();

        $this->assertSoftDeleted('wfh_reports', ['id' => $report->id]);
    }

    public function test_admin_can_delete_other_users_draft_report(): void
    {
        // RED: admin has wfh.report.delete perm but owner guard blocks them
        // ("Tidak dapat menghapus laporan orang lain"). Admin should be exempt.
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        $staf = User::factory()->create();
        $staf->assignRole('staf');

        $report = WfhReport::factory()->create([
            'user_id' => $staf->id,
            'status' => 'draft',
        ]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/wfh/reports/{$report->id}")
            ->assertNoContent();

        $this->assertSoftDeleted('wfh_reports', ['id' => $report->id]);
    }

    public function test_staf_cannot_delete_other_users_report(): void
    {
        $owner = User::factory()->create();
        $owner->assignRole('staf');
        $other = User::factory()->create();
        $other->assignRole('staf');

        $report = WfhReport::factory()->create([
            'user_id' => $owner->id,
            'status' => 'draft',
        ]);

        Sanctum::actingAs($other);

        $this->deleteJson("/api/wfh/reports/{$report->id}")
            ->assertStatus(403);
    }

    public function test_cannot_delete_approved_report(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        $staf = User::factory()->create();
        $staf->assignRole('staf');

        $report = WfhReport::factory()->create([
            'user_id' => $staf->id,
            'status' => 'approved',
        ]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/wfh/reports/{$report->id}")
            ->assertStatus(422);
    }
}
