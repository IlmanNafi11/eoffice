<?php

namespace App\Domains\ChangeManagement\Http\Controllers;

use App\Domains\ChangeManagement\Repositories\ChangeManagementRepositoryInterface;
use App\Domains\ChangeManagement\Services\ChangePackagePdfData;
use App\Support\Http\ApiResponse;
use App\Support\Pdf\PdfRendererService;
use App\Support\Signature\SignatureGuard;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;

class ChangeManagementPdfController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private ChangeManagementRepositoryInterface $repo,
        private PdfRendererService $pdfRenderer,
        private ChangePackagePdfData $pdfData,
    ) {}

    public function exportInitiation(int $packageId): Response|JsonResponse
    {
        $this->authorize('change.initiation.export_pdf');

        $package = $this->repo->findPackage($packageId);

        if (! $package) {
            return ApiResponse::fail('Paket perubahan tidak ditemukan.', 404);
        }

        if ($package->status !== 'approved') {
            return ApiResponse::fail('PDF hanya dapat di-generate untuk paket yang sudah disetujui.');
        }

        // PDF embeds real signatures; refuse export when any involved user
        // has not configured theirs yet.
        if ($missing = SignatureGuard::missing([
            $package->initiator,
            $package->reviewer,
        ])) {
            return ApiResponse::fail(SignatureGuard::missingMessage($missing->name)['message']);
        }

        return response(
            $this->pdfRenderer->render('pdf.change-initiation', $this->pdfData->forInitiation($package)),
            200,
            $this->pdfHeaders("Initiation-{$package->id}-{$package->initiation_date->format('Y-m-d')}.pdf"),
        );
    }

    public function exportImplementation(int $packageId): Response|JsonResponse
    {
        $this->authorize('change.implementation.export_pdf');

        $package = $this->repo->findPackage($packageId);

        if (! $package || ! $package->implementation) {
            return ApiResponse::fail('Implementasi tidak ditemukan.', 404);
        }

        $impl = $package->implementation;

        if ($impl->status !== 'completed') {
            return ApiResponse::fail('PDF hanya dapat di-generate untuk implementasi yang sudah selesai (diterima).');
        }

        // PDF embeds real signatures; refuse export when any involved user
        // has not configured theirs yet.
        if ($missing = SignatureGuard::missing([
            $impl->evaluator,
            $impl->reviewer,
            $impl->responsible,
        ])) {
            return ApiResponse::fail(SignatureGuard::missingMessage($missing->name)['message']);
        }

        return response(
            $this->pdfRenderer->render('pdf.change-implementation', $this->pdfData->forImplementation($package)),
            200,
            $this->pdfHeaders("Implementation-{$impl->id}.pdf"),
        );
    }

    /** @return array<string, string> */
    private function pdfHeaders(string $filename): array
    {
        return [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ];
    }
}
