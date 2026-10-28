<?php

namespace App\Domains\Shared\Contracts;

use Illuminate\Database\Eloquent\Model;

interface RepositoryInterface
{
    public function find(int $id, array $columns = ['*'], array $relations = []): ?Model;

    public function create(array $data): Model;

    public function update(int $id, array $data): bool;

    public function delete(int $id): bool;
}
