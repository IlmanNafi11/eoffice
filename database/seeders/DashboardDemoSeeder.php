<?php

namespace Database\Seeders;

use App\Domains\ChangeManagement\Models\ChangeImplementation;
use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\Dashboard\Services\WorkdayWindow;
use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\Team;
use App\Models\User;
use App\Support\Constants\DemoOrganization;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Demo data for the dashboard module (dashboard T8).
 *
 * The dashboard answers "what must I do today and how is WFH compliance?" —
 * on a fresh install every figure is zero, which reads like a broken page.
 * This seeder fills the demo field with a full 14-workday window: mixed
 * report statuses (approved/pending compliant, draft/rejected not), exactly
 * one user below the 60% attention threshold, pending queue rows, and
 * today's attendance/report.
 *
 * Local/testing only (mirrors DemoUsersSeeder): a production `db:seed` must
 * never grow demo evidence rows. Idempotent: the window and the status mix
 * are deterministic and every insert is skipped when its row already exists,
 * so re-running `db:seed` never duplicates history.
 */
class DashboardDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('local', 'testing')) {
            $this->command?->warn(
                'DashboardDemoSeeder dilewati: data demo hanya untuk environment local/testing.',
            );

            return;
        }

        $staf = User::where('email', 'staf@kominfo.go.id')->first();
        $kepalaTim = User::where('email', 'kepala.tim@kominfo.go.id')->first();
        $kepalaBidang = User::where('email', 'kepala.bidang@kominfo.go.id')->first();
        $admin = User::where('email', 'admin@kominfo.go.id')->first();

        if ($staf === null || $kepalaTim === null || $kepalaBidang === null || $admin === null) {
            $this->command?->warn(
                'DashboardDemoSeeder dilewati: jalankan AdminUserSeeder + DemoUsersSeeder lebih dulu.',
            );

            return;
        }

        $dates = WorkdayWindow::last();

        // Everyone except the intentional straggler stays ABOVE 60%, so the
        // attention list has exactly one entry — a realistic-looking list
        // whose ranking ("paling rendah dulu") is actually observable.
        $this->seedPersonalWfh($staf, $dates, [
            3 => 'rejected',
            4 => 'draft',
            5 => 'pending',
        ]);
        $this->seedPersonalWfh($kepalaTim, $dates, [
            2 => 'draft',
            7 => 'rejected',
        ]);
        $this->seedPersonalWfh($kepalaBidang, $dates, []);
        $this->seedPersonalWfh($admin, $dates, [
            1 => 'draft',
        ]);

        $this->seedLowComplianceUser($dates);
        $this->seedTeamReports($dates);
        $this->seedChangeQueue($staf);
    }

    /**
     * Reports over the window; `$overrides` maps a day index to a
     * non-compliant status. Everything else is `approved`, so the demo
     * user's own trend reads as healthy compliance, not as noise.
     *
     * @param  list<string>  $dates
     * @param  array<int, string>  $overrides
     */
    private function seedPersonalWfh(User $user, array $dates, array $overrides): void
    {
        foreach ($dates as $index => $date) {
            $this->seedReportFor($user, $date, $overrides[$index] ?? 'approved');
        }

        // Today's attendance so "sudah absen" is visible immediately.
        $this->seedAttendance($user, now()->toDateString(), 'pagi');
    }

    /**
     * The single user below the attention threshold: one pending report out
     * of the whole window (~7%), so the ranking is unambiguous.
     */
    private function seedLowComplianceUser(array $dates): void
    {
        $team = Team::where('name', DemoOrganization::TEAM)->first();

        if ($team === null) {
            return;
        }

        $user = User::firstOrCreate(
            ['email' => 'noncompliant@kominfo.go.id'],
            [
                'team_id' => $team->id,
                'name' => 'Nia Noncompliant',
                'nip' => '4444444444',
                'password' => Str::random(24),
                'is_active' => true,
                'must_change_password' => true,
            ],
        );

        // Credential rotation mirrors DemoUsersSeeder (ship review #20): a
        // firstOrCreate that returns an older row would otherwise leave an
        // account nobody can log into (or rotate) alive. The demo password
        // comes from APP_DEMO_PASSWORD, else a fresh random one — always
        // written, then flagged for rotation on first login.
        $password = (string) config('app.demo_password', '');
        $user->forceFill([
            'password' => $password === '' ? Str::random(24) : $password,
            'must_change_password' => true,
        ])->save();

        $user->assignRole('staf');
        $this->seedReportFor($user, $dates[0], 'pending');
    }

    private function seedTeamReports(array $dates): void
    {
        $team = Team::where('name', DemoOrganization::TEAM)->first();
        $maker = User::where('email', 'kepala.tim@kominfo.go.id')->first();

        if ($team === null || $maker === null) {
            return;
        }

        // Two pending team reports (the kepala_tim/kepala_bidang queue) and
        // one already decided.
        $this->seedTeamReport($team->id, $maker->id, $dates[0], 'pending');
        $this->seedTeamReport($team->id, $maker->id, $dates[1], 'pending');
        $this->seedTeamReport($team->id, $maker->id, $dates[2], 'approved');
    }

    private function seedChangeQueue(User $staf): void
    {
        $fieldId = $staf->team?->field_id;

        if ($fieldId === null) {
            return;
        }

        // Two pending packages initiated by the staf demo user — the
        // kepala_tim approve queue is team-scoped and counts exactly these;
        // draft/approved rows prove the status filter is doing its job.
        $pendingA = $this->seedInitiation($staf, $fieldId, 'pending', 'A');
        $pendingB = $this->seedInitiation($staf, $fieldId, 'pending', 'B');
        $this->seedInitiation($staf, $fieldId, 'draft', 'C');
        $this->seedInitiation($staf, $fieldId, 'approved', 'D');

        // One submitted implementation for the kepala_tim review queue.
        if ($pendingA !== null) {
            $this->seedImplementation($pendingA, 'submitted');
        }

        if ($pendingB !== null) {
            $this->seedImplementation($pendingB, 'draft');
        }
    }

    private function seedReportFor(User $user, string $date, string $status): void
    {
        // The attendance seed runs even when the report already exists: a
        // partially-seeded database (earlier run interrupted, or reports
        // seeded by another module) must still converge to "absent = 1" on
        // the recap instead of silently keeping everyone absent.
        $this->seedAttendance($user, $date, 'pagi');

        $exists = WfhReport::withTrashed()
            ->where('user_id', $user->id)
            ->whereDate('report_date', $date)
            ->exists();

        if ($exists) {
            return;
        }

        $report = WfhReport::query()->create([
            'user_id' => $user->id,
            'report_date' => $date,
        ]);

        $report->forceFill(['status' => $status])->save();
    }

    private function seedAttendance(User $user, string $date, string $session): void
    {
        $exists = WfhAttendance::withTrashed()
            ->where('user_id', $user->id)
            ->whereDate('date', $date)
            ->where('session', $session)
            ->exists();

        if ($exists) {
            return;
        }

        WfhAttendance::create([
            'user_id' => $user->id,
            'date' => $date,
            'session' => $session,
            'photo_path' => "attendances/{$user->id}/{$date}/{$session}.jpg",
            'check_in_at' => now(),
        ]);
    }

    private function seedTeamReport(int $teamId, int $makerId, string $date, string $status): void
    {
        $exists = WfhTeamReport::query()
            ->where('team_id', $teamId)
            ->whereDate('report_date', $date)
            ->exists();

        if ($exists) {
            return;
        }

        $report = WfhTeamReport::query()->create([
            'team_id' => $teamId,
            'report_date' => $date,
            'created_by' => $makerId,
        ]);

        $report->forceFill(['status' => $status])->save();
    }

    /**
     * Workflow columns (doc_number, initiator_id, status, ...) are not
     * fillable by design (SEC-07), so the demo row is written through
     * forceFill — the same boundary the real state machines use.
     */
    private function seedInitiation(User $initiator, int $fieldId, string $status, string $slot): ?ChangeInitiation
    {
        $docNumber = 'DEMO/'.$slot.'/'.now()->format('n').'/1.1/114/'.now()->format('Y');

        $existing = ChangeInitiation::withTrashed()->where('doc_number', $docNumber)->first();

        if ($existing !== null) {
            return $existing;
        }

        $initiation = new ChangeInitiation([
            'field_id' => $fieldId,
            'description' => "Demo paket perubahan {$slot}",
            'reason' => 'Data demo untuk antrean keputusan dashboard.',
        ]);

        $initiation->forceFill([
            'initiator_id' => $initiator->id,
            'doc_number' => $docNumber,
            'initiation_date' => now()->toDateString(),
            'status' => $status,
            'initiator_signed_at' => $status === 'draft' ? null : now(),
        ])->save();

        return $initiation;
    }

    private function seedImplementation(ChangeInitiation $initiation, string $status): void
    {
        $exists = ChangeImplementation::withTrashed()
            ->where('change_initiation_id', $initiation->id)
            ->exists();

        if ($exists) {
            return;
        }

        $implementation = ChangeImplementation::query()->create([
            'change_initiation_id' => $initiation->id,
            'priority' => 'normal',
            'impact' => 'Minor',
        ]);

        $implementation->forceFill(['status' => $status])->save();
    }
}
