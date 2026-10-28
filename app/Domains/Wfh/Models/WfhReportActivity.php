<?php

namespace App\Domains\Wfh\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WfhReportActivity extends Model
{
    protected $fillable = [
        'wfh_report_id',
        'start_time',
        'end_time',
        'activity',
        'sort_order',
    ];

    protected $casts = [
        'start_time' => 'datetime',
        'end_time' => 'datetime',
    ];

    public function links(): HasMany
    {
        return $this->hasMany(WfhReportLink::class)->orderBy('sort_order');
    }
}
