<?php

namespace App\Domains\Wfh\Models;

use Illuminate\Database\Eloquent\Model;

class WfhReportLink extends Model
{
    protected $fillable = [
        'wfh_report_activity_id',
        'url',
        'sort_order',
    ];
}
