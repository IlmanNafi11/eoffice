<?php

namespace App\Repositories;

use App\Domains\Shared\Contracts\RepositoryInterface;
use Illuminate\Database\Eloquent\Model;

abstract class EloquentRepository implements RepositoryInterface
{
    public function __construct(
        protected Model $model,
    ) {}

    public function find(int $id, array $columns = ['*'], array $relations = []): ?Model
    {
        return $this->model->with($relations)->find($id, $columns);
    }

    public function create(array $data): Model
    {
        return $this->model->create($data);
    }

    public function update(int $id, array $data): bool
    {
        $record = $this->model->find($id);

        if (! $record) {
            return false;
        }

        return $record->update($data);
    }

    public function delete(int $id): bool
    {
        $record = $this->model->find($id);

        if (! $record) {
            return false;
        }

        return $record->delete();
    }
}
