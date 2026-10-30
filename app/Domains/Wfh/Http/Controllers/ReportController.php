<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Http\Requests\StoreReportRequest;
use App\Domains\Wfh\Http\Resources\WfhReportResource;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Domains\Wfh\Services\WfhReportStateMachine;
use App\Support\Constants\Roles;
use App\Support\Dates\DateRangeHelper;
use App\Support\Http\ApiResponse;
use App\Support\Http\Concerns\ClampsPerPage;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Symfony\Component\HttpFoundation\Response;

class ReportController extends Controller
{
    use AuthorizesRequests;
    use ClampsPerPage;

    public function __construct(
        private WfhRepositoryInterface $wfhRepository,
        private WfhReportStateMachine $stateMachine,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date' => ['nullable', 'date'],
            'month' => ['nullable', 'date_format:Y-m'],
        ]);

        $perPage = self::perPage($request);
        $bounds = DateRangeHelper::resolve($validated['date'] ?? null, $validated['month'] ?? null);

        $reports = $this->wfhRepository->paginateReportsForUser($request->user()->id, $perPage, $bounds);

        return $this->paginatedReportResponse($reports);
    }

    public function adminIndex(Request $request): JsonResponse
    {
        $this->authorize('wfh.monitoring.view');

        $request->validate([
            'date' => ['nullable', 'date'],
            'month' => ['nullable', 'date_format:Y-m'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);

        // Eager-load the actor's team.field so the scope lookup below is not a
        // hidden per-request lazy query.
        $request->user()->loadMissing('team.field');
        $fieldId = $request->user()->team?->field?->id;

        if (! $fieldId) {
            return ApiResponse::fail('User tidak terhubung dengan bidang manapun.');
        }

        $perPage = self::perPage($request);

        // date_from/date_to take precedence; then date/month; no filter = all reports.
        $bounds = $this->resolveAdminBounds($request);

        $filters = array_filter([
            'field_id' => $fieldId,
            'status' => $request->input('status'),
            'team_id' => $request->input('team_id'),
            'date_from' => $bounds['date_from'],
            'date_to' => $bounds['date_to'],
        ], fn ($value) => $value !== null && $value !== '');

        $reports = $this->wfhRepository->paginateAllReports($perPage, $filters);

        return $this->paginatedReportResponse($reports);
    }

    /**
     * Resolve admin date bounds: date_from/date_to take precedence,
     * then date/month, then no filter (all reports).
     *
     * @return array{date_from: ?string, date_to: ?string}
     */
    private function resolveAdminBounds(Request $request): array
    {
        $dateFrom = $request->input('date_from');
        $dateTo = $request->input('date_to');

        // date_from/date_to take precedence; then date/month; no filter = all reports.
        if ($dateFrom !== null || $dateTo !== null) {
            return ['date_from' => $dateFrom, 'date_to' => $dateTo];
        }

        if ($request->hasAny(['date', 'month'])) {
            return DateRangeHelper::resolve($request->input('date'), $request->input('month'));
        }

        return ['date_from' => null, 'date_to' => null];
    }

    private function paginatedReportResponse(LengthAwarePaginator $reports): JsonResponse
    {
        return ApiResponse::paginated($reports, WfhReportResource::class);
    }

    public function store(StoreReportRequest $request): JsonResponse
    {
        $this->authorize('wfh.report.create');

        $user = $request->user();
        $date = $request->input('report_date');

        // Get-or-create: return existing draft/rejected if one exists
        $existing = $this->wfhRepository->findDraftForUserDate($user->id, $date);
        if ($existing) {
            return ApiResponse::ok(
                new WfhReportResource($existing->load(['activities.links', 'attendances'])),
                'Laporan WFH sudah ada.',
            );
        }

        // Process attendance photos
        $attendances = [];
        foreach (['pagi', 'siang', 'sore'] as $session) {
            if ($photo = $request->file("attendances.{$session}.photo")) {
                $path = $photo->store("attendances/{$user->id}/{$date}", 'public');
                $attendances[$session] = ['photo_path' => $path];
            }
        }

        try {
            $report = $this->wfhRepository->createReportWithRelations(
                reportData: [
                    'user_id' => $user->id,
                    'report_date' => $date,
                    'status' => 'draft',
                ],
                activities: $request->input('activities', []),
                attendances: $attendances,
            );
        } catch (QueryException $e) {
            // Race: unique index violation — fallback to existing
            if ($e->getCode() === '23505') {
                $existing = $this->wfhRepository->findDraftForUserDate($user->id, $date);
                if ($existing) {
                    return ApiResponse::ok(
                        new WfhReportResource($existing->load(['activities.links', 'attendances'])),
                        'Laporan WFH sudah ada.',
                    );
                }
            }
            throw $e;
        }

        return ApiResponse::created(
            new WfhReportResource($report),
            'Laporan WFH berhasil dibuat.',
        );
    }

    public function show(Request $request, WfhReport $report): JsonResponse
    {
        if ($report->user_id !== $request->user()->id) {
            $this->authorize('wfh.monitoring.view');
        }

        return ApiResponse::ok(new WfhReportResource(
            $this->wfhRepository->loadReportWithRelations($report),
        ));
    }

    public function update(StoreReportRequest $request, WfhReport $report): JsonResponse
    {
        if ($report->user_id !== $request->user()->id) {
            return ApiResponse::fail('Tidak dapat mengubah laporan orang lain.', 403);
        }

        if (! $this->stateMachine->canEdit($report)) {
            return ApiResponse::fail('Laporan yang sudah disetujui tidak dapat diubah.');
        }

        // Metadata-only: only report_date is writable. Status transitions go
        // through submit/approve/reject/revise — never via PUT.
        $this->wfhRepository->updateReportMetadata($report, [
            'report_date' => $request->input('report_date', $report->report_date->format('Y-m-d')),
        ]);

        return ApiResponse::ok(
            new WfhReportResource($this->wfhRepository->loadReportWithRelations($report->fresh())),
            'Laporan WFH berhasil diperbarui.',
        );
    }

    public function destroy(Request $request, WfhReport $report): Response
    {
        if ($report->user_id !== $request->user()->id && ! $request->user()->hasRole(Roles::ADMIN)) {
            return ApiResponse::fail('Tidak dapat menghapus laporan orang lain.', 403);
        }

        if (! $this->stateMachine->canEdit($report)) {
            return ApiResponse::fail('Laporan yang sudah disetujui tidak dapat dihapus.');
        }

        $report->delete();

        return ApiResponse::deleted();
    }
}
