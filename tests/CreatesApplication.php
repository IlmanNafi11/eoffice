<?php

namespace Tests;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;

trait CreatesApplication
{
    /**
     * Creates the application.
     */
    public function createApplication(): Application
    {
        $app = require __DIR__.'/../bootstrap/app.php';

        $app->make(Kernel::class)->bootstrap();

        /*
         * Test-database isolation.
         *
         * The suite relies on RefreshDatabase: migrate:fresh once per process,
         * then a transaction per test. Sharing one database across concurrent
         * processes lets one process's migrate:fresh drop tables under another's
         * feet ("relation ... does not exist", "drop table" deadlocks) — the
         * source of the intermittent 42P01/40P01 failures in ship reviews.
         *
         * Give every process its own database. The test role holds CREATEDB,
         * and the database is dropped again when the process shuts down.
         */
        if ($app->environment('testing')) {
            $this->isolateTestDatabase();
        }

        return $app;
    }

    /**
     * Point this process at a dedicated database and create it if missing.
     *
     * Falls back to the configured database when the admin connection or
     * CREATEDB privilege is unavailable (e.g. CI roles without the privilege);
     * the shared database still works, just without cross-process isolation.
     */
    protected function isolateTestDatabase(): void
    {
        $connection = config('database.default');
        $config = config("database.connections.$connection");

        if (($config['driver'] ?? null) !== 'pgsql') {
            return; // sqlite and friends are already process-local.
        }

        $isolated = $config['database'].'__'.getmypid();

        $admin = $config;
        $admin['database'] = 'postgres';

        $dsn = sprintf(
            'pgsql:host=%s;port=%s;dbname=postgres',
            $admin['host'],
            $admin['port'],
        );

        try {
            $pdo = new \PDO($dsn, $admin['username'], $admin['password'], [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            ]);

            $exists = $pdo->query(
                'select 1 from pg_database where datname = '.$pdo->quote($isolated)
            )->fetchColumn();

            if (! $exists) {
                $pdo->exec('create database '.$isolated);
            }
        } catch (\PDOException) {
            return; // No CREATEDB / unreachable admin connection: stay on the shared DB.
        }

        $config['database'] = $isolated;
        config(["database.connections.$connection" => $config]);

        register_shutdown_function(function () use ($dsn, $admin, $isolated): void {
            try {
                $pdo = new \PDO($dsn, $admin['username'], $admin['password'], [
                    \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                ]);

                $pdo->exec('drop database if exists '.$isolated.' with (force)');
            } catch (\Throwable) {
                // Best effort: a leftover per-process database never breaks a run.
            }
        });
    }
}
