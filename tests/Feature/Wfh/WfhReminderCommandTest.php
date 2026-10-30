<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use App\Notifications\WfhReminderNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class WfhReminderCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        // Freeze to Monday 15:30 WIB — weekday, after default start_time (15:00)
        Carbon::setTestNow(Carbon::parse('2026-07-20 15:30:00', 'Asia/Jakarta'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_sends_notification_to_user_without_attendance_and_report(): void
    {
        Notification::fake();

        $userA = User::factory()->create(); // no attendance, no report
        $userB = User::factory()->create(); // has attendance only
        WfhAttendance::create([
            'user_id' => $userB->id,
            'date' => now()->toDateString(),
            'session' => 'pagi',
            'photo_path' => 'test.jpg',
            'check_in_at' => now(),
        ]);

        $this->artisan('wfh:send-reminders');

        Notification::assertSentTo($userA, WfhReminderNotification::class);
        Notification::assertNotSentTo($userB, WfhReminderNotification::class);
    }

    public function test_skips_user_who_has_report_but_no_attendance(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => now()->toDateString(),
        ]);

        $this->artisan('wfh:send-reminders');

        Notification::assertNotSentTo($user, WfhReminderNotification::class);
    }

    public function test_skips_user_who_has_both_attendance_and_report(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        WfhAttendance::create([
            'user_id' => $user->id,
            'date' => now()->toDateString(),
            'session' => 'pagi',
            'photo_path' => 'test.jpg',
            'check_in_at' => now(),
        ]);
        WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => now()->toDateString(),
        ]);

        $this->artisan('wfh:send-reminders');

        Notification::assertNotSentTo($user, WfhReminderNotification::class);
    }

    public function test_is_idempotent_same_day(): void
    {
        Notification::fake();

        User::factory()->create(); // no attendance, no report

        $this->artisan('wfh:send-reminders');
        $this->artisan('wfh:send-reminders');

        // Only one notification sent total across both runs
        Notification::assertSentTimes(WfhReminderNotification::class, 1);
    }

    public function test_skips_on_weekend(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-25 15:30:00', 'Asia/Jakarta')); // Saturday

        Notification::fake();

        User::factory()->create(); // no attendance, no report

        $this->artisan('wfh:send-reminders');

        Notification::assertNothingSent();
    }

    public function test_skips_if_before_start_time(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-20 14:30:00', 'Asia/Jakarta')); // Monday, before 15:00

        Notification::fake();

        User::factory()->create(); // no attendance, no report

        $this->artisan('wfh:send-reminders');

        Notification::assertNothingSent();
    }

    public function test_succeeds_when_no_users_need_notify(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        WfhAttendance::create([
            'user_id' => $user->id,
            'date' => now()->toDateString(),
            'session' => 'pagi',
            'photo_path' => 'test.jpg',
            'check_in_at' => now(),
        ]);
        WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => now()->toDateString(),
        ]);

        $this->artisan('wfh:send-reminders');

        Notification::assertNothingSent();
    }

    public function test_notification_email_renders_recipient_name(): void
    {
        $user = User::factory()->create(['name' => 'Budi']);

        $notification = new WfhReminderNotification(
            currentTime: '15:30',
            currentDate: '20-07-2026',
        );

        $mail = $notification->toMail($user);

        $this->assertEquals('Pengingat WFH — Anda belum absen dan belum melaporkan kegiatan', $mail->subject);
        $this->assertStringContainsString('Budi', $mail->render());
        $this->assertStringContainsString('15:30', $mail->render());
        $this->assertStringContainsString('20-07-2026', $mail->render());
    }
}
