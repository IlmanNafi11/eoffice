<?php

namespace App\Domains\ChangeManagement\Http\Controllers;

use App\Domains\ChangeManagement\Http\Resources\ChangeTypeResource;
use App\Domains\ChangeManagement\Models\ChangeType;
use App\Support\Http\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

class ChangeTypeController extends Controller
{
    public function index(): JsonResponse
    {
        return ApiResponse::ok(ChangeTypeResource::collection(ChangeType::all()));
    }
}
