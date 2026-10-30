<?php

namespace App\Domains\ChangeManagement\Http\Controllers;

use App\Domains\ChangeManagement\Repositories\ChangeManagementRepositoryInterface;
use App\Domains\ChangeManagement\Services\ChangePackagePdfData;
use App\Support\Http\ApiResponse;
use App\Support\Pdf\PdfRendererService;
use App\Support\Signature\SignatureGuard;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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

    public function exportInitiation(Request $request, int $packageId): Response|JsonResponse
    {
        $this->authorize('change.initiation.export_pdf');

        // Same visibility rule as show(): a kepala_* must not export another
        // team's/field's approved package by walking sequential ids.
        $package = $this->repo->packageVisibleTo($packageId, $request->user());

        if (! $package) {
            return $this->missingPackage($packageId);
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

    public function exportImplementation(Request $request, int $packageId): Response|JsonResponse
    {
        $this->authorize('change.implementation.export_pdf');

        $package = $this->repo->packageVisibleTo($packageId, $request->user());

        if (! $package || ! $package->implementation) {
            return $this->missingPackage($packageId);
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

    /**
     * Disambiguate 404 vs 403 like ChangePackageController::show, without
     * hydrating the package just to check existence.
     */
    private function missingPackage(int $packageId): JsonResponse
    {
        if ($this->repo->packageExists($packageId)) {
            return ApiResponse::fail('Anda tidak memiliki akses ke paket ini.', 403);
        }

        return ApiResponse::fail('Paket perubahan tidak ditemukan.', 404);
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
