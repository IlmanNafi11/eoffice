<?php

namespace Tests\Feature\Console;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ResizeAttendancePhotosTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_resizes_an_existing_local_photo_in_place(): void
    {
        $path = $this->createPhoto($this->largeJpegBytes());

        $this->artisan('media:resize-attendance')->assertSuccessful();

        [$width, $height] = getimagesize(Storage::disk('local')->path($path));
        $this->assertLessThanOrEqual(600, max($width, $height));
        $mime = getimagesizefromstring(Storage::disk('local')->get($path))['mime'] ?? '';
        $this->assertSame('image/jpeg', $mime);
    }

    public function test_it_skips_rows_with_no_bytes_on_either_disk(): void
    {
        $this->createAttendance('attendances/1/2026-11-28/missing.jpg');

        $this->artisan('media:resize-attendance')
            ->expectsOutputToContain('1 dilewati')
            ->assertSuccessful();
    }

    public function test_dry_run_reports_without_writing(): void
    {
        $bytes = $this->largeJpegBytes();
        $path = $this->createPhoto($bytes);

        $this->artisan('media:resize-attendance', ['--dry-run' => true])
            ->expectsOutputToContain('1 berkas diubah')
            ->assertSuccessful();

        $this->assertSame($bytes, Storage::disk('local')->get($path));
    }

    public function test_it_is_idempotent(): void
    {
        $path = $this->createPhoto($this->largeJpegBytes());

        $this->artisan('media:resize-attendance')->assertSuccessful();
        $afterFirstRun = Storage::disk('local')->get($path);

        $this->artisan('media:resize-attendance')
            ->expectsOutputToContain('0 berkas diubah')
            ->assertSuccessful();

        $this->assertSame($afterFirstRun, Storage::disk('local')->get($path));
    }

    public function test_it_writes_only_to_the_local_disk_when_the_source_is_public(): void
    {
        $bytes = $this->largeJpegBytes();
        $path = 'attendances/1/2026-11-28/legacy.jpg';
        $this->createAttendance($path);
        Storage::disk('public')->put($path, $bytes);

        $this->artisan('media:resize-attendance')->assertSuccessful();

        Storage::disk('public')->assertExists($path);
        $this->assertSame($bytes, Storage::disk('public')->get($path));
        [$width, $height] = getimagesize(Storage::disk('local')->path($path));
        $this->assertLessThanOrEqual(600, max($width, $height));
    }

    private function createPhoto(string $bytes): string
    {
        $path = 'attendances/1/2026-11-28/'.uniqid().'.jpg';
        $this->createAttendance($path);
        Storage::disk('local')->put($path, $bytes);

        return $path;
    }

    private function createAttendance(string $path): WfhAttendance
    {
        $user = User::factory()->create();
        $report = WfhReport::factory()->create(['user_id' => $user->id]);

        return WfhAttendance::create([
            'user_id' => $user->id,
            'report_id' => $report->id,
            'date' => '2026-11-28',
            'session' => 'pagi',
            'check_in_at' => now(),
            'photo_path' => $path,
        ]);
    }

    private function largeJpegBytes(): string
    {
        $image = imagecreatetruecolor(2400, 1800);
        imagefill($image, 0, 0, imagecolorallocate($image, 200, 100, 50));
        ob_start();
        imagejpeg($image, null, 88);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);

        return $bytes;
    }
}
