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
            'url' => asset('storage/'.$this->path),
            'sort_order' => $this->sort_order,
        ];
    }
}
