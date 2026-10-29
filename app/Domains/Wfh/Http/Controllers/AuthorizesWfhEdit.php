<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Services\WfhReportStateMachine;
use App\Support\Http\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Shared edit guard for WFH sub-resource controllers.
 * Checks report ownership and editability (draft|rejected).
 */
trait AuthorizesWfhEdit
{
    private WfhReportStateMachine $stateMachine;

    /**
     * Authorize: actor owns the report AND report is editable (draft|rejected).
     * Returns null when authorized, or the blocking JSON response.
     */
    private function authorizeEdit(WfhReport $report, Request $request): ?JsonResponse
    {
        if ($report->user_id !== $request->user()->id) {
            return ApiResponse::fail('Tidak dapat mengubah laporan orang lain.', 403);
        }

        if (! $this->stateMachine->canEdit($report)) {
            return ApiResponse::fail('Laporan yang sudah disetujui tidak dapat diubah.');
        }

        return null;
    }

    private function notFound(string $message): JsonResponse
    {
        return ApiResponse::fail($message, 404);
    }
}
