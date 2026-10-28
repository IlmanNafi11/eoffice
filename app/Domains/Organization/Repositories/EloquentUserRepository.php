<?php

namespace App\Domains\Organization\Repositories;

use App\Models\User;
use App\Repositories\EloquentRepository;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

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
}
