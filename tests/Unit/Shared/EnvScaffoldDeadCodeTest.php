<?php

namespace Tests\Unit\Shared;

use Tests\TestCase;

/**
 * A16: the skeleton's `.env.example` and the config blocks that exist only to
 * feed it advertise infrastructure this application cannot use — there is no
 * Redis client, no AWS SDK, no Memcached extension, no Pusher and no SMTP
 * relay. Every declared variable must be read by real code, and no config
 * block may point at a backend that has no client installed.
 */
class EnvScaffoldDeadCodeTest extends TestCase
{
    /**
     * Variables read outside `config/`: the Resend package merges its own
     * config (`services.resend.key`) and Vite inlines `VITE_*` at build time.
     */
    private const EXTERNAL_ENV_KEYS = [
        'RESEND_API_KEY',
        'VITE_APP_NAME',
    ];

    public function test_env_example_declares_only_variables_that_are_actually_read(): void
    {
        $allowed = array_merge($this->envKeysReadByConfig(), self::EXTERNAL_ENV_KEYS);

        $this->assertSame(
            [],
            array_values(array_diff($this->envExampleKeys(), $allowed)),
            '.env.example must not advertise variables that nothing reads.'
        );
    }

    /**
     * Laravel 11 merges the framework's own default config underneath the
     * application's files, so `config()` always reports the scaffold blocks
     * back. The application-owned contract is the file content itself: these
     * are the declarations that must stop naming backends with no client.
     */
    public function test_config_files_stop_declaring_backends_without_a_client(): void
    {
        $this->assertArrayNotHasKey(
            'redis',
            $this->declaredConfig('database.php'),
            'config/database.php declares a Redis connection set, but no Redis client is installed.'
        );

        $this->assertSame(
            [],
            array_values(array_intersect(
                array_keys($this->declaredConfig('cache.php')['stores']),
                ['memcached', 'redis', 'dynamodb']
            )),
            'config/cache.php declares stores whose backends have no client installed.'
        );

        $this->assertSame(
            [],
            array_values(array_intersect(
                array_keys($this->declaredConfig('queue.php')['connections']),
                ['sqs', 'redis']
            )),
            'config/queue.php declares connections whose backends have no client installed.'
        );

        $this->assertArrayNotHasKey(
            's3',
            $this->declaredConfig('filesystems.php')['disks'],
            'config/filesystems.php declares an S3 disk, but no AWS SDK is installed.'
        );

        $this->assertSame(
            [],
            array_values(array_intersect(
                array_keys($this->declaredConfig('mail.php')['mailers']),
                ['smtp', 'ses', 'postmark', 'mailgun', 'failover', 'roundrobin']
            )),
            'config/mail.php declares external-service mailers the application never sends through.'
        );
    }

    public function test_services_config_keeps_no_credentials_for_unused_transports(): void
    {
        $this->assertSame(
            [],
            array_values(array_intersect(
                array_keys($this->declaredConfig('services.php')),
                ['mailgun', 'postmark', 'ses']
            )),
            'config/services.php keeps credentials for transports nothing sends through.'
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function declaredConfig(string $file): array
    {
        return (static fn () => require config_path($file))();
    }

    private function envExampleKeys(): array
    {
        $keys = [];

        $lines = file(base_path('.env.example'), FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

        foreach ($lines as $line) {
            $line = trim($line);

            if ($line === '' || str_starts_with($line, '#') || ! str_contains($line, '=')) {
                continue;
            }

            $keys[] = explode('=', $line, 2)[0];
        }

        return array_values(array_unique($keys));
    }

    /**
     * @return list<string>
     */
    private function envKeysReadByConfig(): array
    {
        $keys = [];

        foreach (glob(config_path('*.php')) as $file) {
            preg_match_all("/env\(\s*'([A-Z0-9_]+)'/", file_get_contents($file), $matches);
            $keys = array_merge($keys, $matches[1]);
        }

        return array_values(array_unique($keys));
    }
}
