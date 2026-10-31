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
        return [
            'value' => ['required', $this->passwordRule()],
        ];
    }

    /**
     * password_default_* is applied verbatim to every account created or
     * imported in bulk, so a short value here becomes a mass weak credential.
     * Other settings accept any value.
     */
    private function passwordRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail): void {
            $key = (string) $this->route('key');

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
        };
    }

    public function messages(): array
    {
        return [
            'value.required' => 'Nilai setting wajib diisi.',
        ];
    }
}
