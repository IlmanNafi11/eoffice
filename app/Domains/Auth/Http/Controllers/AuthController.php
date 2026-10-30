<?php

namespace App\Domains\Auth\Http\Controllers;

use App\Domains\Auth\Http\Requests\ChangePasswordRequest;
use App\Domains\Auth\Http\Requests\ForgotPasswordRequest;
use App\Domains\Auth\Http\Requests\LoginRequest;
use App\Domains\Auth\Http\Requests\ResetPasswordRequest;
use App\Domains\Auth\Http\Requests\VerifyOtpRequest;
use App\Domains\Auth\Services\PasswordResetService;
use App\Domains\Organization\Http\Resources\UserResource;
use App\Models\User;
use App\Support\Http\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::where('email', $request->email)->first();

        // Always perform a hash comparison to prevent timing-based email enumeration
        $hashToCheck = $user?->password ?? '$2y$12$'.str_repeat('a', 53);
        $passwordValid = Hash::check($request->password, $hashToCheck);

        if (! $user || ! $passwordValid) {
            return ApiResponse::fail('Email atau password salah.', 401);
        }

        if (! $user->is_active) {
            return ApiResponse::fail('Akun tidak aktif. Hubungi administrator.', 403);
        }

        $token = $user->createToken('auth-token')->plainTextToken;
        $user->load(['team.field', 'team.leader', 'roles.permissions', 'permissions']);

        return ApiResponse::ok([
            'token' => $token,
            'user' => new UserResource($user),
        ], 'Login berhasil.');
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load(['team.field', 'team.leader', 'roles.permissions', 'permissions']);

        return ApiResponse::ok(new UserResource($user));
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return ApiResponse::ok(null, 'Logout berhasil.');
    }

    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        $user = $request->user();

        $user->update([
            'password' => $request->new_password,
            'must_change_password' => false,
        ]);

        // Rotation invalidates every other session: a token stolen before the
        // change must not survive it. The caller keeps their current token.
        $currentId = $user->currentAccessToken()?->id;
        $user->tokens()->when($currentId, fn ($q) => $q->where('id', '!=', $currentId))->delete();

        return ApiResponse::ok(null, 'Password berhasil diubah.');
    }

    public function forgotPassword(ForgotPasswordRequest $request, PasswordResetService $service): JsonResponse
    {
        $service->sendOtp($request->email);

        return ApiResponse::ok(null, 'Jika email terdaftar, kode OTP telah dikirim ke email Anda.');
    }

    public function verifyOtp(VerifyOtpRequest $request, PasswordResetService $service): JsonResponse
    {
        $resetToken = $service->verifyOtp($request->email, $request->code);

        if (! $resetToken) {
            return ApiResponse::fail('Kode OTP tidak valid atau telah kedaluwarsa.');
        }

        return ApiResponse::ok([
            'reset_token' => $resetToken,
        ], 'OTP terverifikasi. Gunakan reset_token untuk mengatur password baru.');
    }

    public function resetPassword(ResetPasswordRequest $request, PasswordResetService $service): JsonResponse
    {
        $success = $service->resetPassword($request->reset_token, $request->new_password);

        if (! $success) {
            return ApiResponse::fail('Token reset tidak valid atau telah kedaluwarsa.');
        }

        return ApiResponse::ok(null, 'Password berhasil diatur. Silakan login.');
    }
}
