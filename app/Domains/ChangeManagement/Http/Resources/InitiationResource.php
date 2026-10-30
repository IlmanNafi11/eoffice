<?php

namespace App\Domains\ChangeManagement\Http\Resources;

use App\Support\Signature\SignaturePath;
use Illuminate\Http\Resources\Json\JsonResource;

class InitiationResource extends JsonResource
{
    public function toArray($request): array
    {
        $data = [
            'id' => $this->id,
            'field_id' => $this->field_id,
            'initiator_id' => $this->initiator_id,
            'reviewer_id' => $this->reviewer_id,
            'doc_number' => $this->doc_number,
            'initiation_date' => $this->initiation_date?->format('Y-m-d'),
            'needed_by_date' => $this->needed_by_date?->format('Y-m-d'),
            'description' => $this->description,
            'reason' => $this->reason,
            'status' => $this->status,
            'review_status' => $this->review_status,
            'reviewed_at' => $this->reviewed_at,
            'initiator_signed_at' => $this->initiator_signed_at,
            'created_at' => $this->created_at,
        ];

        if ($this->relationLoaded('field') && $this->field) {
            $data['field'] = ['id' => $this->field->id, 'name' => $this->field->name];
        }

        if ($this->relationLoaded('initiator')) {
            $data['initiator'] = [
                'id' => $this->initiator->id,
                'name' => $this->initiator->name,
                'nip' => $this->initiator->nip,
                'position' => $this->initiator->position,
                'rank' => $this->initiator->rank,
                'signature_url' => SignaturePath::urlFor($this->initiator->id, $this->initiator->signature_path),
            ];
        }

        return $data;
    }
}
