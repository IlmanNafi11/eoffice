<?php

namespace Tests\Unit\Shared;

use App\Domains\Shared\Contracts\RepositoryInterface;
use App\Repositories\EloquentRepository;
use ReflectionClass;
use Tests\TestCase;

class RepositoryDeadCodeTest extends TestCase
{
    public function test_repository_interface_exposes_only_the_four_core_crud_methods(): void
    {
        $names = collect((new ReflectionClass(RepositoryInterface::class))->getMethods())
            ->map(fn ($m) => $m->getName())
            ->sort()
            ->values()
            ->all();

        $this->assertSame(['create', 'delete', 'find', 'update'], $names);
    }

    public function test_base_repository_no_longer_offers_unused_read_methods(): void
    {
        $reflection = new ReflectionClass(EloquentRepository::class);

        foreach (['all', 'paginate', 'findBy', 'restore'] as $removed) {
            $this->assertFalse(
                $reflection->hasMethod($removed),
                "EloquentRepository must not expose the removed method {$removed}()."
            );
        }
    }
}
