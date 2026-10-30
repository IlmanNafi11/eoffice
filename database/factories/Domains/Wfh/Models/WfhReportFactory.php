<?php

namespace Database\Factories\Domains\Wfh\Models;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class WfhReportFactory extends Factory
{
    protected $model = WfhReport::class;

    public function definition(): array
    {
        // status is non-fillable (SEC-07); the factory persists workflow state
        // through Model::unguarded(), so states below may set it safely.
        return [
            'user_id' => User::factory(),
            'report_date' => now()->toDateString(),
        ];
    }

    public function status(string $status): static
    {
        return $this->state(fn () => ['status' => $status]);
    }

    public function approved(): static
    {
        return $this->status('approved');
    }

    public function pending(): static
    {
        return $this->status('pending');
    }

    public function rejected(): static
    {
        return $this->status('rejected');
    }
}
