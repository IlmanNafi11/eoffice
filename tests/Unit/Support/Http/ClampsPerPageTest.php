<?php

namespace Tests\Unit\Support\Http;

use App\Support\Http\Concerns\ClampsPerPage;
use Illuminate\Http\Request;
use Tests\TestCase;

class ClampsPerPageTest extends TestCase
{
    private object $controller;

    protected function setUp(): void
    {
        parent::setUp();

        $this->controller = new class
        {
            use ClampsPerPage;
        };
    }

    public function test_resolves_missing_per_page_to_the_default_fifteen(): void
    {
        $this->assertSame(15, $this->controller->perPage(new Request));
    }

    public function test_resolves_valid_per_page_unchanged(): void
    {
        $this->assertSame(1, $this->controller->perPage(new Request(['per_page' => '1'])));
        $this->assertSame(25, $this->controller->perPage(new Request(['per_page' => 25])));
        $this->assertSame(100, $this->controller->perPage(new Request(['per_page' => '100'])));
    }

    public function test_clamps_above_one_hundred_down_to_one_hundred(): void
    {
        $this->assertSame(100, $this->controller->perPage(new Request(['per_page' => '1000'])));
    }

    public function test_clamps_zero_and_negatives_up_to_one(): void
    {
        $this->assertSame(1, $this->controller->perPage(new Request(['per_page' => '0'])));
        $this->assertSame(1, $this->controller->perPage(new Request(['per_page' => '-5'])));
    }

    public function test_non_numeric_input_becomes_zero_and_clamps_to_one(): void
    {
        $this->assertSame(1, $this->controller->perPage(new Request(['per_page' => 'abc'])));
    }
}
