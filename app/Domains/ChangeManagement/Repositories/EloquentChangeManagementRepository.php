<?php

namespace App\Domains\ChangeManagement\Repositories;

use App\Domains\ChangeManagement\Models\ChangeImplementation;
use App\Domains\ChangeManagement\Models\ChangeImplementationAttachment;
use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Exceptions\ApiException;
use App\Models\User;
use App\Repositories\EloquentRepository;
use App\Support\Constants\Roles;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class EloquentChangeManagementRepository extends EloquentRepository implements ChangeManagementRepositoryInterface
{
    /** @var array<string, string> */
    private const CHILD_STATUS_MIRROR = [
        'draft' => 'draft',
        'pending' => 'submitted',
        'approved' => 'completed',
        'rejected' => 'rejected',
    ];

    /** @var array<string, list<string>> */
    private const ALLOWED_TRANSITIONS = [
        'draft' => ['pending'],
        'pending' => ['approved', 'rejected'],
        'approved' => [],
        'rejected' => [],
    ];

    /** Relations loaded for a full package read (show / after-write return). */
    private const PACKAGE_RELATIONS = [
        'field',
        'initiator.team',
        'reviewer',
        'implementation.evaluator',
        'implementation.reviewer.team',
        'implementation.responsible',
        'implementation.changeTypes',
        'implementation.attachments',
    ];

    /** Relations loaded for a list row (summary, no attachment rows). */
    private const PACKAGE_LIST_RELATIONS = [
        'field',
        'initiator.team',
        'reviewer',
        'implementation.changeTypes',
    ];

    public function __construct(ChangeInitiation $model)
    {
        parent::__construct($model);
    }

    public function createPackage(array $initiation, array $implementation, array $typeIds): ChangeInitiation
    {
        return DB::transaction(function () use ($initiation, $implementation, $typeIds) {
            $parent = ChangeInitiation::create(array_merge([
                'status' => 'draft',
            ], $initiation));

            $impl = ChangeImplementation::create(array_merge([
                'status' => 'draft',
                'priority' => 'normal',
                'impact' => 'Minor',
            ], $implementation, [
                'change_initiation_id' => $parent->id,
            ]));

            if (! empty($typeIds)) {
                $impl->changeTypes()->sync($typeIds);
            }

            return $parent->load(self::PACKAGE_RELATIONS);
        });
    }

    public function updatePackage(int $id, array $initiation, array $implementation, array $typeIds): ChangeInitiation
    {
        return DB::transaction(function () use ($id, $initiation, $implementation, $typeIds) {
            $parent = ChangeInitiation::findOrFail($id);
            if (! empty($initiation)) {
                $parent->update($initiation);
            }

            $impl = $parent->implementation;
            if (! $impl) {
                $impl = ChangeImplementation::create(array_merge([
                    'status' => 'draft',
                    'priority' => 'normal',
                    'impact' => 'Minor',
                ], $implementation, [
                    'change_initiation_id' => $parent->id,
                ]));
            } elseif (! empty($implementation)) {
                $impl->update($implementation);
            }

            if (! empty($typeIds)) {
                $impl->changeTypes()->sync($typeIds);
            }

            return $this->findPackage($id);
        });
    }

    public function findPackage(int $id): ?ChangeInitiation
    {
        return ChangeInitiation::with(self::PACKAGE_RELATIONS)->find($id);
    }

    public function paginatePackages(int $perPage, array $filters, ?User $actor): LengthAwarePaginator
    {
        $query = ChangeInitiation::with(self::PACKAGE_LIST_RELATIONS);

        if (isset($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (isset($filters['field_id'])) {
            $query->where('field_id', $filters['field_id']);
        }

        $this->applyVisibilityScope($query, $actor);

        return $query->orderByDesc('created_at')->paginate($perPage);
    }

    public function packageVisibleTo(int $id, User $actor): ?ChangeInitiation
    {
        $query = ChangeInitiation::with(self::PACKAGE_RELATIONS)->whereKey($id);

        $this->applyVisibilityScope($query, $actor);

        return $query->first();
    }

    public function transitionPackage(int $id, string $parentStatus, array $parentExtra = [], array $childExtra = []): void
    {
        if (! isset(self::CHILD_STATUS_MIRROR[$parentStatus])) {
            throw new ApiException("Unknown package status: {$parentStatus}", 422);
        }

        DB::transaction(function () use ($id, $parentStatus, $parentExtra, $childExtra) {
            $parent = ChangeInitiation::findOrFail($id);

            $current = $parent->status;
            $allowed = self::ALLOWED_TRANSITIONS[$current] ?? [];
            if (! in_array($parentStatus, $allowed, true)) {
                throw new ApiException(
                    "Cannot transition package from '{$current}' to '{$parentStatus}'",
                    422,
                );
            }

            $parent->update(array_merge($parentExtra, ['status' => $parentStatus]));

            $impl = $parent->implementation;
            if ($impl) {
                $impl->update(array_merge($childExtra, [
                    'status' => self::CHILD_STATUS_MIRROR[$parentStatus],
                ]));
            }
        });
    }

    public function deletePackage(int $id): void
    {
        DB::transaction(function () use ($id) {
            $parent = ChangeInitiation::findOrFail($id);
            $impl = $parent->implementation;

            if ($impl) {
                // Attachments have no soft-delete; hard-delete rows only.
                $impl->attachments()->delete();
                $impl->delete();
            }

            $parent->delete();
        });
    }

    public function addAttachments(int $implementationId, array $paths): void
    {
        DB::transaction(function () use ($implementationId, $paths) {
            $sortOrder = ChangeImplementationAttachment::where('change_implementation_id', $implementationId)->count();

            foreach ($paths as $path) {
                ChangeImplementationAttachment::create([
                    'change_implementation_id' => $implementationId,
                    'path' => $path,
                    'sort_order' => $sortOrder++,
                ]);
            }
        });
    }

    /**
     * Single definition of package visibility, shared by paginatePackages and
     * packageVisibleTo: admin = all, kepala_tim/kepala_bidang = same team,
     * staf/default = own; kepala_* with a null team is denied by default.
     */
    private function applyVisibilityScope(Builder $query, ?User $actor): void
    {
        if (! $actor || $actor->hasRole(Roles::ADMIN)) {
            return;
        }

        if ($actor->hasAnyRole([Roles::KEPALA_TIM, Roles::KEPALA_BIDANG])) {
            // Team scope; null team sees nothing (deny-by-default).
            $actor->team_id === null
                ? $query->whereRaw('false')
                : $query->whereHas('initiator', fn ($q) => $q->where('team_id', $actor->team_id));

            return;
        }

        // staf / default: own packages only
        $query->where('initiator_id', $actor->id);
    }
}
