<?php

namespace App\Domains\ChangeManagement\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ChangeImplementation extends Model
{
    use SoftDeletes;

    /**
     * Business fields only. Workflow state (status, review_status, reviewer_id,
     * responsible_id, *_signed_at) is written exclusively through
     * transitionPackage()/forceFill so a request payload can never set it.
     */
    protected $fillable = [
        'change_initiation_id',
        'priority',
        'impact',
        'production_impact',
        'required_effort',
        'cost_needed',
        'cost_amount',
        'resources',
        'test_plan',
        'evaluator_id',
        'review_response',
        'execution_date',
        'implementation_result',
        'release_date',
    ];

    protected $casts = [
        'cost_needed' => 'boolean',
        'cost_amount' => 'decimal:2',
        'execution_date' => 'date',
        'release_date' => 'date',
        'evaluator_signed_at' => 'datetime',
        'reviewer_signed_at' => 'datetime',
        'responsible_signed_at' => 'datetime',
    ];

    public function initiation(): BelongsTo
    {
        return $this->belongsTo(ChangeInitiation::class, 'change_initiation_id');
    }

    public function evaluator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'evaluator_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function responsible(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsible_id');
    }

    public function changeTypes(): BelongsToMany
    {
        return $this->belongsToMany(ChangeType::class, 'change_implementation_type', 'change_implementation_id', 'change_type_id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(ChangeImplementationAttachment::class)->orderBy('sort_order');
    }
}
