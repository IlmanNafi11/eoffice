<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Http\Requests\UpdateSettingRequest;
use App\Models\Setting;
use App\Support\Http\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

class SettingController extends Controller
{
    public function index(): JsonResponse
    {
        $settings = Setting::prime();

        return ApiResponse::ok($settings);
    }

    public function update(string $key, UpdateSettingRequest $request): JsonResponse
    {
        if (! Setting::where('key', $key)->exists()) {
            throw new ApiException("Setting '{$key}' tidak ditemukan.", 404);
        }

        $value = $request->input('value');

        Setting::set($key, $value);

        return ApiResponse::ok([
            'key' => $key,
            'value' => Setting::get($key),
        ], 'Setting berhasil diperbarui.');
    }
}
