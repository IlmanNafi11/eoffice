<?php

namespace App\Domains\Dashboard\Http\Controllers;

use App\Domains\Dashboard\Http\Resources\DashboardResource;
use App\Domains\Dashboard\Services\DashboardService;
use App\Support\Http\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class DashboardController extends Controller
{
    public function __construct(private readonly DashboardService $service) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::ok(DashboardResource::make(
            $this->service->for($request->user()),
        )->resolve());
    }
}
