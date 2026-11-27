<?php

namespace App\Domains\Wfh\Services;

use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\Field;
use App\Models\User;
use App\Support\Constants\Roles;
use App\Support\Http\ApiResponse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

/**
 * Single source of truth for "which team reports may this actor read?".
 *
 * `index()` and `show()` share one rule — admin sees every field; every other
 * role must belong to a field and is locked to it; only the field head may read
 * sibling teams inside the field. Encoding that rule twice (a `whereHas`
 * closure for the list and a manual comparison for the detail) is exactly how
 * a security boundary drifts, so both call sites delegate here.
 *
 * `denialFor()` returns the refusal for an out-of-scope actor; callers return
 * it verbatim so the list and the detail answer identically.
 */
class TeamReportScope
{
    /**
     * The refusal for a non-admin actor with no field at all, or null when the
     * actor may query. A user with no field is answered 422 (client
     * configuration, not a denial of an existing resource); permission
     * denials use 403 (see `PermissionMiddleware`). Kept separate from
     * `applyTo()` so the list answers 422 instead of silently an empty page.
     */
    public function noFieldDenial(User $actor): ?JsonResponse
    {
        if ($actor->hasRole(Roles::ADMIN) || $this->fieldIdOf($actor) !== null) {
            return null;
        }

        return ApiResponse::fail('User tidak terhubung dengan bidang manapun.');
    }

    /**
     * Apply the actor's read scope to a team-report query. Call
     * `noFieldDenial()` first — a field-less actor scopes to nothing.
     *
     * @param  Builder<WfhTeamReport>  $builder
     * @return Builder<WfhTeamReport>
     */
    public function applyTo(Builder $builder, User $actor): Builder
    {
        if ($actor->hasRole(Roles::ADMIN)) {
            return $builder;
        }

        $fieldId = $this->fieldIdOf($actor);

        // Fail closed: a non-admin with no field matches nothing, even if a
        // caller forgets the noFieldDenial() guard. `whereRaw('false')` avoids
        // the `field_id = null` trap (which silently degrades to "any field").
        if ($fieldId === null) {
            return $builder->whereRaw('1 = 0');
        }

        return $builder->whereHas('team', function (Builder $team) use ($actor, $fieldId): void {
            $team->where('field_id', $fieldId);

            // Field head sees all teams in the field; others (KT, staf) own team only.
            if (! $this->isFieldHead($actor, $fieldId)) {
                $team->where('id', $actor->team_id);
            }
        });
    }

    /**
     * The refusal for a non-admin actor that cannot read `$report`, or null
     * when the report is in scope. Admins are always in scope.
     */
    public function denialFor(User $actor, WfhTeamReport $target): ?JsonResponse
    {
        if ($actor->hasRole(Roles::ADMIN)) {
            return null;
        }

        $fieldId = $this->fieldIdOf($actor);
        if ($fieldId === null) {
            return $this->noFieldDenial($actor);
        }

        $reportTeam = $target->team;
        $inScope = $reportTeam !== null
            && $reportTeam->field_id === $fieldId
            && ($this->isFieldHead($actor, $fieldId) || $reportTeam->id === $actor->team_id);

        return $inScope ? null : ApiResponse::fail('Laporan tidak berada dalam bidang Anda.', 403);
    }

    /** The actor's field id, eager-loading the `team.field` chain once. */
    public function fieldIdOf(User $actor): ?int
    {
        $actor->loadMissing('team.field');

        return $actor->team?->field?->id;
    }

    /** Field head = the `head_id` on the field row, read from the DB (not a role string). */
    public function isFieldHead(User $actor, ?int $fieldId): bool
    {
        return $fieldId !== null
            && Field::where('id', $fieldId)->where('head_id', $actor->id)->exists();
    }
}
