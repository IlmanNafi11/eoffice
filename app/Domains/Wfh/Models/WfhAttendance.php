<?php

namespace App\Domains\Wfh\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class WfhAttendance extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'user_id',
        'date',
        'session',
        'photo_path',
        'check_in_at',
        'report_id',
    ];

    protected $casts = [
        'date' => 'date',
        'check_in_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function report(): BelongsTo
    {
        return $this->belongsTo(WfhReport::class);
    }
}
