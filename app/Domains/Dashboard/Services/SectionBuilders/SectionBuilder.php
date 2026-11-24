<?php

namespace App\Domains\Dashboard\Services\SectionBuilders;

use App\Models\User;

interface SectionBuilder
{
    /** Section key inside the dashboard `data` payload. */
    public function key(): string;

    /** Null = this section is not for the requester (key omitted). */
    public function build(User $user): ?array;
}
