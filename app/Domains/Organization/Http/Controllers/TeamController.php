<?php

namespace App\Domains\Organization\Http\Controllers;

use App\Domains\Organization\Http\Resources\TeamResource;
use App\Domains\Organization\Repositories\TeamRepositoryInterface;
use App\Support\Constants\Roles;
use App\Support\Http\ApiResponse;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class TeamController extends Controller
{
    public function __construct(
        private TeamRepositoryInterface $teamRepository,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // Admin and RBAC managers see every field's teams; the `field_id`
        // param is honored only for them.
        if ($user->hasRole(Roles::ADMIN) || $user->can('user.manage')) {
            $fieldId = $request->filled('field_id') ? $request->integer('field_id') : null;

            return ApiResponse::ok(
                TeamResource::collection($this->teamRepository->listForField($fieldId)),
            );
        }

        // Everyone else (staf, kepala_tim, kepala_bidang) is scoped to their
        // own bidang; any `field_id` param is ignored.
        $fieldId = $user->team?->field_id;

        if ($fieldId === null) {
            return ApiResponse::ok(TeamResource::collection(new Collection));
        }

        return ApiResponse::ok(
            TeamResource::collection($this->teamRepository->listForField($fieldId)),
        );
    }
}
