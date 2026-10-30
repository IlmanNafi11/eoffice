
<?php

use App\Domains\Auth\Http\Controllers\AuthController;
use App\Domains\ChangeManagement\Http\Controllers\ChangeManagementPdfController;
use App\Domains\ChangeManagement\Http\Controllers\ChangePackageController;
use App\Domains\ChangeManagement\Http\Controllers\ChangeTypeController;
use App\Domains\Organization\Http\Controllers\PermissionController;
use App\Domains\Organization\Http\Controllers\ProfileController;
use App\Domains\Organization\Http\Controllers\RoleController;
use App\Domains\Organization\Http\Controllers\TeamController;
use App\Domains\Organization\Http\Controllers\UserController;
use App\Domains\Wfh\Http\Controllers\AttendanceController;
use App\Domains\Wfh\Http\Controllers\ReportActivityController;
use App\Domains\Wfh\Http\Controllers\ReportApprovalController;
use App\Domains\Wfh\Http\Controllers\ReportAttendanceController;
use App\Domains\Wfh\Http\Controllers\ReportController;
use App\Domains\Wfh\Http\Controllers\ReportPdfController;
use App\Domains\Wfh\Http\Controllers\TeamReportController;
use App\Domains\Wfh\Http\Controllers\WfhMonitoringController;
use App\Http\Controllers\QrVerificationController;
use App\Http\Controllers\SettingController;
use App\Http\Controllers\SignatureController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:auth');

// Public password reset flow (no auth — OTP via email + cached reset token)
Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:auth');
Route::post('/auth/verify-otp', [AuthController::class, 'verifyOtp'])->middleware('throttle:auth');
Route::post('/auth/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:auth');

// Public by design (QR on a printed document), but still throttled: the token
// is 256-bit and unguessable, and a limiter keeps the endpoint from being used
// as a free token-oracle/amplifier if a QR ever leaks.
Route::get('/verify/{token}', [QrVerificationController::class, 'verify'])->middleware('throttle:60,1');

Route::middleware('auth:sanctum')->post('/auth/change-password', [AuthController::class, 'changePassword']);

Route::middleware(['auth:sanctum', 'password.changed'])->group(function () {
    // Auth
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // Profile
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/signature', [ProfileController::class, 'uploadSignature']);

    // Signatures (private disk; access re-checked per request)
    Route::get('/signatures/{user}', [SignatureController::class, 'show'])->name('signatures.show');

    // Teams (dropdown options)
    Route::get('/teams', [TeamController::class, 'index']);
    // Admin User Management
    Route::middleware('permission:user.manage')->group(function () {
        Route::get('/admin/users', [UserController::class, 'index']);
        Route::get('/admin/users/{user}', [UserController::class, 'show']);
    });

    Route::middleware('permission:user.create')->group(function () {
        Route::post('/admin/users', [UserController::class, 'store']);
    });

    Route::middleware('permission:user.update')->group(function () {
        Route::put('/admin/users/{user}', [UserController::class, 'update']);
    });

    Route::middleware('permission:user.delete')->group(function () {
        Route::delete('/admin/users/{user}', [UserController::class, 'destroy']);
    });

    Route::middleware('permission:user.import')->group(function () {
        Route::post('/admin/users/import', [UserController::class, 'import']);
    });
    // RBAC Management
    Route::middleware('permission:role.manage')->group(function () {
        Route::get('/admin/roles', [RoleController::class, 'index']);
        Route::put('/admin/roles/{role}/permissions', [RoleController::class, 'updatePermissions']);
    });

    Route::middleware('permission:permission.manage')->group(function () {
        Route::get('/admin/permissions', [PermissionController::class, 'index']);
    });

    Route::middleware('permission:setting.manage')->group(function () {
        Route::get('/admin/settings', [SettingController::class, 'index']);
        Route::put('/admin/settings/{key}', [SettingController::class, 'update']);
    });

    // WFH Module
    Route::get('/wfh/session-config', [AttendanceController::class, 'sessionConfig']);

    Route::get('/wfh/reports', [ReportController::class, 'index']);
    Route::post('/wfh/reports', [ReportController::class, 'store'])
        ->middleware('permission:wfh.report.create');
    Route::get('/wfh/reports/{report}', [ReportController::class, 'show']);
    Route::put('/wfh/reports/{report}', [ReportController::class, 'update'])
        ->middleware('permission:wfh.report.update');
    Route::delete('/wfh/reports/{report}', [ReportController::class, 'destroy'])
        ->middleware('permission:wfh.report.delete');

    // Activity sub-resource
    Route::post('/wfh/reports/{report}/activities', [ReportActivityController::class, 'store'])
        ->middleware('permission:wfh.report.create');
    Route::put('/wfh/reports/{report}/activities/{activity}', [ReportActivityController::class, 'update'])
        ->middleware('permission:wfh.report.update');
    Route::delete('/wfh/reports/{report}/activities/{activity}', [ReportActivityController::class, 'destroy'])
        ->middleware('permission:wfh.report.activity.delete');
    Route::patch('/wfh/reports/{report}/activities/reorder', [ReportActivityController::class, 'reorder'])
        ->middleware('permission:wfh.report.update');

    // Attendance sub-resource
    Route::post('/wfh/reports/{report}/attendances', [ReportAttendanceController::class, 'store'])
        ->middleware('permission:wfh.attendance.create');
    Route::delete('/wfh/reports/{report}/attendances/{attendance}', [ReportAttendanceController::class, 'destroy'])
        ->middleware('permission:wfh.report.attendance.delete');
    /*
     * Evidence photo: no permission middleware, because the maker of the report
     * must see their own photo while a supervisor needs wfh.monitoring.view.
     * The controller applies that split; a route-level permission would deny
     * the maker.
     */
    Route::get('/wfh/reports/{report}/attendances/{attendance}/photo', [ReportAttendanceController::class, 'photo'])
        ->name('attendances.photo');

    Route::post('/wfh/reports/{report}/submit', [ReportApprovalController::class, 'submit'])
        ->middleware('permission:wfh.report.submit');
    Route::post('/wfh/reports/{report}/approve', [ReportApprovalController::class, 'approve'])
        ->middleware('permission:wfh.report.approve');
    Route::post('/wfh/reports/{report}/reject', [ReportApprovalController::class, 'reject'])
        ->middleware('permission:wfh.report.reject');
    Route::post('/wfh/reports/{report}/revise', [ReportApprovalController::class, 'revise'])
        ->middleware('permission:wfh.report.update');

    Route::get('/admin/wfh/monitoring', [WfhMonitoringController::class, 'index'])
        ->middleware('permission:wfh.monitoring.view');

    Route::get('/admin/wfh/reports', [ReportController::class, 'adminIndex'])
        ->middleware('permission:wfh.monitoring.view');

    Route::get('/wfh/reports/{report}/pdf', [ReportPdfController::class, 'export'])
        ->middleware('permission:wfh.report.export_pdf');

    Route::get('/admin/wfh/teams/{team}/pdf', [ReportPdfController::class, 'exportTeam'])
        ->middleware('permission:wfh.report.export_pdf');

    Route::get('/admin/wfh/team-reports', [TeamReportController::class, 'index'])
        ->middleware('permission:wfh.team_report.view');
    Route::post('/admin/wfh/team-reports', [TeamReportController::class, 'store'])
        ->middleware('permission:wfh.team_report.create');

    Route::post('/admin/wfh/team-reports/{report}/approve', [TeamReportController::class, 'approve'])
        ->middleware('permission:wfh.team_report.approve');
    Route::post('/admin/wfh/team-reports/{report}/reject', [TeamReportController::class, 'reject'])
        ->middleware('permission:wfh.team_report.reject');
    // Change Management — Package flow
    Route::get('/changes', [ChangePackageController::class, 'index'])
        ->middleware('permission:change.initiation.view');
    Route::post('/changes', [ChangePackageController::class, 'store'])
        ->middleware('permission:change.initiation.create');
    Route::get('/changes/{id}', [ChangePackageController::class, 'show'])
        ->middleware('permission:change.initiation.view');
    Route::put('/changes/{id}', [ChangePackageController::class, 'update'])
        ->middleware('permission:change.initiation.update');
    Route::delete('/changes/{id}', [ChangePackageController::class, 'destroy'])
        ->middleware('permission:change.initiation.delete');
    Route::post('/changes/{id}/submit', [ChangePackageController::class, 'submit'])
        ->middleware('permission:change.initiation.submit');
    Route::post('/changes/{id}/approve', [ChangePackageController::class, 'approve'])
        ->middleware('permission:change.initiation.approve');
    Route::post('/changes/{id}/reject', [ChangePackageController::class, 'reject'])
        ->middleware('permission:change.initiation.reject');
    Route::post('/changes/{id}/attachments', [ChangePackageController::class, 'uploadAttachments'])
        ->middleware('permission:change.implementation.update');
    Route::get('/changes/{id}/attachments/{attachment}', [ChangePackageController::class, 'downloadAttachment'])
        // Evidence files are private: they stream through this authorized
        // endpoint instead of a static /storage URL (ship review S2).
        ->middleware('permission:change.initiation.view')->name('attachments.download');
    Route::get('/changes/{id}/pdf/initiation', [ChangeManagementPdfController::class, 'exportInitiation'])
        ->middleware('permission:change.initiation.export_pdf');
    Route::get('/changes/{id}/pdf/implementation', [ChangeManagementPdfController::class, 'exportImplementation'])
        ->middleware('permission:change.implementation.export_pdf');

    // Change Types — reference data, no additional permission
    Route::get('/change-types', [ChangeTypeController::class, 'index']);
});
