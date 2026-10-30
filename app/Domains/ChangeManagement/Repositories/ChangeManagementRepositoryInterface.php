<?php

namespace App\Domains\ChangeManagement\Repositories;

use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\Shared\Contracts\RepositoryInterface;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

interface ChangeManagementRepositoryInterface extends RepositoryInterface
{
    public function createPackage(array $initiation, array $implementation, array $typeIds): ChangeInitiation;

    public function updatePackage(int $id, array $initiation, array $implementation, array $typeIds): ChangeInitiation;

    public function findPackage(int $id): ?ChangeInitiation;

    public function packageVisibleTo(int $id, User $actor): ?ChangeInitiation;

    /** Key-only existence check (no relation hydration) for 404/403 disambiguation. */
    public function packageExists(int $id): bool;

    public function paginatePackages(int $perPage, array $filters, ?User $actor): LengthAwarePaginator;

    public function transitionPackage(int $id, string $parentStatus, array $parentExtra = [], array $childExtra = []): void;

    public function deletePackage(int $id): void;

    public function addAttachments(int $implementationId, array $paths): void;
}
