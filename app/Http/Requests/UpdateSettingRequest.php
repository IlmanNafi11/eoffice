<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSettingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // authorized via route middleware
    }

    public function rules(): array
    {
        // `present` (bukan `required`): key wajib ada, tapi array kosong sah
        // untuk wfh_allowed_days/wfh_sessions (subset kosong = nonaktif).
        // Format tetap dijaga closure per key di bawah.
        return [
            'value' => ['present', $this->valueFormatRule()],
        ];
    }

    /**
     * Validasi format per key. Key berformat divalidasi di server (UI hanyalah
     * kenyamanan), key lain menerima nilai apa pun bentuknya.
     */
    private function valueFormatRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail): void {
            $key = (string) $this->route('key');

            match ($key) {
                'wfh_notify_start_time' => $this->guardNotifyTime($value, $fail),
                'wfh_allowed_days' => $this->guardAllowedDays($value, $fail),
                'wfh_sessions' => $this->guardSessions($value, $fail),
                default => $this->guardPassword($key, $value, $fail),
            };
        };
    }

    /** `wfh_notify_start_time` — jam 24-jam `HH:mm`. */
    private function guardNotifyTime(mixed $value, \Closure $fail): void
    {
        if (! is_string($value)) {
            $fail('Jam notifikasi WFH harus berupa teks HH:mm 24-jam.');

            return;
        }

        if (preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value) !== 1) {
            $fail('Jam notifikasi WFH harus berformat HH:mm 24-jam.');
        }
    }

    /**
     * `wfh_allowed_days` — array integer ISO 1..7 (subset bebas, boleh kosong
     * = WFH nonaktif; attendance dan reminder memperlakukan daftar kosong
     * sebagai fail-closed).
     */
    private function guardAllowedDays(mixed $value, \Closure $fail): void
    {
        if (! is_array($value) || array_is_list($value) === false) {
            $fail('Hari kerja WFH harus berupa daftar angka hari (1..7).');

            return;
        }

        foreach ($value as $day) {
            if (! is_int($day) || $day < 1 || $day > 7) {
                $fail('Hari kerja WFH harus berupa daftar angka hari (1..7).');

                return;
            }
        }
    }

    /** `wfh_sessions` — array subset {pagi, siang, sore}, boleh kosong (= sesi WFH nonaktif). */
    private function guardSessions(mixed $value, \Closure $fail): void
    {
        $allowed = ['pagi', 'siang', 'sore'];

        if (! is_array($value) || array_is_list($value) === false) {
            $fail('Sesi absensi WFH harus berupa daftar nama sesi yang valid.');

            return;
        }

        foreach ($value as $session) {
            if (! is_string($session) || ! in_array($session, $allowed, true)) {
                $fail('Sesi absensi WFH harus berupa daftar nama sesi yang valid.');

                return;
            }
        }
    }

    /**
     * password_default_* is applied verbatim to every account created or
     * imported in bulk, so a short value here becomes a mass weak credential.
     * Other settings accept any value.
     */
    private function guardPassword(string $key, mixed $value, \Closure $fail): void
    {
        if (! str_starts_with($key, 'password_default_')) {
            return;
        }

        if (! is_string($value) || mb_strlen($value) < 8) {
            $fail('Kata sandi default minimal 8 karakter.');
        }

        // Upper bound: a default is applied verbatim to bulk-created
        // accounts, so an unbounded value could be a 1MB password that
        // fails hashing or storage limits. (ship review #3)
        if (is_string($value) && mb_strlen($value) > 255) {
            $fail('Kata sandi default maksimal 255 karakter.');
        }
    }

    public function messages(): array
    {
        return [
            'value.present' => 'Nilai setting wajib diisi.',
        ];
    }
}
