<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SchemaRelationshipTest extends TestCase
{
    use RefreshDatabase;

    public function test_report_has_many_attendances(): void
    {
        $user = User::factory()->create();
        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
        ]);

        $sessions = ['pagi', 'siang', 'sore'];
        foreach ($sessions as $session) {
            $attendance = WfhAttendance::create([
                'user_id' => $user->id,
                'date' => $report->report_date->format('Y-m-d'),
                'session' => $session,
                'photo_path' => "attendances/{$user->id}/{$report->report_date->format('Y-m-d')}/{$session}.jpg",
                'report_id' => $report->id,
            ]);
            $this->assertNotNull($attendance);
        }

        $report->load('attendances');
        $this->assertCount(3, $report->attendances);
        $this->assertEquals(['pagi', 'siang', 'sore'], $report->attendances->pluck('session')->toArray());
    }
}
