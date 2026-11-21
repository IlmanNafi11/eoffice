<?php

namespace App\Domains\ChangeManagement\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadChangePackageAttachmentsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'files' => ['required', 'array', 'max:10'],
            'files.*' => ['required', 'file', 'mimes:jpg,jpeg,png', 'max:10240'],
        ];
    }

    public function messages(): array
    {
        return [
            'files.max' => 'Maksimal 10 lampiran.',
            'files.*.mimes' => 'Format file harus JPG, JPEG, atau PNG.',
            'files.*.max' => 'Ukuran file maksimal 10MB.',
            'files.*.file' => 'File tidak valid.',
        ];
    }
}
