<?php

namespace App\Domains\Wfh\Models;

use App\Models\Team;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WfhTeamReport extends Model
{
    use HasFactory;

    protected $table = 'wfh_team_reports';

    /*
     * Only creation metadata is fillable. Workflow state is written through
     * forceFill() in TeamReportStateMachine / TeamReportController (SEC-07).
     */
    protected $fillable = [
        'team_id',
        'report_date',
        'created_by',
        'reject_reason',
    ];

    protected $casts = [
        'report_date' => 'date',
        'maker_signed_at' => 'datetime',
        'supervisor_signed_at' => 'datetime',
    ];

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_id');
    }
}
