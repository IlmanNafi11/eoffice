<?php

namespace App\Domains\Wfh\Services;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Models\Setting;
use App\Models\Team;
use App\Models\User;
use App\Support\Media\PublicMediaPath;
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
                'waktu' => $activity->start_time.' – '.$activity->end_time,
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
        ];
    }

    /**
     * View-data assembly for `pdf.wfh-report-admin`.
     *
     * @return array<string, mixed>
     */
    public function forTeam(Team $team, User $admin, ?User $head, string $date, bool $isApproved): array
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
                    'photo' => PublicMediaPath::exists($photoPath)
                        ? PublicMediaPath::resolve($photoPath)
                        : null,
                ];
            }
            $sessions[$sessionName] = $entries;
        }

        $makerSig = SignaturePath::resolve($admin->signature_path) ?: null;

        $supervisorSig = null;
        if ($isApproved && $head?->signature_path) {
            $supervisorSig = SignaturePath::resolve($head->signature_path);
        }

        return [
            'namaTim' => $team->name,
            'unitKerja' => $field?->name ?? '-',
            'tanggalPelaksanaan' => Carbon::parse($date)->isoFormat('D MMMM Y'),
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
    }
}
