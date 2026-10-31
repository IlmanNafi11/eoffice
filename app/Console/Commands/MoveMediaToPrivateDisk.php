<?php

namespace App\Console\Commands;

use FilesystemIterator;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * One-shot migration for the evidence-privacy change.
 *
 * E-signatures, attendance photos and change-package evidence were all written
 * to the web-served `public` disk, so each was downloadable as a plain
 * `/storage/...` URL with no authentication. They are now read from the private
 * `local` disk. Copy them across, then prune the public copies so nothing stays
 * reachable by URL.
 *
 * Idempotent: re-running only moves files still present on the public disk.
 */
class MoveMediaToPrivateDisk extends Command
{
    /**
     * Directories that moved from the public disk to the private one.
     *
     * Kept as a single list so a future evidence type cannot be forgotten: the
     * failure mode of forgetting one is silent public exposure.
     */
    private const TREES = [
        'signatures',
        'attendances',
        'change-attachments',
    ];

    protected $signature = 'media:migrate-private {--dry-run : Report what would move without touching files}';

    protected $description = 'Move e-signatures, attendance photos and change evidence to the private disk';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $public = Storage::disk('public');
        $private = Storage::disk('local');

        $totalMoved = 0;
        $totalLeft = 0;

        foreach (self::TREES as $tree) {
            [$moved, $leftover] = $this->migrateTree($tree, $public, $private, $dryRun);

            $totalMoved += $moved;
            $totalLeft += $leftover;

            $this->purgeWebCopy($tree, $dryRun);
        }

        $this->info(($dryRun ? '[dry-run] ' : '')."{$totalMoved} berkas dipindahkan; sisa di disk publik: {$totalLeft}.");

        // A dry run reports what is still public by design; only a real run that
        // failed to clean up is an error.
        if (! $dryRun && $totalLeft > 0) {
            $this->warn('Masih ada berkas di disk publik — periksa izin tulis storage.');

            return Command::FAILURE;
        }

        return Command::SUCCESS;
    }

    /**
     * @return array{0: int, 1: int} moved, leftover
     */
    private function migrateTree(string $tree, $public, $private, bool $dryRun): array
    {
        if (! $public->exists($tree)) {
            return [0, 0];
        }

        $moved = 0;

        foreach ($public->allFiles($tree) as $file) {
            if (! $private->exists($file)) {
                $this->line(($dryRun ? '[dry-run] ' : '')."pindah {$file}");

                if (! $dryRun) {
                    $private->put($file, $public->get($file));
                }

                $moved++;
            }

            // Delete even when the private copy already existed: the public copy
            // is the exposure being removed.
            if (! $dryRun) {
                $public->delete($file);
            }
        }

        $leftover = count($public->allFiles($tree));

        if (! $dryRun && $leftover === 0) {
            $public->deleteDirectory($tree);
        }

        return [$moved, $leftover];
    }

    /**
     * Deployments where public/storage is a real directory (copied, not
     * symlinked) keep a second, web-served copy. Purge it too, otherwise every
     * file stays downloadable at /storage/<tree>/....
     *
     * Walked recursively: evidence paths are nested
     * (`attendances/{user}/{date}/x.jpg`), so a flat listing would leave every
     * real file web-served while still reporting success.
     */
    private function purgeWebCopy(string $tree, bool $dryRun): void
    {
        $webCopy = public_path('storage/'.$tree);

        if (! is_dir($webCopy) || realpath($webCopy) === realpath(storage_path('app/public/'.$tree))) {
            return;
        }

        $files = [];

        foreach ($this->walk($webCopy) as $path => $isDir) {
            if (! $isDir) {
                $files[] = $path;
            }
        }

        $this->line(($dryRun ? '[dry-run] ' : '').count($files)." berkas di public/storage/{$tree} dihapus.");

        if ($dryRun) {
            return;
        }

        array_map('unlink', $files);

        // Depth-first, deepest first: a directory can only be removed once empty.
        foreach ($this->walk($webCopy) as $path => $isDir) {
            if ($isDir) {
                @rmdir($path);
            }
        }

        @rmdir($webCopy);
    }

    /**
     * Every entry under $root, deepest first, as path => isDirectory.
     * Dot files are included: a stray dotfile must not stay web-served.
     *
     * @return \Generator<string, bool>
     */
    private function walk(string $root): \Generator
    {
        if (! is_dir($root)) {
            return;
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($iterator as $entry) {
            yield $entry->getPathname() => $entry->isDir();
        }
    }
}
