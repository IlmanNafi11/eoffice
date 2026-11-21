<?php

namespace App\Domains\Wfh\Http\Requests;

use App\Models\Setting;
use Illuminate\Foundation\Http\FormRequest;

class AppendAttendanceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $sessions = Setting::get('wfh_sessions', ['pagi', 'siang', 'sore']);

        return [
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
            'session' => ['required', 'string', 'in:'.implode(',', $sessions)],
        ];
    }

    public function messages(): array
    {
        return [
            'photo.required' => 'Foto bukti kehadiran wajib diunggah.',
            'photo.image' => 'File harus berupa gambar.',
            'photo.mimes' => 'Format foto harus JPG, JPEG, atau PNG.',
            'photo.max' => 'Ukuran foto maksimal 2MB.',
            'session.required' => 'Sesi absensi wajib diisi.',
            'session.in' => 'Sesi absensi tidak valid.',
        ];
    }
}
