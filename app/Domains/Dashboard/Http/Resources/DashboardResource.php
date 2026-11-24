<?php

namespace App\Domains\Dashboard\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Pass-through resource: `generated_at` plus whichever sections the service
 * decided this requester may see. Absent keys mean "section not for you" —
 * never an empty array (design decision D1).
 *
 * @property array<string, mixed> $resource
 */
class DashboardResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray($request): array
    {
        return $this->resource;
    }
}
