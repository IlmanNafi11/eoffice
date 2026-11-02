<?php

namespace App\Domains\Organization\Repositories;

use App\Models\User;
use App\Repositories\EloquentRepository;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

class EloquentUserRepository extends EloquentRepository implements UserRepositoryInterface
{
    public function __construct(User $model)
    {
        parent::__construct($model);
    }

    public function paginateWithRelations(int $perPage = 15, array $relations = ['team.field']): LengthAwarePaginator
    {
        return $this->model->with($relations)->paginate($perPage);
    }

    public function listActiveForField(?int $fieldId = null): Collection
    {
        $query = $this->model->newQuery()->where('is_active', true);

        if ($fieldId !== null) {
            $query->whereHas('team', fn ($team) => $team->where('field_id', $fieldId));
        } else {
            $query->has('team');
        }

        return $query
            ->with(['team.field', 'roles.permissions', 'permissions'])
            ->get();
    }
}
