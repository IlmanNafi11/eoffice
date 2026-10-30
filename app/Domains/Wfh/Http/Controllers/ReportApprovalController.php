<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Http\Controllers\Concerns\EnsuresSameField;
use App\Domains\Wfh\Http\Resources\WfhReportResource;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Services\WfhReportStateMachine;
use App\Support\Http\ApiResponse;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ReportApprovalController extends Controller
{
    use AuthorizesRequests;
    use EnsuresSameField;

    public function __construct(
        private WfhReportStateMachine $stateMachine,
    ) {}

    public function submit(Request $request, WfhReport $report): JsonResponse
    {
        $this->authorize('wfh.report.submit');

        if ($report->user_id !== $request->user()->id) {
            return ApiResponse::fail('Hanya pembuat laporan yang dapat mensubmit.', 403);
        }

        try {
            $report = $this->stateMachine->submit($report, $request->user());
        } catch (\DomainException $e) {
            return ApiResponse::fail($e->getMessage());
        }

        return ApiResponse::ok(
            new WfhReportResource($report->load(['activities.links', 'supervisor'])),
            'Laporan berhasil disubmit untuk persetujuan.',
        );
    }

    public function approve(Request $request, WfhReport $report): JsonResponse
    {
        $this->authorize('wfh.report.approve');

        $report->loadMissing('user.team');
        $guard = $this->ensureSameField($request, $report->user->team?->field_id);
        if ($guard) {
            return $guard;
        }

        try {
            $report = $this->stateMachine->approve($report, $request->user());
        } catch (\DomainException $e) {
            return ApiResponse::fail($e->getMessage());
        }

        return ApiResponse::ok(
            new WfhReportResource($report->load(['activities.links', 'supervisor'])),
            'Laporan berhasil disetujui.',
        );
    }

    public function reject(Request $request, WfhReport $report): JsonResponse
    {
        $this->authorize('wfh.report.reject');

        $request->validate([
            'reason' => ['required', 'string'],
        ]);

        $report->loadMissing('user.team');
        $guard = $this->ensureSameField($request, $report->user->team?->field_id);
        if ($guard) {
            return $guard;
        }

        try {
            $report = $this->stateMachine->reject($report, $request->user(), $request->input('reason'));
        } catch (\DomainException $e) {
            return ApiResponse::fail($e->getMessage());
        }

        return ApiResponse::ok(
            new WfhReportResource($report->load(['activities.links', 'supervisor'])),
            'Laporan ditolak.',
        );
    }

    public function revise(Request $request, WfhReport $report): JsonResponse
    {
        $this->authorize('wfh.report.update');

        if ($report->user_id !== $request->user()->id) {
            return ApiResponse::fail('Hanya pembuat laporan yang dapat merevisi.', 403);
        }

        try {
            $report = $this->stateMachine->revise($report);
        } catch (\DomainException $e) {
            return ApiResponse::fail($e->getMessage());
        }

        return ApiResponse::ok(
            new WfhReportResource($report),
            'Laporan dikembalikan ke draft untuk revisi.',
        );
    }
}
