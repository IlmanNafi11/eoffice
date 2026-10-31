<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Http\Requests\StoreActivityRequest;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhReportActivity;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Domains\Wfh\Services\WfhReportStateMachine;
use App\Support\Http\ApiResponse;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Symfony\Component\HttpFoundation\Response;

class ReportActivityController extends Controller
{
    use AuthorizesRequests;
    use AuthorizesWfhEdit;

    public function __construct(
        private WfhRepositoryInterface $wfhRepository,
        private WfhReportStateMachine $stateMachine,
    ) {}

    public function store(WfhReport $report, StoreActivityRequest $request): JsonResponse
    {
        // Same permission the route requires; authorizeEdit() then narrows to
        // ownership + editability (SPEC-authorization-consistency).
        $this->authorize('wfh.report.create');

        if ($block = $this->authorizeEdit($report, $request)) {
            return $block;
        }

        $activity = $this->wfhRepository->addActivityToReport($report, $request->validated());

        return ApiResponse::created(
            $this->formatActivity($activity),
            'Kegiatan berhasil ditambahkan.',
        );
    }

    public function update(WfhReport $report, WfhReportActivity $activity, StoreActivityRequest $request): JsonResponse
    {
        $this->authorize('wfh.report.update');

        if ($activity->wfh_report_id !== $report->id) {
            return $this->notFound('Kegiatan tidak ditemukan.');
        }

        if ($block = $this->authorizeEdit($report, $request)) {
            return $block;
        }

        $activity = $this->wfhRepository->updateActivity($activity, $request->validated());

        return ApiResponse::ok(
            $this->formatActivity($activity),
            'Kegiatan berhasil diperbarui.',
        );
    }

    public function destroy(WfhReport $report, WfhReportActivity $activity, Request $request): Response
    {
        $this->authorize('wfh.report.activity.delete');

        if ($activity->wfh_report_id !== $report->id) {
            return $this->notFound('Kegiatan tidak ditemukan.');
        }

        if ($block = $this->authorizeEdit($report, $request)) {
            return $block;
        }

        $this->wfhRepository->deleteActivity($activity->id);

        return ApiResponse::deleted();
    }

    public function reorder(WfhReport $report, Request $request): JsonResponse
    {
        $this->authorize('wfh.report.update');

        if ($block = $this->authorizeEdit($report, $request)) {
            return $block;
        }

        $validated = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['integer', 'distinct'],
        ]);

        $this->wfhRepository->reorderActivities($report, $validated['ids']);

        return ApiResponse::ok(null, 'Urutan kegiatan berhasil diubah.');
    }

    private function formatActivity(WfhReportActivity $activity): array
    {
        $links = $activity->relationLoaded('links')
            ? $activity->links->map(fn ($link) => [
                'id' => $link->id,
                'url' => $link->url,
            ])->toArray()
            : [];

        return [
            'id' => $activity->id,
            'activity' => $activity->activity,
            'start_time' => $activity->start_time?->format('H:i'),
            'end_time' => $activity->end_time?->format('H:i'),
            'sort_order' => $activity->sort_order,
            'links' => $links,
        ];
    }
}
