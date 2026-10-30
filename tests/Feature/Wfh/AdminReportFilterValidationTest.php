<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Ship review SEC-01: admin report filters reached Postgres unvalidated, so a
 * non-numeric team_id or an invented status produced a 22P02 bigint cast error
 * and a 500 instead of a 422. A 500 on caller-controlled input is both a
 * correctness bug and a cheap fingerprinting signal.
 */
class AdminReportFilterValidationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id]);

        $this->admin = User::factory()->create([
            'team_id' => $team->id,
            'is_active' => true,
            'must_change_password' => false,
        ]);
        $this->admin->assignRole('admin');

        Sanctum::actingAs($this->admin);
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function rejectedFilters(): array
    {
        return [
            'team_id not numeric' => ['team_id', 'abc'],
            'team_id numeric but absent' => ['team_id', '999999'],
            'status invented' => ['status', 'sudah-disetujui'],
            'status injection attempt' => ['status', "draft' OR 1=1 --"],
            'date garbage' => ['date', 'kemarin'],
            'month wrong shape' => ['month', '2026-13'],
            'date_from garbage' => ['date_from', 'not-a-date'],
        ];
    }

    #[DataProvider('rejectedFilters')]
    public function test_garbage_filter_is_a_422_never_a_500(string $key, string $value): void
    {
        $response = $this->getJson('/api/admin/wfh/reports?'.http_build_query([$key => $value]));

        $this->assertNotSame(500, $response->status(), "Filter {$key} must be validated, not forwarded to Postgres.");

        $response->assertStatus(422);
        $response->assertJsonPath('success', false);
        $response->assertJsonStructure(['success', 'message', 'errors' => [$key]]);
    }

    public function test_valid_filters_still_work(): void
    {
        $report = WfhReport::factory()->create([
            'user_id' => $this->admin->id,
            'report_date' => now()->toDateString(),
            'status' => 'draft',
        ]);

        $response = $this->getJson('/api/admin/wfh/reports?status=draft&team_id='.$this->admin->team_id);

        $response->assertOk();

        $ids = collect($response->json('data'))->pluck('id');

        $this->assertTrue(
            $ids->contains($report->id),
            'A valid status/team filter must still return the matching report.',
        );
    }
}
