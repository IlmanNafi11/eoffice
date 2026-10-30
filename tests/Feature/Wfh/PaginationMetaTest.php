<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Existing pagination tests only ever read page 1, where current_page=1 and
 * last_page are coincidentally satisfied by several wrong implementations
 * (hard-coded 1, transposed per_page/total, an off-by-one clamp). These read
 * page 2 and assert the whole meta block, including the per_page clamp.
 */
class PaginationMetaTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id]);

        $this->staff = User::factory()->create(['team_id' => $team->id]);
        $this->staff->assignRole('staf');

        Sanctum::actingAs($this->staff);
    }

    private function reports(int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            WfhReport::factory()->create([
                'user_id' => $this->staff->id,
                'report_date' => now()->subDays($i)->toDateString(),
            ]);
        }
    }

    public function test_second_page_reports_correct_meta(): void
    {
        $this->reports(7);

        $response = $this->getJson('/api/wfh/reports?per_page=5&page=2');

        $response->assertOk();

        // 7 reports at 5 per page: page 2 holds the remaining 2.
        $this->assertCount(2, $response->json('data'));

        $response->assertJsonPath('meta.current_page', 2);
        $response->assertJsonPath('meta.last_page', 2);
        $response->assertJsonPath('meta.per_page', 5);
        $response->assertJsonPath('meta.total', 7);
    }

    public function test_page_beyond_the_end_returns_no_rows_but_keeps_the_meta_consistent(): void
    {
        $this->reports(3);

        $response = $this->getJson('/api/wfh/reports?per_page=5&page=9');

        $response->assertOk();
        $this->assertSame([], $response->json('data'));
        $response->assertJsonPath('meta.total', 3);
        $response->assertJsonPath('meta.per_page', 5);
        $response->assertJsonPath('meta.last_page', 1);
    }

    public function test_per_page_is_clamped_to_the_documented_ceiling(): void
    {
        $this->reports(2);

        // 1000 must not be honoured: an unbounded per_page is a cheap way to
        // pull the whole table in one request.
        $response = $this->getJson('/api/wfh/reports?per_page=1000');

        $response->assertOk();

        $perPage = $response->json('meta.per_page');

        $this->assertLessThanOrEqual(100, $perPage, 'per_page must be clamped.');
        $this->assertGreaterThan(0, $perPage);
    }

    public function test_non_numeric_per_page_falls_back_instead_of_erroring(): void
    {
        $this->reports(1);

        $response = $this->getJson('/api/wfh/reports?per_page=banyak');

        $this->assertNotSame(500, $response->status(), $response->getContent());
        $response->assertOk();

        // The documented default (15), not 1: casting "banyak" to int yields 0,
        // and a 1-item page looks like an empty dataset to the client.
        $response->assertJsonPath('meta.per_page', 15);
    }

    public function test_zero_and_negative_per_page_do_not_produce_empty_pages(): void
    {
        $this->reports(2);

        foreach (['0', '-5'] as $bad) {
            $response = $this->getJson('/api/wfh/reports?per_page='.$bad);

            $response->assertOk();
            $this->assertGreaterThan(0, $response->json('meta.per_page'), "per_page={$bad} must not zero-fill the page.");
        }
    }

    public function test_total_reflects_all_rows_not_just_the_current_page(): void
    {
        $this->reports(12);

        $response = $this->getJson('/api/wfh/reports?per_page=5&page=3');

        $response->assertOk();
        $this->assertCount(2, $response->json('data'));
        $response->assertJsonPath('meta.total', 12);
        $response->assertJsonPath('meta.last_page', 3);
    }
}
