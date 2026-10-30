<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * One-shot migration for the signature privacy change: existing e-signatures
 * were written to the web-served `public` disk and are now read from the
 * private `local` disk. Copy them across, then prune the public copies so no
 * signature stays downloadable by URL.
 *
 * Idempotent: re-running only moves files that are still on the public disk.
 */
class MoveSignaturesToPrivateDisk extends Command
{
    protected $signature = 'signatures:migrate-private {--dry-run : Report what would move without touching files}';

    protected $description = 'Move e-signature files from the public disk to the private disk (H4 cutover)';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $public = Storage::disk('public');
        $private = Storage::disk('local');

        $moved = 0;
        $leftover = 0;

        if ($public->exists('signatures')) {
            foreach ($public->files('signatures') as $file) {
                if (! $private->exists($file)) {
                    $this->line(($dryRun ? '[dry-run] ' : '')."pindah {$file}");

                    if (! $dryRun) {
                        $private->put($file, $public->get($file));
                    }

                    $moved++;
                }

                if (! $dryRun) {
                    $public->delete($file);
                }
            }

            $leftover = count($public->files('signatures'));

            if (! $dryRun && $leftover === 0) {
                $public->deleteDirectory('signatures');
            }
        }

        // Deployments where public/storage is a real directory (copied, not
        // symlinked) keep a second, web-served copy. Purge it too, otherwise
        // every signature stays downloadable at /storage/signatures/*.png.
        $webCopy = public_path('storage/signatures');
        if (is_dir($webCopy) && realpath($webCopy) !== realpath(storage_path('app/public/signatures'))) {
            $webFiles = glob($webCopy.'/*.png') ?: [];
            $this->line(($dryRun ? '[dry-run] ' : '').count($webFiles).' berkas di public/storage/signatures dihapus.');

            if (! $dryRun) {
                array_map('unlink', $webFiles);
                @rmdir($webCopy);
            }
        }

        $this->info(($dryRun ? '[dry-run] ' : '')."{$moved} tanda tangan dipindahkan; sisa di disk publik: {$leftover}.");

        return Command::SUCCESS;
    }
}
