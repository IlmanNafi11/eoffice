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
        $failed = 0;

        WfhAttendance::query()
            ->whereNotNull('photo_path')
            ->chunkById(500, function ($attendances) use ($dryRun, &$resized, &$skipped, &$failed): void {
                foreach ($attendances->pluck('photo_path') as $path) {
                    if (! PrivateMediaPath::scoped((string) $path, 'attendances')) {
                        $this->warn("Melewati path di luar direktori attendances: {$path}");
                        $skipped++;

                        continue;
                    }

                    $source = PrivateMediaPath::resolveAny($path);
                    if ($source === '' || ! is_file($source)) {
                        $skipped++;

                        continue;
                    }

                    $bytes = file_get_contents($source);
                    if ($bytes === false) {
                        $skipped++;

                        continue;
                    }

                    $info = @getimagesizefromstring($bytes);
                    if (! is_array($info) || max($info[0], $info[1]) <= AttendancePhotoResize::maxSide()) {
                        continue;
                    }

                    if (! $dryRun) {
                        try {
                            $photo = UploadedFile::fake()->createWithContent(basename($source), $bytes);
                            AttendancePhotoResize::store($photo, dirname($path), basename($path));
                            $resized++;
                        } catch (\InvalidArgumentException $exception) {
                            $this->warn("Gagal memproses {$path}: {$exception->getMessage()}");
                            $failed++;

                            continue;
                        }
                    } else {
                        $resized++;
                    }
                }
            });

        $verb = $dryRun ? 'akan diubah' : 'diubah';
        $this->info("{$resized} berkas {$verb}; {$skipped} dilewati; {$failed} gagal.");

        if ($failed > 0) {
            $this->warn('Sebagian berkas gagal diproses; jalankan ulang setelah diperbaiki.');
        }

        return Command::SUCCESS;
    }
}
