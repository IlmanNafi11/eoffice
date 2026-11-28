<?php

namespace App\Rules;

use App\Support\Pdf\PdfImage;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Http\UploadedFile;

/**
 * Reject image uploads whose declared pixel area would exceed the GD decode
 * budget before any decoder allocates a bitmap. Framework `image|mimes|max`
 * rules validate format and compressed size, not dimensions — a 200 KB PNG
 * header claiming 5000x5000 passes those rules and blows up in the resize
 * helper with a 500 instead of a validation error (ship review #26).
 */
class DecodedImageBudget implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! $value instanceof UploadedFile) {
            return;
        }

        $info = @getimagesizefromstring((string) file_get_contents($value->getRealPath()));
        if (is_array($info) && ($info[0] * $info[1]) > PdfImage::maxDecodedPixels()) {
            $fail('Gambar terlalu besar untuk diproses.');
        }
    }
}
