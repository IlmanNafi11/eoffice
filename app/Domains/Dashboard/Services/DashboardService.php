<?php

namespace App\Domains\Dashboard\Services;

use App\Domains\Dashboard\Services\SectionBuilders\AttentionSection;
use App\Domains\Dashboard\Services\SectionBuilders\QueueSection;
use App\Domains\Dashboard\Services\SectionBuilders\SectionBuilder;
use App\Domains\Dashboard\Services\SectionBuilders\TodaySection;
use App\Domains\Dashboard\Services\SectionBuilders\TrendSection;
use App\Models\User;

/**
 * Orchestrates the dashboard sections. Each builder decides via `$user->can()`
 * whether its section belongs to this requester; a builder returning null
 * means the key is omitted entirely — never sent as an empty array (design
 * decision D1).
 */
class DashboardService
{
    /** @var list<SectionBuilder> */
    private array $builders;

    public function __construct()
    {
        $this->builders = [
            new TodaySection,
            new QueueSection,
            new TrendSection,
            new AttentionSection,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function for(User $user): array
    {
        $data = ['generated_at' => now()->toISOString()];

        foreach ($this->builders as $builder) {
            $section = $builder->build($user);

            if ($section !== null) {
                $data[$builder->key()] = $section;
            }
        }

        return $data;
    }
}
