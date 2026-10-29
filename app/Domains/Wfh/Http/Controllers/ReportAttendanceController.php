<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Http\Requests\AppendAttendanceRequest;
use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Domains\Wfh\Services\WfhReportStateMachine;
use App\Models\Setting;
use App\Support\Http\ApiResponse;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class ReportAttendanceController extends Controller
{
    use AuthorizesRequests;
    use AuthorizesWfhEdit;

    public function __construct(
        private WfhRepositoryInterface $wfhRepository,
        private WfhReportStateMachine $stateMachine,
    ) {}

    public function store(WfhReport $report, AppendAttendanceRequest $request): JsonResponse
    {
        if ($block = $this->authorizeEdit($report, $request)) {
            return $block;
        }

        $user = $request->user();
        $date = $report->report_date->format('Y-m-d');
        $today = now()->toDateString();

        // Guard: report_date must be today
        if ($date !== $today) {
            return ApiResponse::fail('Absensi hanya dapat dilakukan pada hari ini.');
        }

        $session = $request->input('session');

        // Validate allowed day from Setting
        $allowedDays = Setting::get('wfh_allowed_days', [1, 2, 3, 4, 5]);
        $dayOfWeek = now()->dayOfWeekIso;

        if (! in_array($dayOfWeek, $allowedDays)) {
            return ApiResponse::fail('Absensi WFH hanya dapat dilakukan pada hari yang ditentukan.');
        }

        // Guard: no duplicate session for same user+date
        $existing = $this->wfhRepository->findAttendanceByUserAndDate($user->id, $date, $session);
        if ($existing) {
            return ApiResponse::fail('Anda sudah melakukan absensi untuk sesi ini.');
        }

        // Store photo, then persist. On a concurrent insert hitting the
        // (user_id, date, session) unique index, clean up the orphan file.
        $photo = $request->file('photo');
        $path = $photo->store("attendances/{$user->id}/{$date}", 'public');

        try {
            $attendance = $this->wfhRepository->addAttendanceToReport($report, [
                'session' => $session,
                'photo_path' => $path,
            ]);
        } catch (QueryException $e) {
            if ($e->getCode() === '23505') {
                Storage::disk('public')->delete($path);

                return ApiResponse::fail('Anda sudah melakukan absensi untuk sesi ini.');
            }
            throw $e;
        }

        return ApiResponse::created([
            'id' => $attendance->id,
            'date' => $attendance->date->format('Y-m-d'),
            'session' => $attendance->session,
            'photo_url' => asset("storage/{$path}"),
            'check_in_at' => $attendance->check_in_at,
        ], 'Absensi WFH berhasil.');
    }

    public function destroy(WfhReport $report, WfhAttendance $attendance, Request $request): Response
    {
        if ($attendance->report_id !== $report->id) {
            return $this->notFound('Absensi tidak ditemukan.');
        }

        if ($block = $this->authorizeEdit($report, $request)) {
            return $block;
        }

        $this->wfhRepository->deleteAttendance($attendance->id);

        return ApiResponse::deleted();
    }
}
