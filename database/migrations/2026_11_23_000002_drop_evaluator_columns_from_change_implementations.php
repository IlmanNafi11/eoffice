<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Evaluator is now always the initiator (design decision #4): the
        // columns are a second source of truth, so they are dropped. Drop the
        // foreign key before the columns (Postgres requirement).
        Schema::table('change_implementations', function (Blueprint $table) {
            $table->dropForeign(['evaluator_id']);
        });

        Schema::table('change_implementations', function (Blueprint $table) {
            $table->dropColumn(['evaluator_id', 'evaluator_signed_at']);
        });
    }

    public function down(): void
    {
        // Data is not restored (agreed): the columns come back nullable and
        // empty, and any historical evaluator assignment is lost.
        Schema::table('change_implementations', function (Blueprint $table) {
            $table->foreignId('evaluator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('evaluator_signed_at')->nullable();
        });
    }
};
