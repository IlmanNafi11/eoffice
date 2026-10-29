<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Models\Setting;
use App\Support\Http\ApiResponse;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

class AttendanceController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private WfhRepositoryInterface $wfhRepository,
    ) {}

    public function sessionConfig(): JsonResponse
    {
        return ApiResponse::ok([
            'sessions' => Setting::get('wfh_sessions', ['pagi', 'siang', 'sore']),
            'allowed_days' => Setting::get('wfh_allowed_days', [1, 2, 3, 4, 5]),
        ]);
    }
}
