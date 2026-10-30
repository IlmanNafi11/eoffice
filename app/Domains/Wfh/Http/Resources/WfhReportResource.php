<?php

namespace App\Domains\Wfh\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class WfhReportResource extends JsonResource
{
    public function toArray($request): array
    {
        $data = [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'report_date' => $this->report_date?->format('Y-m-d'),
            'status' => $this->status,
            // List endpoints use withCount (no activity rows loaded); detail
            // loads activities eagerly. Both must avoid lazy-loading here.
            'activity_count' => $this->whenCounted(
                'activities',
                fn () => $this->activities_count,
                fn () => $this->whenLoaded('activities', fn () => $this->activities->count(), 0),
            ),
            'maker_signed_at' => $this->maker_signed_at,
            'supervisor_signed_at' => $this->supervisor_signed_at,
            'reject_reason' => $this->reject_reason,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];

        if ($this->relationLoaded('attendances')) {
            $data['attendances'] = $this->attendances->map(fn ($att) => [
                'session' => $att->session,
                'checked_in' => ! is_null($att->check_in_at),
                'photo_url' => $att->photo_path ? asset('storage/'.$att->photo_path) : null,
            ]);
        }

        if ($this->relationLoaded('user')) {
            $data['user'] = [
                'id' => $this->user->id,
                'name' => $this->user->name,
                'nip' => $this->user->nip,
                'position' => $this->user->position,
                'rank' => $this->user->rank,
                'signature_path' => $this->user->signature_path,
            ];
        }

        if ($this->relationLoaded('supervisor') && $this->supervisor) {
            $data['supervisor'] = [
                'id' => $this->supervisor->id,
                'name' => $this->supervisor->name,
                'nip' => $this->supervisor->nip,
                'position' => $this->supervisor->position,
                'rank' => $this->supervisor->rank,
                'signature_path' => $this->supervisor->signature_path,
            ];
        }

        if ($this->relationLoaded('activities')) {
            $data['activities'] = $this->activities->map(function ($activity) {
                $act = [
                    'id' => $activity->id,
                    'start_time' => $activity->start_time,
                    'end_time' => $activity->end_time,
                    'activity' => $activity->activity,
                    'sort_order' => $activity->sort_order,
                ];

                if ($activity->relationLoaded('links')) {
                    $act['links'] = $activity->links->map(fn ($link) => [
                        'id' => $link->id,
                        'url' => $link->url,
                        'sort_order' => $link->sort_order,
                    ]);
                }

                return $act;
            });
        }

        return $data;
    }
}
