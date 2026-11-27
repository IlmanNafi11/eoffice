<?php

namespace App\Domains\Dashboard\Services;

use App\Models\User;
use App\Support\Constants\Roles;
use App\Support\Organization\FieldLeadership;
use Illuminate\Database\Eloquent\Builder;
use LogicException;

/**
 * Single resolver for "whose records may this requester see" (design D2).
 *
 * Every dashboard builder consults this once and reuses it, so the recap, the
 * 14-day trend and the attention list can never disagree about scope. The
 * rules mirror the rest of the app: admin = everyone, kepala_tim = the FIRST
 * team they lead (`ledTeams()->first()`, not every team), kepala_bidang =
 * their whole field, staf = themselves.
 *
 * Kepala_* without a team/field resolves to null — deny-by-default, matching
 * `EloquentChangeManagementRepository::applyVisibilityScope`; it never widens
 * to "everyone" just because the actor is a supervisor.
 */
final class DashboardScope
{
    private const SELF = 'self';

    private const TEAM = 'team';

    private const FIELD = 'field';

    private const ALL = 'all';

    private function __construct(
        private readonly string $kind,
        private readonly ?int $id = null,
    ) {}

    public static function for(User $user): ?self
    {
        if ($user->hasRole(Roles::ADMIN)) {
            return new self(self::ALL);
        }

        if ($user->hasRole(Roles::KEPALA_TIM)) {
            $teamId = $user->ledTeams()->orderBy('id')->value('id');

            return $teamId === null ? null : new self(self::TEAM, (int) $teamId);
        }

        if ($user->hasRole(Roles::KEPALA_BIDANG)) {
            // Shared resolver (ship #23): the field they head, else the field
            // of their own team — identical to WfhMonitoringController and
            // TeamReportScope.
            $fieldId = FieldLeadership::ledFieldId($user);

            return $fieldId === null ? null : new self(self::FIELD, $fieldId);
        }

        return new self(self::SELF, $user->id);
    }

    /** A self scope has no aggregate recap to render. */
    public function isSelf(): bool
    {
        return $this->kind === self::SELF;
    }

    /**
     * @throws LogicException when called on a self scope — callers must check
     *                        isSelf() first, there is no label for "just me".
     */
    public function label(): string
    {
        return match ($this->kind) {
            self::TEAM => 'Tim',
            self::FIELD => 'Bidang',
            self::ALL => 'Organisasi',
            default => throw new LogicException('A self scope has no recap label.'),
        };
    }

    /**
     * Constrain a users query to this scope. Callers add `is_active` — the
     * dashboard denominator deliberately excludes inactive users.
     */
    public function applyTo(Builder $query, string $userTable = 'users'): Builder
    {
        return match ($this->kind) {
            self::ALL => $query,
            self::SELF => $query->where("{$userTable}.id", $this->id),
            self::TEAM => $query->where("{$userTable}.team_id", $this->id),
            self::FIELD => $query->whereHas('team', fn (Builder $q) => $q->where('field_id', $this->id)),
        };
    }

    /**
     * The active-user roster a scope aggregates over — the single place the
     * "active only" denominator rule lives (callers used to repeat it).
     */
    public static function rosterQuery(): Builder
    {
        return User::query()->where('is_active', true);
    }

    /**
     * Constrain a team-scoped query (e.g. team reports) to the teams this
     * scope covers. A self scope covers no teams at all.
     */
    public function applyToTeams(Builder $query): Builder
    {
        return match ($this->kind) {
            self::ALL => $query,
            self::TEAM => $query->where('team_id', $this->id),
            self::FIELD => $query->whereHas('team', fn (Builder $q) => $q->where('field_id', $this->id)),
            self::SELF => $query->whereRaw('false'),
        };
    }
}
