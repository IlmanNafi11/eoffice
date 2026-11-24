<?php

namespace App\Domains\Wfh\Services;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Models\Setting;
use App\Models\Team;
use App\Models\User;
use App\Support\Media\PrivateMediaPath;
use App\Support\Pdf\PdfImage;
use App\Support\QrCode\QrCodeService;
use App\Support\Signature\SignaturePath;
use Illuminate\Support\Carbon;

class WfhReportPdfData
{
    public function __construct(
        private WfhRepositoryInterface $wfhRepository,
        private QrCodeService $qrCodeService,
    ) {}

    /**
     * View-data assembly for `pdf.wfh-report`.
     *
     * @return array<string, mixed>
     */
    public function forReport(WfhReport $report): array
    {
        $isApproved = $report->status === 'approved';

        $user = $report->user;
        $supervisor = $report->supervisor;
        $team = $user->team;
        $field = $team?->field;

        $kegiatan = $report->activities->map(function ($activity) {
            return [
                'waktu' => ($activity->start_time?->format('H:i') ?? '-')
                    .' – '.($activity->end_time?->format('H:i') ?? '-'),
                'kegiatan' => $activity->activity,
                'links' => $activity->links->pluck('url')->toArray(),
            ];
        })->toArray();

        $qrSvg = null;
        if ($isApproved && $report->verification_token) {
            $qrSvg = $this->qrCodeService->generate(
                $this->qrCodeService->generateVerificationUrl($report->verification_token)
            );
        }

        $makerSig = SignaturePath::resolve($user->signature_path) ?: null;

        $supervisorSig = null;
        if ($isApproved && $supervisor?->signature_path) {
            $supervisorSig = SignaturePath::resolve($supervisor->signature_path);
        }

        return [
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
            'logoDoc' => PdfImage::dataUri('images/logo-doc.webp'),
        ];
    }

    /**
     * View-data assembly for `pdf.wfh-report-admin`.
     *
     * @return array<string, mixed>
     */
    public function forTeam(Team $team, ?User $maker, ?User $head, string $date, bool $isApproved): array
    {
        $teamData = $this->wfhRepository->getTeamReportData($team->id, $date);

        $field = $team->field;

        $staff = array_map(fn ($member) => [
            'name' => $member['name'],
            'nip' => $member['nip'],
            'links' => $member['links'],
        ], $teamData);

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
                    // Private disk first; the public disk is only a fallback for
                    // rows written before the media:migrate-private cutover.
                    'photo' => PrivateMediaPath::existsAny($photoPath)
                        ? PrivateMediaPath::resolveAny($photoPath)
                        : null,
                ];
            }
            $sessions[$sessionName] = $entries;
        }

        $makerSig = $maker ? (SignaturePath::resolve($maker->signature_path) ?: null) : null;

        $supervisorSig = null;
        if ($isApproved && $head?->signature_path) {
            $supervisorSig = SignaturePath::resolve($head->signature_path);
        }

        return [
            'namaTim' => $team->name,
            'unitKerja' => $field?->name ?? '-',
            'sessions' => $sessions,
            'isApproved' => $isApproved,
            'tanggalPelaksanaan' => Carbon::parse($date)->isoFormat('D MMMM Y'),
            'staff' => $staff,
            // Spec decision 4: absent maker renders the em-dash "—"
            // (DejaVu Sans covers U+2014; same glyph already renders in
            // change-implementation.blade.php), NOT the downloading admin.
            'makerName' => $maker ? strtoupper($maker->name) : '—',
            'makerNip' => $maker?->nip ?? '—',
            'signatureMakerPath' => $makerSig,
            'signatureSupervisorPath' => $supervisorSig,
            'supervisorName' => $head ? strtoupper($head->name) : '-',
            'supervisorNip' => $head?->nip ?? '-',
            'logoDoc' => PdfImage::dataUri('images/logo-doc.webp'),
        ];
    }
}
