<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Models\Field;
use App\Models\Team;
use App\Support\Constants\Roles;
use App\Support\Http\ApiResponse;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class WfhMonitoringController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private WfhRepositoryInterface $wfhRepository,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('wfh.monitoring.view');

        $user = $request->user();
        $date = $request->input('date', now()->toDateString());
        $teamId = $request->input('team_id') ? (int) $request->input('team_id') : null;
        $fieldId = null;

        // Admin sees all (no filters)
        if ($user->hasRole(Roles::ADMIN)) {
            $teamId = null;
            $fieldId = null;
        } else {
            // Resolve actor's field: either field head, or via own team
            $actorFieldId = Field::where('head_id', $user->id)->value('id')
                ?? $user->team?->field_id;

            if ($teamId !== null) {
                // Validate team belongs to actor's field (prevent cross-field leak)
                $team = Team::find($teamId);
                if (! $team || ! $actorFieldId || $team->field_id !== $actorFieldId) {
                    return ApiResponse::fail('Tim tidak berada dalam bidang Anda.', 403);
                }
            } elseif ($actorFieldId && Field::where('id', $actorFieldId)->where('head_id', $user->id)->exists()) {
                // Field head without explicit team_id → entire field
                $fieldId = $actorFieldId;
            } else {
                // Non-head without explicit team_id → own team / led team (status quo)
                $teamId = $user->ledTeams()->pluck('id')->first() ?? $user->team_id;
            }
        }

        $notCheckedIn = $this->wfhRepository->getUsersWithoutAttendance($date, $teamId, $fieldId);
        $noReport = $this->wfhRepository->getUsersWithoutReport($date, $teamId, $fieldId);

        return ApiResponse::ok([
            'date' => $date,
            'team_id' => $teamId,
            'field_id' => $fieldId,
            'not_checked_in' => $notCheckedIn,
            'no_report' => $noReport,
        ]);
    }
}
