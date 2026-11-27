<?php

namespace App\Support\Organization;

use App\Models\Field;
use App\Models\User;

/**
 * Single source of truth for "which field does this actor lead or belong to?".
 *
 * Ship #23: three places answered this differently — `TeamReportScope`
 * (DB `head_id` only, for authorisation), `DashboardScope::for` and
 * `WfhMonitoringController::index` (the field they head, else their own
 * team's field, for scope resolution). The two answers must not drift: a
 * dashboard that shows a field the team-report list refuses to show is a
 * support ticket, not a hardening gain.
 *
 * The two questions stay distinct on purpose:
 *   - `headIdOf()` — AUTHORISATION. Does this actor head this field? Strict DB
 *     `head_id` only; no fallback, so "member of the field" never becomes
 *     "head of the field".
 *   - `ledFieldId()` / `ledField()` — SCOPE RESOLUTION. Which field is this
 *     actor's data home? The field they head, else the field of their team,
 *     first by id so a multi-field head resolves consistently everywhere.
 */
class FieldLeadership
{
    /** The field this actor heads (strict: `fields.head_id` = actor), or null. */
    public static function headIdOf(User $actor): ?int
    {
        $id = Field::where('head_id', $actor->id)->orderBy('id')->value('id');

        return $id === null ? null : (int) $id;
    }

    /** The field this actor heads or belongs to, or null when they have neither. */
    public static function ledFieldId(User $actor): ?int
    {
        $actor->loadMissing('team.field');

        return self::headIdOf($actor) ?? $actor->team?->field?->id;
    }

    /** The same resolution as `ledFieldId()`, with the model attached. */
    public static function ledField(User $actor): ?Field
    {
        $actor->loadMissing('team.field');

        if ($headId = self::headIdOf($actor)) {
            return Field::find($headId);
        }

        return $actor->team?->field;
    }

    /** Is this actor the head of this field? Strict; null field never matches. */
    public static function isHeadOf(User $actor, ?int $fieldId): bool
    {
        return $fieldId !== null
            && Field::where('id', $fieldId)->where('head_id', $actor->id)->exists();
    }
}
