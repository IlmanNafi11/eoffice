<?php

namespace App\Domains\Wfh\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class WfhReport extends Model
{
    use HasFactory, SoftDeletes;

    /*
     * Only creation metadata is fillable. Workflow state (status, signature
     * timestamps, supervisor_id, verification_token) is written exclusively
     * through forceFill() in the state machines, never from client input
     * (ship review SEC-07 — defence in depth behind the controller allowlists).
     */
    protected $fillable = [
        'user_id',
        'report_date',
        'reject_reason',
    ];

    protected $casts = [
        'report_date' => 'date',
        'maker_signed_at' => 'datetime',
        'supervisor_signed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(WfhAttendance::class, 'report_id');
    }

    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_id');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(WfhReportActivity::class)->orderBy('sort_order');
    }
}
