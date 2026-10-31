<?php

namespace App\Domains\ChangeManagement\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class ImplementationResource extends JsonResource
{
    public function toArray($request): array
    {
        $data = [
            'id' => $this->id,
            'change_initiation_id' => $this->change_initiation_id,
            'priority' => $this->priority,
            'impact' => $this->impact,
            'production_impact' => $this->production_impact,
            'required_effort' => $this->required_effort,
            'cost_needed' => $this->cost_needed,
            'cost_amount' => $this->cost_amount,
            'resources' => $this->resources,
            'test_plan' => $this->test_plan,
            'evaluator_id' => $this->evaluator_id,
            'evaluator_signed_at' => $this->evaluator_signed_at,
            'review_status' => $this->review_status,
            'review_response' => $this->review_response,
            'execution_date' => $this->execution_date?->format('Y-m-d'),
            'reviewer_id' => $this->reviewer_id,
            'reviewer_signed_at' => $this->reviewer_signed_at,
            'implementation_result' => $this->implementation_result,
            'release_date' => $this->release_date?->format('Y-m-d'),
            'responsible_id' => $this->responsible_id,
            'responsible_signed_at' => $this->responsible_signed_at,
            'status' => $this->status,
        ];

        if ($this->relationLoaded('changeTypes')) {
            $data['change_types'] = $this->changeTypes->map(fn ($t) => ['id' => $t->id, 'name' => $t->name]);
        }

        if ($this->relationLoaded('attachments')) {
            /*
             * Same contract as AttachmentResource (ship review S2): evidence is
             * streamed through the authorized download endpoint, never as a
             * static /storage URL. The two resources must not disagree, or a
             * client picking the other field would publish an unauthenticated
             * link. Internal storage-relative paths are never exposed
             * (ship review #3).
             */
            $data['attachments'] = $this->attachments->map(fn ($a) => [
                'id' => $a->id,
                'url' => route('attachments.download', [
                    'id' => $this->change_initiation_id,
                    'attachment' => $a->id,
                ]),
                'sort_order' => $a->sort_order,
            ]);
        }

        return $data;
    }
}
