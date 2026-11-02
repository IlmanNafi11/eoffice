<?php

namespace App\Domains\Organization\Repositories;

use App\Domains\Shared\Contracts\RepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

interface UserRepositoryInterface extends RepositoryInterface
{
    public function paginateWithRelations(int $perPage = 15, array $relations = ['team.field']): LengthAwarePaginator;

    /**
     * List active users, optionally scoped to one field (bidang). Users
     * without a team are always excluded — they cannot be a valid evaluator
     * (the evaluator rule requires a same-field team).
     */
    public function listActiveForField(?int $fieldId = null): Collection;
}
