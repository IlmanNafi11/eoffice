<?php

namespace App\Domains\ChangeManagement\Services;

use App\Domains\ChangeManagement\Models\ChangeImplementation;
use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Support\Media\PrivateMediaPath;
use App\Support\QrCode\QrCodeService;
use App\Support\Signature\SignaturePath;

/**
 * View-data assembly for the change-management PDF exporters
 * (`pdf.change-initiation` and `pdf.change-implementation`).
 */
class ChangePackagePdfData
{
    public function __construct(
        private QrCodeService $qrCodeService,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function forInitiation(ChangeInitiation $package): array
    {
        $field = $package->field;
        $initiator = $package->initiator;
        $reviewer = $package->reviewer;

        return [
            'docNumber' => $package->doc_number,
            'tanggal' => $package->initiation_date->isoFormat('D MMMM Y'),
            'bidang' => $field?->name ?? '-',
            'neededByDate' => $package->needed_by_date?->isoFormat('D MMMM Y') ?? '-',
            'description' => $package->description,
            'reason' => $package->reason,
            'initiatorName' => strtoupper($initiator?->name ?? '-'),
            'initiatorNip' => $initiator?->nip ?? '-',
            'initiatorPosition' => $initiator?->position ?? '-',
            'initiatorSig' => $this->resolveSignature($initiator?->signature_path),
            'reviewerName' => $reviewer ? strtoupper($reviewer->name) : '-',
            'reviewerNip' => $reviewer?->nip ?? '-',
            'reviewerPosition' => $reviewer?->position ?? '-',
            'reviewerSig' => $this->resolveSignature($reviewer?->signature_path),
            'qrSvg' => $this->qrCodeService->generate(
                $this->qrCodeService->generateVerificationUrl($package->verification_token)
            ),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function forImplementation(ChangeInitiation $package): array
    {
        $field = $package->field;
        $impl = $package->implementation;

        return [
            'docNumber' => $package->doc_number ?? '-',
            'tanggal' => $package->initiation_date?->isoFormat('D MMMM Y') ?? '-',
            'bidang' => $field?->name ?? '-',
            'description' => $package->description ?? '-',
            'priority' => $impl->priority ?? '-',
            'impact' => $impl->impact ?? '-',
            'productionImpact' => $impl->production_impact ?? '-',
            'requiredEffort' => $impl->required_effort ?? '-',
            'costNeeded' => $impl->cost_needed ? 'Ada' : 'Tidak',
            'costAmount' => $impl->cost_amount ? 'Rp. '.$impl->cost_amount : '-',
            'resources' => $impl->resources ?? '-',
            'testPlan' => $impl->test_plan ?? '-',
            'changeTypes' => $impl->changeTypes->pluck('name')->implode(', '),
            'reviewStatus' => $impl->review_status ?? '-',
            'reviewResponse' => $impl->review_response ?? '-',
            'executionDate' => $impl->execution_date?->isoFormat('D MMMM Y') ?? '-',
            'responsibleTeamName' => $impl->reviewer?->team?->name ?? '-',
            'implementationResult' => $impl->implementation_result ?? '-',
            'attachmentImages' => $this->resolveAttachmentImages($impl),
            'releaseDate' => $impl->release_date?->isoFormat('D MMMM Y') ?? '-',
            'evaluatorName' => $impl->evaluator ? strtoupper($impl->evaluator->name) : '-',
            'evaluatorNip' => $impl->evaluator?->nip ?? '-',
            'evaluatorPosition' => $impl->evaluator?->position ?? '-',
            'evaluatorSig' => $this->resolveSignature($impl->evaluator?->signature_path),
            'reviewerName' => $impl->reviewer ? strtoupper($impl->reviewer->name) : '-',
            'reviewerNip' => $impl->reviewer?->nip ?? '-',
            'reviewerPosition' => $impl->reviewer?->position ?? '-',
            'reviewerSig' => $this->resolveSignature($impl->reviewer?->signature_path),
            'responsibleName' => $impl->responsible ? strtoupper($impl->responsible->name) : '-',
            'responsibleNip' => $impl->responsible?->nip ?? '-',
            'responsiblePosition' => $impl->responsible?->position ?? '-',
            'responsibleSig' => $this->resolveSignature($impl->responsible?->signature_path),
        ];
    }

    private function resolveSignature(?string $path): string
    {
        // Signatures live on the private disk — a different disk from the
        // attachments below (ship review SEC-03).
        if (! $path) {
            return '';
        }

        $full = SignaturePath::resolve($path);

        return is_file($full)
            ? 'data:image/png;base64,'.base64_encode((string) file_get_contents($full))
            : '';
    }

    /**
     * @return list<string> base64 data URIs of the implementation attachments.
     *
     * Images are embedded directly; a PDF is embedded as a data URI when the
     * renderer can inline it, and anything else is skipped rather than
     * silently rendering blank (ship review SEC-03 / TestCoverage #7).
     */
    private function resolveAttachmentImages(ChangeImplementation $impl): array
    {
        $images = [];

        foreach ($impl->attachments as $attachment) {
            $mime = match (strtolower(pathinfo($attachment->path, PATHINFO_EXTENSION))) {
                'png' => 'image/png',
                'jpg', 'jpeg' => 'image/jpeg',
                'pdf' => 'application/pdf',
                default => null,
            };

            if ($mime === null) {
                continue;
            }

            $uri = $this->fileDataUri($attachment->path, $mime);

            if ($uri !== '') {
                $images[] = $uri;
            }
        }

        return $images;
    }

    /**
     * Attachments live on the private `local` disk. resolveAny() consults that
     * first and falls back to the legacy `public` copy only for rows written
     * before `media:migrate-private` ran, so exported PDFs keep rendering
     * across the cutover.
     */
    private function fileDataUri(string $path, string $mime): string
    {
        $full = PrivateMediaPath::resolveAny($path);

        if (! is_file($full)) {
            return '';
        }

        return 'data:'.$mime.';base64,'.base64_encode((string) file_get_contents($full));
    }
}
