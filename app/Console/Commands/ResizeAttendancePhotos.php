<?php

namespace App\Console\Commands;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Support\Media\AttendancePhotoResize;
use App\Support\Media\PrivateMediaPath;
use Illuminate\Console\Command;
use Illuminate\Http\UploadedFile;

class ResizeAttendancePhotos extends Command
{
    protected $signature = 'media:resize-attendance {--dry-run : Report what would resize without touching files}';

    protected $description = 'Resize legacy attendance photos in place on the private disk';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $resized = 0;
        $skipped = 0;

        foreach (WfhAttendance::query()->whereNotNull('photo_path')->pluck('photo_path') as $path) {
            $source = PrivateMediaPath::resolveAny($path);

            if ($source === '' || ! is_file($source)) {
                $skipped++;

                continue;
            }

            $bytes = (string) file_get_contents($source);
            $info = @getimagesizefromstring($bytes);
            $oversized = is_array($info) && max($info[0], $info[1]) > AttendancePhotoResize::maxSide();

            if (! $oversized) {
                continue;
            }

            if (! $dryRun) {
                $photo = UploadedFile::fake()->createWithContent(basename($source), $bytes);
                AttendancePhotoResize::store($photo, dirname($path), basename($path));
            }

            $resized++;
        }

        $this->info(($dryRun ? '[dry-run] ' : '')."{$resized} berkas diubah; {$skipped} dilewati.");

        return Command::SUCCESS;
    }
}
