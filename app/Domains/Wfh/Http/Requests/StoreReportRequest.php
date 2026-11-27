<?php

namespace App\Domains\Wfh\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Bounded get-or-create: attendance photos are written to
            // attendances/{user}/{date} before the unique-key check, so an
            // unbounded date let an authenticated caller scatter arbitrary
            // directories on disk (ship review #12). The SPA only ever
            // offers today (Buat Laporan dialog), but the server is the
            // authority.
            'report_date' => ['required', 'date', 'before_or_equal:today', 'after_or_equal:2020-01-01'],
            'activities' => ['sometimes', 'array'],
            'activities.*.start_time' => ['required_with:activities.*.end_time', 'date_format:H:i'],
            'activities.*.end_time' => ['required_with:activities.*.start_time', 'date_format:H:i', 'after:activities.*.start_time'],
            'activities.*.activity' => ['required', 'string'],
            // `url` saja menerima skema berbahaya yang lolos FILTER_VALIDATE_URL
            // (mis. `data:`, `file://`, `about://`); halaman detail laporan tim
            // me-render tautan ke `href`, jadi skema dibatasi https di
            // boundary, selaras dengan StoreActivityRequest.
            'activities.*.links.*' => ['url', 'starts_with:https://'],
            'attendances' => ['sometimes', 'array:pagi,siang,sore'],
            'attendances.*.photo' => ['sometimes', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
        ];
    }
}
