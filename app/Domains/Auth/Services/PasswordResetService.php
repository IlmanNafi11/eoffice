<?php

namespace App\Domains\Auth\Services;

use App\Domains\Auth\Models\PasswordResetOtp;
use App\Models\User;
use App\Notifications\ResetPasswordOtpNotification;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

class PasswordResetService
{
    public function sendOtp(string $email): void
    {
        $user = User::where('email', $email)->where('is_active', true)->first();

        if (! $user) {
            return;
        }

        $existing = PasswordResetOtp::find($email);

        if ($existing && $existing->last_sent_at && $existing->last_sent_at->diffInSeconds(now()) < 60) {
            return;
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        PasswordResetOtp::updateOrCreate(
            ['email' => $email],
            [
                'code_hash' => Hash::make($code),
                'expires_at' => now()->addMinutes(15),
                'used_at' => null,
                'attempts' => 0,
                'last_sent_at' => now(),
            ],
        );

        Notification::send($user, new ResetPasswordOtpNotification($code, $user->name));
    }

    public function verifyOtp(string $email, string $code): string|false
    {
        $otp = PasswordResetOtp::find($email);

        if (! $otp) {
            return false;
        }

        if ($otp->used_at || $otp->expires_at < now()) {
            return false;
        }

        if ($otp->attempts >= 5) {
            return false;
        }

        if (! Hash::check($code, $otp->code_hash)) {
            $otp->increment('attempts');

            if ($otp->fresh()->attempts >= 5) {
                $otp->update(['used_at' => now()]);
            }

            return false;
        }

        $otp->update(['used_at' => now()]);

        $resetToken = Str::random(60);
        Cache::put("pwreset:{$resetToken}", ['email' => $email], 300);

        return $resetToken;
    }

    public function resetPassword(string $resetToken, string $newPassword): bool
    {
        $cached = Cache::get("pwreset:{$resetToken}");

        if (! $cached) {
            return false;
        }

        Cache::forget("pwreset:{$resetToken}");

        $user = User::where('email', $cached['email'])->where('is_active', true)->first();

        if (! $user) {
            return false;
        }

        $user->update([
            'password' => $newPassword,
            'must_change_password' => false,
        ]);

        // A reset is the recovery path for a compromised account: every
        // outstanding token dies with the old password.
        $user->tokens()->delete();

        return true;
    }
}
