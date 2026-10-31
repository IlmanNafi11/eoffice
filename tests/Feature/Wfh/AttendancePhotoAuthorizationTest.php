<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Attendance photos are evidence (they show a person's face): they live on the
 * private `local` disk and stream through
 * GET /wfh/reports/{report}/attendances/{attendance}/photo, which splits access
 * between the report owner and a `wfh.monitoring.view` holder of the same
 * bidang.
 *
 * The route deliberately carries no `permission:` middleware — a route-level
 * check cannot express "owner OR supervisor" — so the split lives in the
 * controller and can only be verified through the endpoint. Before this test
 * the whole read path was unexercised: removing either branch or the same-field
 * guard left the suite green.
 */
class AttendancePhotoAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private Field $fieldA;

    private Field $fieldB;

    private User $owner;

    private WfhReport $report;

    private WfhAttendance $attendance;

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        $this->fieldA = Field::factory()->create();
        $this->fieldB = Field::factory()->create();

        $teamA = Team::factory()->create(['field_id' => $this->fieldA->id]);

        $this->owner = User::factory()->create(['team_id' => $teamA->id]);
        $this->owner->assignRole('staf');

        $this->report = WfhReport::factory()->create([
            'user_id' => $this->owner->id,
        ]);

        $path = "attendances/{$this->owner->id}/2026-10-31/pagi.jpg";
        Storage::disk('local')->put($path, 'PHOTO-BYTES');

        $this->attendance = WfhAttendance::create([
            'user_id' => $this->owner->id,
            'report_id' => $this->report->id,
            'date' => '2026-10-31',
            'session' => 'pagi',
            'photo_path' => $path,
            'check_in_at' => now(),
        ]);
    }

    private function url(): string
    {
        return '/api/wfh/reports/'.$this->report->id.'/attendances/'.$this->attendance->id.'/photo';
    }

    /** A supervisor in the same bidang may inspect any report in that bidang. */
    private function supervisorIn(Field $field): User
    {
        $team = Team::factory()->create(['field_id' => $field->id]);
        $user = User::factory()->create(['team_id' => $team->id]);
        $user->assignRole('kepala_tim');

        return $user;
    }

    public function test_unauthenticated_request_is_refused(): void
    {
        $this->getJson($this->url())->assertUnauthorized();
    }

    public function test_owner_receives_own_photo_as_uncacheable_bytes(): void
    {
        Sanctum::actingAs($this->owner);

        // BinaryFileResponse has no status() helper; assert the raw code.
        $response = $this->get($this->url());

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('PHOTO-BYTES', $response->streamedContent());

        $cacheControl = (string) $response->headers->get('Cache-Control');
        $this->assertStringContainsString('no-store', $cacheControl);
        $this->assertStringNotContainsString(
            'public',
            $cacheControl,
            'A face photo must never be marked cacheable by shared caches.',
        );
    }

    public function test_supervisor_of_the_same_field_may_read_the_photo(): void
    {
        Sanctum::actingAs($this->supervisorIn($this->fieldA));

        $this->assertSame(200, $this->get($this->url())->getStatusCode());
    }

    public function test_supervisor_of_another_field_is_refused(): void
    {
        // Holds wfh.monitoring.view, so only the same-field guard can stop this.
        Sanctum::actingAs($this->supervisorIn($this->fieldB));

        $this->getJson($this->url())->assertForbidden();
    }

    public function test_plain_colleague_without_monitoring_permission_is_refused(): void
    {
        $colleague = User::factory()->create(['team_id' => $this->owner->team_id]);
        $colleague->assignRole('staf');
        Sanctum::actingAs($colleague);

        $this->getJson($this->url())->assertForbidden();
    }

    public function test_attendance_from_another_report_is_not_reachable(): void
    {
        Sanctum::actingAs($this->owner);

        $otherReport = WfhReport::factory()->create([
            'user_id' => $this->owner->id,
            'report_date' => '2026-10-30',
        ]);

        $this->getJson(
            '/api/wfh/reports/'.$otherReport->id.'/attendances/'.$this->attendance->id.'/photo'
        )->assertNotFound();
    }

    public function test_missing_file_is_404_not_500(): void
    {
        Storage::disk('local')->delete($this->attendance->photo_path);

        Sanctum::actingAs($this->owner);

        $this->getJson($this->url())->assertNotFound();
    }
}
