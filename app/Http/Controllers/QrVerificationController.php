<?php

namespace App\Http\Controllers;

use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\Wfh\Models\WfhReport;
use App\Support\Http\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Symfony\Component\HttpFoundation\AcceptHeader;

class QrVerificationController extends Controller
{
    /**
     * True only when the client explicitly asked for HTML (a `text/html`
     * Accept entry with a positive quality value). A wildcard media-range,
     * the `text/…` media-type family, an absent header, or an explicit
     * `text/html;q=0` all count as NOT-html, so curl and JSON consumers
     * keep the raw contract (ship review #10, SEC-02).
     */
    public static function wantsHtml(Request $request): bool
    {
        foreach (AcceptHeader::fromString($request->header('Accept', ''))->all() as $item) {
            if (strtolower((string) $item->getValue()) === 'text/html' && $item->getQuality() > 0) {
                return true;
            }
        }

        return false;
    }

    public function verify(string $token): JsonResponse
    {
        // Validate token format: 64-char lowercase hex string
        if (! preg_match('/^[a-f0-9]{64}$/', $token)) {
            return ApiResponse::fail('Token verifikasi tidak valid.', 404);
        }

        $report = WfhReport::where('verification_token', $token)
            ->where('status', 'approved')
            ->whereNotNull('maker_signed_at')
            ->whereNotNull('supervisor_signed_at')
            ->first();

        if ($report) {
            return ApiResponse::ok([
                'doc_type' => 'WFH Report',
                'doc_number' => 'WFH-'.$report->id,
                'report_date' => $report->report_date->format('Y-m-d'),
                'status' => 'terverifikasi',
                'message' => 'Dokumen telah ditandatangani secara elektronik.',
            ]);
        }

        $initiation = ChangeInitiation::where('verification_token', $token)
            ->where('status', 'approved')
            ->whereNotNull('initiator_signed_at')
            ->whereNotNull('reviewed_at')
            ->first();

        if ($initiation) {
            return ApiResponse::ok([
                'doc_type' => 'Change Initiation',
                'doc_number' => $initiation->doc_number,
                'status' => 'terverifikasi',
                'message' => 'Dokumen telah ditandatangani secara elektronik.',
            ]);
        }

        return ApiResponse::fail('Token verifikasi tidak ditemukan.', 404);
    }
}
