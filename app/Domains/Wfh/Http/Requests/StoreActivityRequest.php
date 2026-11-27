<?php

namespace App\Domains\Wfh\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreActivityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'activity' => ['required', 'string'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'end_time' => ['nullable', 'date_format:H:i', 'after:start_time'],
            'id' => ['nullable', 'integer'],
            'links' => ['nullable', 'array'],
            'links.*.id' => ['nullable', 'integer'],
            // `url` accepts any scheme FILTER_VALIDATE_URL allows (e.g.
            // `javascript:`); the detail page renders links into `href`, so
            // restrict to https at the boundary (ship review security).
            'links.*.url' => ['required_with:links', 'url', 'starts_with:https://'],
        ];
    }

    public function messages(): array
    {
        return [
            'activity.required' => 'Kegiatan wajib diisi.',
            'end_time.after' => 'Waktu selesai harus setelah waktu mulai.',
            'links.*.url.url' => 'Format tautan tidak valid.',
            'links.*.url.starts_with' => 'Tautan harus diawali https://.',
            'links.*.url.required_with' => 'Tautan wajib diisi.',
        ];
    }
}
