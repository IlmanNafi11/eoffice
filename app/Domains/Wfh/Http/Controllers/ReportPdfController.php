<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Models\Setting;
use App\Models\Team;
use App\Support\Http\ApiResponse;
use App\Support\Pdf\PdfRendererService;
use App\Support\QrCode\QrCodeService;
use App\Support\Signature\SignatureGuard;
use App\Support\Signature\SignaturePath;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Support\Carbon;

class ReportPdfController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private WfhRepositoryInterface $wfhRepository,
        private PdfRendererService $pdfRenderer,
        private QrCodeService $qrCodeService,
    ) {}

    public function export(WfhReport $report): Response|JsonResponse
    {
        $report = $this->wfhRepository->loadReportWithRelations($report);

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

        $isApproved = $report->status === 'approved';

        $user = $report->user;
        $supervisor = $report->supervisor;
        $team = $user->team;
        $field = $team?->field;

        // Build activity data with links
        $kegiatan = $report->activities->map(function ($activity) {
            return [
                'waktu' => $activity->start_time.' – '.$activity->end_time,
                'kegiatan' => $activity->activity,
                'links' => $activity->links->pluck('url')->toArray(),
            ];
        })->toArray();

        // QR code only available when approved (verification_token set at approve)
        $qrSvg = null;
        if ($isApproved && $report->verification_token) {
            $verifyUrl = $this->qrCodeService->generateVerificationUrl($report->verification_token);
            $qrSvg = $this->qrCodeService->generate($verifyUrl);
        }
        // Signature paths (absolute for dompdf)
        $makerSig = SignaturePath::resolve($user->signature_path) ?: null;

        // Supervisor signature only shown when approved
        $supervisorSig = null;
        if ($isApproved && $supervisor?->signature_path) {
            $supervisorSig = SignaturePath::resolve($supervisor->signature_path);
        }

        $data = [
            'nama' => $user->name,
            'nip' => $user->nip,
            'pangkat' => $user->rank ?? '-',
            'jabatan' => $user->position ?? '-',
            'unitKerja' => $field?->name ?? '-',
            'tanggalPelaksanaan' => $report->report_date->isoFormat('D MMMM Y'),
            'kegiatan' => $kegiatan,
            'isApproved' => $isApproved,
            'signatureMakerPath' => $makerSig,
            'signatureSupervisorPath' => $supervisorSig,
            'makerName' => strtoupper($user->name),
            'makerNip' => $user->nip,
            'supervisorName' => $supervisor ? strtoupper($supervisor->name) : '-',
            'supervisorNip' => $supervisor?->nip ?? '-',
            'qrSvg' => $qrSvg,
        ];

        $pdf = $this->pdfRenderer->render('pdf.wfh-report', $data);

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
        $fieldId = $admin->team?->field?->id;

        // Verify team belongs to admin's field
        if (! $fieldId || $team->field_id !== $fieldId) {
            return ApiResponse::fail('Tim tidak ditemukan dalam bidang Anda.', 403);
        }

        $date = $request->input('date', now()->format('Y-m-d'));
        $teamData = $this->wfhRepository->getTeamReportData($team->id, $date);

        $team->load(['field.head']);
        $field = $team->field;
        $head = $field?->head;

        // Build staff data: name, nip, links (all members, '-' for missing data)
        $staff = array_map(fn ($member) => [
            'name' => $member['name'],
            'nip' => $member['nip'],
            'links' => $member['links'],
        ], $teamData);

        // Build sessions documentation data
        $sessions = [];
        $sessionNames = Setting::get('wfh_sessions', ['pagi', 'siang', 'sore']);
        foreach ($sessionNames as $sessionName) {
            $entries = [];
            foreach ($teamData as $i => $member) {
                $memberPhotos = collect($member['photos'])->keyBy('session');
                $photoPath = $memberPhotos->get($sessionName)['photo_path'] ?? null;
                $entries[] = [
                    'no' => $i + 1,
                    'name' => $member['name'],
                    'photo' => SignaturePath::exists($photoPath)
                        ? SignaturePath::resolve($photoPath)
                        : null,
                ];
            }
            $sessions[$sessionName] = $entries;
        }

        // Check team report status if team_report_id provided
        $isApproved = false;
        if ($teamReportId = $request->input('team_report_id')) {
            $teamReport = WfhTeamReport::find($teamReportId);
            $isApproved = $teamReport && $teamReport->status === 'approved';
        }

        // PDF embeds real signatures; refuse export when any involved user
        // has not configured theirs yet.
        if ($missing = SignatureGuard::missing([
            $admin,
            $isApproved ? $head : null,
        ])) {
            return ApiResponse::fail(SignatureGuard::missingMessage($missing->name)['message'], 422);
        }

        // Admin (maker) signature — always shown
        $makerSig = SignaturePath::resolve($admin->signature_path) ?: null;

        // KB (atasan langsung) signature — only when team report is approved
        $supervisorSig = null;
        if ($isApproved && $head?->signature_path) {
            $supervisorSig = SignaturePath::resolve($head->signature_path);
        }

        $tanggal = Carbon::parse($date)->isoFormat('D MMMM Y');

        $data = [
            'namaTim' => $team->name,
            'unitKerja' => $field?->name ?? '-',
            'tanggalPelaksanaan' => $tanggal,
            'staff' => $staff,
            'sessions' => $sessions,
            'isApproved' => $isApproved,
            'signatureMakerPath' => $makerSig,
            'signatureSupervisorPath' => $supervisorSig,
            'makerName' => strtoupper($admin->name),
            'makerNip' => $admin->nip,
            'supervisorName' => $head ? strtoupper($head->name) : '-',
            'supervisorNip' => $head?->nip ?? '-',
        ];

        $pdf = $this->pdfRenderer->render('pdf.wfh-report-admin', $data);

        $filename = "WFH-Team-{$team->id}-{$date}.pdf";

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }
}
