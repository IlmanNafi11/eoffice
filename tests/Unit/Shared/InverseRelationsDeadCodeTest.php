<?php

namespace Tests\Unit\Shared;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReportActivity;
use App\Domains\Wfh\Models\WfhReportLink;
use App\Models\Field;
use App\Models\Team;
use Illuminate\Database\Eloquent\Relations\Relation;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * A11: these inverse relations are never traversed — no caller loads, accesses,
 * or queries them. Keeping them invites accidental N+1 loads through relations
 * the domain never reasons about, so they are removed outright.
 */
class InverseRelationsDeadCodeTest extends TestCase
{
    /**
     * @return array<string, array{class-string, string}>
     */
    public static function removedRelations(): array
    {
        return [
            'Team::users' => [Team::class, 'users'],
            'Field::teams' => [Field::class, 'teams'],
            'WfhAttendance::report' => [WfhAttendance::class, 'report'],
            'WfhReportActivity::report' => [WfhReportActivity::class, 'report'],
            'WfhReportLink::activity' => [WfhReportLink::class, 'activity'],
        ];
    }

    #[DataProvider('removedRelations')]
    public function test_inverse_relation_is_removed(string $model, string $relation): void
    {
        $this->assertFalse(
            method_exists($model, $relation),
            "{$model}::{$relation}() must be removed — nothing traverses it."
        );
    }

    public function test_forward_relations_survive(): void
    {
        $this->assertTrue(method_exists(Team::class, 'field'));
        $this->assertTrue(method_exists(Team::class, 'leader'));
        $this->assertTrue(method_exists(Field::class, 'head'));
        $this->assertTrue(method_exists(WfhAttendance::class, 'user'));
        $this->assertTrue(method_exists(WfhReportActivity::class, 'links'));
        $this->assertInstanceOf(Relation::class, (new WfhReportActivity)->links());
    }
}
