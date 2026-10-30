<?php

namespace Database\Factories\Domains\Wfh\Models;

use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\Team;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class WfhTeamReportFactory extends Factory
{
    protected $model = WfhTeamReport::class;

    public function definition(): array
    {
        // status is non-fillable (SEC-07); the factory persists workflow state
        // through Model::unguarded(), so states below may set it safely.
        return [
            'team_id' => Team::factory(),
            'report_date' => now()->toDateString(),
            'created_by' => User::factory(),
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
