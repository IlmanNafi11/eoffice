<?php

namespace App\Domains\ChangeManagement\Models;

use App\Models\Field;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class ChangeInitiation extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * Business fields only. Workflow state (status, initiator_id, reviewer_id,
     * doc_number, review_*, *_signed_at, verification_token) is written
     * exclusively through transitionPackage()/forceFill so a request payload
     * can never set it.
     */
    protected $fillable = [
        'field_id',
        'needed_by_date',
        'description',
        'reason',
    ];

    protected $casts = [
        'initiation_date' => 'date',
        'needed_by_date' => 'date',
        'reviewed_at' => 'datetime',
        'initiator_signed_at' => 'datetime',
    ];

    public function field(): BelongsTo
    {
        return $this->belongsTo(Field::class);
    }

    public function initiator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'initiator_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function implementation(): HasOne
    {
        return $this->hasOne(ChangeImplementation::class);
    }
}
