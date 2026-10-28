<?php

namespace App\Domains\Organization\Http\Controllers;

use App\Domains\Organization\Http\Resources\TeamResource;
use App\Domains\Organization\Repositories\TeamRepositoryInterface;
use App\Support\Http\ApiResponse;
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
        $fieldId = $request->filled('field_id') ? $request->integer('field_id') : null;

        $teams = $this->teamRepository->listForField($fieldId);

        return ApiResponse::ok(TeamResource::collection($teams));
    }
}
