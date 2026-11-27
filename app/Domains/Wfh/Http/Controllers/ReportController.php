<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Http\Controllers\Concerns\EnsuresSameField;
use App\Domains\Wfh\Http\Requests\StoreReportRequest;
use App\Domains\Wfh\Http\Resources\WfhReportResource;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Domains\Wfh\Services\WfhReportStateMachine;
use App\Support\Constants\Roles;
use App\Support\Constants\WfhReportStatus;
use App\Support\Dates\DateRangeHelper;
use App\Support\Http\ApiResponse;
use App\Support\Http\Concerns\ClampsPerPage;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class ReportController extends Controller
{
    use AuthorizesRequests;
    use ClampsPerPage;
    use EnsuresSameField;

    public function __construct(
        private WfhRepositoryInterface $wfhRepository,
        private WfhReportStateMachine $stateMachine,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'date' => ['nullable', 'date'],
            'month' => ['nullable', 'date_format:Y-m'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);

        $perPage = self::perPage($request);
        $bounds = DateRangeHelper::fromRequest($request);

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
            // Passed raw into whereHas() below; unvalidated garbage reaches
            // Postgres as a bigint cast and 500s (22P02). Ship review SEC-01.
            'status' => ['nullable', Rule::in(WfhReportStatus::ALL)],
            'team_id' => ['nullable', 'integer', 'exists:teams,id'],
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
        $bounds = DateRangeHelper::fromRequest($request);

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

    private function paginatedReportResponse(LengthAwarePaginator $reports): JsonResponse
    {
        return ApiResponse::paginated($reports, WfhReportResource::class);
    }

    public function store(StoreReportRequest $request): JsonResponse
    {
        $this->authorize('wfh.report.create');

        $user = $request->user();
        $date = $request->input('report_date');

        // Get-or-create: return the existing draft if one exists. Rejected is
        // terminal and never returned here — a new draft is created below.
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
                // Private disk: attendance photos are evidence, never web-served.
                $path = $photo->store("attendances/{$user->id}/{$date}", 'local');
                $attendances[$session] = ['photo_path' => $path];
            }
        }

        try {
            $report = DB::transaction(function () use ($request, $user, $date, $attendances) {
                $report = $this->wfhRepository->createReportWithRelations(
                    reportData: [
                        'user_id' => $user->id,
                        'report_date' => $date,
                        'status' => 'draft',
                    ],
                    activities: $request->input('activities', []),
                    attendances: [],
                );

                // Correction flow: attendances from the rejected report for
                // this (user, date) move onto the new report. A session that
                // arrives again in this request would violate the attendance
                // unique key, so its fresh upload is dropped and the orphan
                // photo deleted (same recovery as the attendance endpoint).
                $moved = $this->wfhRepository->relinkRejectedAttendances($user->id, $date, $report->id);

                foreach ($attendances as $session => $data) {
                    if (in_array($session, $moved, true)) {
                        Storage::disk('local')->delete($data['photo_path']);

                        continue;
                    }

                    $this->wfhRepository->addAttendanceToReport($report, [
                        'session' => $session,
                        'photo_path' => $data['photo_path'],
                    ]);
                }

                return $report;
            });
        } catch (QueryException $e) {
            // Race: unique index violation — fallback to existing draft
            if ($e->getCode() === '23505') {
                $existing = $this->wfhRepository->findDraftForUserDate($user->id, $date);
                if ($existing) {
                    $this->discardAttendancePhotos($attendances);

                    return ApiResponse::ok(
                        new WfhReportResource($existing->load(['activities.links', 'attendances'])),
                        'Laporan WFH sudah ada.',
                    );
                }
            }

            // Photos are stored before the transaction; every failure path
            // (unexpected exception, unrecoverable race) leaves orphans
            // otherwise, and their unique key is already consumed.
            $this->discardAttendancePhotos($attendances);

            throw $e;
        }

        return ApiResponse::created(
            new WfhReportResource($report->load(['activities.links', 'attendances'])),
            'Laporan WFH berhasil dibuat.',
        );
    }

    public function show(Request $request, WfhReport $report): JsonResponse
    {
        $report = $this->wfhRepository->loadReportWithRelations($report);

        if ($report->user_id !== $request->user()->id) {
            $this->authorize('wfh.monitoring.view');

            // Monitoring is bidang-scoped: without this a kepala_tim in Bidang A
            // can read every report in Bidang B by walking ids — including NIP,
            // attendance photo URLs and signature URLs.
            if ($guard = $this->ensureSameField($request, $report->user->team?->field_id)) {
                return $guard;
            }
        }

        return ApiResponse::ok(new WfhReportResource($report));
    }

    public function update(StoreReportRequest $request, WfhReport $report): JsonResponse
    {
        // Same permission the route requires (SPEC-authorization-consistency):
        // the controller re-checks so a route-table edit cannot silently open
        // the action.
        $this->authorize('wfh.report.update');

        if ($report->user_id !== $request->user()->id) {
            return ApiResponse::fail('Tidak dapat mengubah laporan orang lain.', 403);
        }

        if (! $this->stateMachine->canEdit($report)) {
            return ApiResponse::fail('Hanya laporan draft yang dapat diubah.');
        }

        // Metadata-only: only report_date is writable. Status transitions go
        // through submit/approve/reject — never via PUT.
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
        $this->authorize('wfh.report.delete');

        if ($report->user_id !== $request->user()->id && ! $request->user()->hasRole(Roles::ADMIN)) {
            return ApiResponse::fail('Tidak dapat menghapus laporan orang lain.', 403);
        }

        if (! $this->stateMachine->canEdit($report)) {
            return ApiResponse::fail('Hanya laporan draft yang dapat dihapus.');
        }

        $report->delete();

        return ApiResponse::deleted();
    }

    /**
     * Delete freshly stored attendance photos after a failed create. The
     * photos were written before the DB transaction, so any failure after
     * that point must sweep them — otherwise the files outlive the request
     * while their (user, date, session) key stays free.
     *
     * @param  array<string, array{photo_path: string}>  $attendances
     */
    private function discardAttendancePhotos(array $attendances): void
    {
        foreach ($attendances as $data) {
            Storage::disk('local')->delete($data['photo_path']);
        }
    }
}
