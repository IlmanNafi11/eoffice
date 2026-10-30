<?php

namespace App\Domains\ChangeManagement\Services;

use App\Domains\ChangeManagement\Models\ChangeInitiation;
use Illuminate\Support\Facades\DB;

class DocNumberGenerator
{
    public function generate(): string
    {
        $year = now()->year;
        // ?: rather than ?? : an empty CHANGE_DOC_PREFIX would otherwise produce
        // a malformed number like "001//2026" instead of falling back.
        $prefix = (string) (config('change-mgmt.doc_prefix') ?: '9/1.1/114');

        return DB::transaction(function () use ($year, $prefix) {
            $lastDoc = ChangeInitiation::whereYear('created_at', $year)
                ->withTrashed()
                ->orderByDesc('doc_number')
                ->lockForUpdate()
                ->first();

            $sequence = 1;
            if ($lastDoc) {
                preg_match('/^(\d{3})\//', $lastDoc->doc_number, $matches);
                $sequence = (isset($matches[1]) ? (int) $matches[1] : 0) + 1;
            }

            $sequence = str_pad($sequence, 3, '0', STR_PAD_LEFT);

            return "{$sequence}/{$prefix}/{$year}";
        });
    }
}
