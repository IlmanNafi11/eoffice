<?php

namespace App\Domains\ChangeManagement\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class AttachmentResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'path' => $this->path,
            /*
             * Evidence files are private: they stream through the authorized
             * download endpoint (same package-visibility check as the read
             * APIs), never as static /storage URLs (ship review S2).
             */
            'url' => route('attachments.download', [
                'id' => $this->implementation->change_initiation_id,
                'attachment' => $this->id,
            ]),
            'sort_order' => $this->sort_order,
        ];
    }
}
