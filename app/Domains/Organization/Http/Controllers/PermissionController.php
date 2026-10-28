<?php

namespace App\Domains\Organization\Http\Controllers;

use App\Domains\Organization\Http\Resources\PermissionResource;
use App\Support\Http\ApiResponse;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Spatie\Permission\Models\Permission;

class PermissionController extends Controller
{
    use AuthorizesRequests;

    public function index(): JsonResponse
    {
        $this->authorize('permission.manage');

        $permissions = Permission::orderBy('name')->get();

        return ApiResponse::ok(PermissionResource::collection($permissions));
    }
}
