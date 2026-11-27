<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One-off data scrub (ship review #22): evidence links written before the
 * write-path `starts_with:https://` rule (commit 24c00cd) may still hold
 * dangerous schemes (`javascript:`, `data:`, `file://`) that render into
 * `href` on the FE detail page and into PDF templates. The renderer never
 * fetches link URLs server-side, so blanking the value (keeping the row and
 * its position) is safe: every consumer maps over `pluck('url')->filter()`,
 * so an empty link simply does not render. (`url` is NOT NULL, hence `''`
 * rather than NULL.)
 *
 * Reversible? No — the original values were themselves the hazard; restoring
 * them would reintroduce it. `down()` is a no-op by design.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Case-sensitive (matching the validator's `starts_with:https://`):
        // `HTTPS://x` was never accepted on write, so `whereNotLike` must not
        // treat it as valid simply because LIKE defaults to case-insensitive.
        DB::table('wfh_report_links')
            ->whereNotLike('url', 'https://%', caseSensitive: true)
            ->update(['url' => '']);
    }

    public function down(): void
    {
        // Intentionally empty: see class docblock.
    }
};
