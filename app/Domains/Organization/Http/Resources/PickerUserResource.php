<?php

namespace App\Domains\Organization\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Lean projection for dropdown pickers (GET /api/users). Deliberately omits
 * email, roles, effective permissions, must_change_password and signature URL:
 * the picker only needs id/name/nip/team, and those fields were previously
 * gated behind permission:user.manage (admin user list). Least privilege wins
 * over resource reuse — see ship review #10 SEC-01.
 */
class PickerUserResource extends JsonResource
{
    public function toArray($request): array
    {
        $team = null;

        if ($this->relationLoaded('team') && $this->team) {
            $team = [
                'id' => $this->team->id,
                'name' => $this->team->name,
            ];

            if ($this->team->relationLoaded('leader') && $this->team->leader) {
                $team['leader'] = [
                    'id' => $this->team->leader->id,
                    'name' => $this->team->leader->name,
                ];
            }

            if ($this->team->relationLoaded('field') && $this->team->field) {
                $team['field'] = [
                    'id' => $this->team->field->id,
                    'name' => $this->team->field->name,
                ];
            }
        }

        return [
            'id' => $this->id,
            'name' => $this->name,
            'nip' => $this->nip,
            'team' => $team,
        ];
    }
}
