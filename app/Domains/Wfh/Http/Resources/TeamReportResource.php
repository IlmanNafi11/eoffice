<?php

namespace App\Domains\Wfh\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class TeamReportResource extends JsonResource
{
    public function toArray($request): array
    {
        $data = [
            'id' => $this->id,
            'team_id' => $this->team_id,
            'report_date' => $this->report_date?->format('Y-m-d'),
            'status' => $this->status,
            'created_by' => $this->created_by,
            'supervisor_id' => $this->supervisor_id,
            'maker_signed_at' => $this->maker_signed_at,
            'supervisor_signed_at' => $this->supervisor_signed_at,
            'reject_reason' => $this->reject_reason,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];

        if ($this->relationLoaded('team') && $this->team) {
            $data['team'] = [
                'id' => $this->team->id,
                'name' => $this->team->name,
                'field_id' => $this->team->field_id,
            ];
        }

        if ($this->relationLoaded('creator') && $this->creator) {
            $data['creator'] = $this->userSummary($this->creator);
        }

        if ($this->relationLoaded('supervisor') && $this->supervisor) {
            $data['supervisor'] = $this->userSummary($this->supervisor);
        }

        return $data;
    }

    /**
     * @return array{id: int, name: string, nip: ?string, position: ?string, rank: ?string}
     */
    private function userSummary($user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'nip' => $user->nip,
            'position' => $user->position,
            'rank' => $user->rank,
        ];
    }
}
