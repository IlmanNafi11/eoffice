<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Index for the dashboard `queue.implementations_review` count
 * (`QueueSection`): every request filters `change_implementations.status`
 * without an index on that column (the create-table migration only indexed
 * `change_initiation_id`), so the count was a full scan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('change_implementations', function (Blueprint $table) {
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::table('change_implementations', function (Blueprint $table) {
            $table->dropIndex(['status']);
        });
    }
};
