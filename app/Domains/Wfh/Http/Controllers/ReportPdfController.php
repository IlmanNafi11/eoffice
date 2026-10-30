<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Http\Controllers\Concerns\EnsuresSameField;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Domains\Wfh\Services\WfhReportPdfData;
use App\Models\Team;
use App\Support\Http\ApiResponse;
use App\Support\Pdf\PdfRendererService;
use App\Support\Signature\SignatureGuard;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;

class ReportPdfController extends Controller
{
    use AuthorizesRequests;
    use EnsuresSameField;

    public function __construct(
        private WfhRepositoryInterface $wfhRepository,
        private PdfRendererService $pdfRenderer,
        private WfhReportPdfData $pdfData,
    ) {}

    public function export(Request $request, WfhReport $report): Response|JsonResponse
    {
        // Explicit permission plus the ownership/shared-field check below: a
        // staf without wfh.report.export_pdf must not export even their own.
        $this->authorize('wfh.report.export_pdf');

        $report = $this->wfhRepository->loadReportWithRelations($report);

        // Same visibility rule as ReportController::show: the maker sees their
        // own report; anyone else needs the monitoring permission AND a shared
        // bidang. Without this a staf could walk /wfh/reports/{id}/pdf and
        // harvest every colleague's PDF (name, NIP, activities, photos, sigs).
        if ($report->user_id !== $request->user()->id) {
            $this->authorize('wfh.monitoring.view');

            if ($guard = $this->ensureSameField($request, $report->user->team?->field_id)) {
                return $guard;
            }
        }

        if (! in_array($report->status, ['pending', 'approved'])) {
            return ApiResponse::fail('PDF hanya dapat di-generate untuk laporan yang sudah disubmit atau disetujui.');
        }

        // PDF embeds real signatures; refuse export when any involved user
        // has not configured theirs yet.
        if ($missing = SignatureGuard::missing([
            $report->user,
            $report->status === 'approved' ? $report->supervisor : null,
        ])) {
            return ApiResponse::fail(SignatureGuard::missingMessage($missing->name)['message'], 422);
        }

        $pdf = $this->pdfRenderer->render('pdf.wfh-report', $this->pdfData->forReport($report));

        $filename = "WFH-{$report->id}-{$report->report_date->format('Y-m-d')}.pdf";

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    public function exportTeam(Request $request, Team $team): Response|JsonResponse
    {
        $this->authorize('wfh.report.export_pdf');

        $admin = $request->user();
        // Eager-load once: the guard and the PDF builder both read this chain.
        $admin->loadMissing('team.field');
        $fieldId = $admin->team?->field?->id;

        // Verify team belongs to admin's field
        if (! $fieldId || $team->field_id !== $fieldId) {
            return ApiResponse::fail('Tim tidak ditemukan dalam bidang Anda.', 403);
        }

        // Untrusted input: a garbage date used to reach Carbon::parse and 500.
        $validated = $request->validate([
            'date' => ['nullable', 'date'],
            'team_report_id' => ['nullable', 'integer'],
        ]);

        $date = $validated['date'] ?? now()->format('Y-m-d');

        $team->load(['field.head']);
        $head = $team->field?->head;

        // Check team report status if team_report_id provided. Scoped to this
        // team: passing another team's approved report id must not stamp THIS
        // PDF as approved (it would carry the field head's signature).
        $isApproved = false;
        if ($teamReportId = $validated['team_report_id'] ?? null) {
            $teamReport = WfhTeamReport::where('team_id', $team->id)->find($teamReportId);
            $isApproved = $teamReport !== null && $teamReport->status === 'approved';
        }

        // PDF embeds real signatures; refuse export when any involved user
        // has not configured theirs yet.
        if ($missing = SignatureGuard::missing([
            $admin,
            $isApproved ? $head : null,
        ])) {
            return ApiResponse::fail(SignatureGuard::missingMessage($missing->name)['message'], 422);
        }

        $data = $this->pdfData->forTeam($team, $admin, $head, $date, $isApproved);

        $pdf = $this->pdfRenderer->render('pdf.wfh-report-admin', $data);

        $filename = "WFH-Team-{$team->id}-{$date}.pdf";

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }
}
