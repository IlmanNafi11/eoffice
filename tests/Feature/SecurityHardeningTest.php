<?php

namespace Tests\Feature;

use App\Domains\ChangeManagement\Models\ChangeType;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        Cache::flush();
    }

    private function createAdmin(): User
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $admin = User::create([
            'team_id' => $team->id,
            'name' => 'Admin Test',
            'nip' => '0000000001',
            'email' => 'admin@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $admin->assignRole('admin');

        $field->update(['head_id' => $admin->id]);
        $team->update(['leader_id' => $admin->id]);

        return $admin;
    }

    private function createStaf(): User
    {
        $team = Team::first();

        $staf = User::create([
            'team_id' => $team->id,
            'name' => 'Staf Test',
            'nip' => '0000000002',
            'email' => 'staf@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $staf->assignRole('staf');

        return $staf;
    }

    public function test_security_headers_are_present_on_api_responses(): void
    {
        $this->getJson('/api/auth/login', [])
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
            ->assertHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    }

    /** Ship review: respons JSON terautentikasi memuat data pribadi (nama,
     *  NIP, aktivitas, URL foto) — jangan sampai tersimpan di cache browser/
     *  proxy. Selaras endpoint foto yang sudah `no-store`. */
    public function test_authenticated_json_responses_are_no_store(): void
    {
        $admin = $this->createAdmin();
        Sanctum::actingAs($admin);

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    /** Respons error terautentikasi (403/422) juga membawa konteks — sama
     *  perlakuan. Respons publik (login) tidak disentuh. */
    public function test_authenticated_json_error_responses_are_no_store(): void
    {
        $this->createAdmin(); // menyiapkan field + team untuk staf
        $staf = $this->createStaf();
        Sanctum::actingAs($staf);

        $response = $this->getJson('/api/admin/wfh/team-reports/1');
        $response->assertClientError()
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    /** Ship review #22: kondisi `no-store` bersifat konten-agnostik; health
     *  check tanpa data/sesi TIDAK boleh ikut dibekukan — regresi yang
     *  membuat kondisi itu tanpa syarat harus gagal di sini. */
    public function test_health_check_is_not_forced_to_no_store(): void
    {
        $response = $this->get('/up');

        $response->assertOk();
        $this->assertStringNotContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control'),
        );
    }

    /**
     * Guard posisi: satu-satunya environment tanpa CSP adalah `local`, karena
     * hanya di sana `vite dev` menyuntik script HMR inline dari dev-server
     * yang tidak lolos `script-src 'self'`. Semua environment lain — termasuk
     * staging/UAT/preview yang menyajikan bundel `vite build` — WAJIB memakai
     * CSP yang sama dengan production: mekanisme penyimpanan token
     * (localStorage) identik di sana.
     *
     * RED bila gate dikembalikan ke `production`-only: baris `testing` dan
     * `staging` di bawah gagal (itulah regresi "CSP kosong di staging").
     */
    public function test_content_security_policy_absent_only_in_local(): void
    {
        app()['env'] = 'local';
        $this->getJson('/up')->assertHeaderMissing('Content-Security-Policy');

        foreach (['testing', 'staging', 'production'] as $env) {
            app()['env'] = $env;
            $this->getJson('/up')
                ->assertHeader('Content-Security-Policy')
                ->assertHeader('Strict-Transport-Security');
        }
    }

    /**
     * Ship review: skrip anti-flash tema di app.blade.php adalah inline, jadi
     * tanpa hash/nonce CSP `script-src 'self'` menolaknya di semua env selain
     * local. Hitung hash dari isi skrip yang benar-benar dirender dan pastikan
     * sama dengan yang diizinkan header — bila skrip diubah tanpa mengubah
     * CSP, test ini RED (bukan bug diam yang hanya terlihat di browser).
     */
    public function test_csp_allows_the_rendered_inline_theme_script(): void
    {
        // Pin eksplisit (selaras uji di atas): APP_ENV dari runner (docker
        // compose = local) tidak ikut phpunit.xml, dan di local CSP sengaja
        // dilewati — uji hash harus berjalan di env yang memakai CSP.
        app()['env'] = 'testing';

        $shell = view('app')->render();
        preg_match('/<script>(.*?)<\/script>/s', $shell, $matches);
        $this->assertNotEmpty($matches[1], 'Shell harus memuat skrip anti-flash tema.');

        $hash = 'sha256-'.base64_encode(hash('sha256', $matches[1], true));

        $response = $this->get('/up');
        $response->assertOk();
        $this->assertStringContainsString(
            "'{$hash}'",
            $response->headers->get('Content-Security-Policy') ?? '',
        );
    }

    public function test_login_rate_limited_after_five_attempts(): void
    {
        $this->createAdmin();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => 'admin@test.com',
                'password' => 'wrong-password',
            ])->assertStatus(401);
        }

        // 6th attempt should be rate-limited (429)
        $this->postJson('/api/auth/login', [
            'email' => 'admin@test.com',
            'password' => 'wrong-password',
        ])->assertStatus(429);
    }

    public function test_user_creation_response_does_not_expose_temp_password(): void
    {
        $admin = $this->createAdmin();
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/admin/users', [
            'name' => 'New User',
            'nip' => '1234567890',
            'email' => 'newuser@test.com',
            'password' => 'SecurePass123',
            'roles' => ['staf'],
        ]);

        $response->assertStatus(201)
            ->assertJsonMissingPath('temp_password')
            ->assertJsonStructure(['data' => ['name', 'email']]);
    }

    public function test_staf_cannot_view_other_users_initiation(): void
    {
        $admin = $this->createAdmin();
        $field = Field::first();
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/changes', [
            'initiation' => [
                'field_id' => $field->id,
                'description' => 'Test change',
                'reason' => 'Testing',
            ],
            'implementation' => ['priority' => 'normal', 'impact' => 'Minor'],
        ]);
        $pkgId = $response->json('data.initiation.id');

        // Admin (initiator) can view
        $this->getJson("/api/changes/{$pkgId}")
            ->assertStatus(200);

        // Staf (no approve permission) cannot view another user's package
        $staf = $this->createStaf();
        Sanctum::actingAs($staf);

        $this->getJson("/api/changes/{$pkgId}")
            ->assertStatus(403);
    }

    public function test_staf_cannot_view_other_users_implementation(): void
    {
        $admin = $this->createAdmin();
        $field = Field::first();
        $changeType = ChangeType::create(['name' => 'Test Type']);
        Sanctum::actingAs($admin);

        // Create package → submit → approve
        $response = $this->postJson('/api/changes', [
            'initiation' => [
                'field_id' => $field->id,
                'description' => 'Test change',
                'reason' => 'Testing',
            ],
            'implementation' => ['priority' => 'normal', 'impact' => 'Minor'],
        ]);
        $pkgId = $response->json('data.initiation.id');

        $this->postJson("/api/changes/{$pkgId}/submit", [
            'initiation' => [
                'field_id' => $field->id,
                'description' => 'Test change',
                'reason' => 'Testing',
                'needed_by_date' => '2026-09-01',
            ],
            'implementation' => [
                'priority' => 'normal',
                'impact' => 'Minor',
                'change_type_ids' => [$changeType->id],
                'test_plan' => 'Test plan',
                'execution_date' => '2026-08-10',
                'release_date' => '2026-08-15',
                'implementation_result' => 'Done',
            ],
        ])->assertStatus(200);

        $supervisor = User::create([
            'team_id' => Team::first()->id,
            'name' => 'Supervisor',
            'nip' => '0000000003',
            'email' => 'sup@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $supervisor->assignRole('admin');
        Sanctum::actingAs($supervisor);

        $this->postJson("/api/changes/{$pkgId}/approve")
            ->assertStatus(200);

        // Admin (initiator) can view the package with completed implementation
        Sanctum::actingAs($admin);
        $this->getJson("/api/changes/{$pkgId}")
            ->assertJsonPath('data.implementation.status', 'completed')
            ->assertStatus(200);

        // Staf (no review permission) cannot view another user's package
        $staf = $this->createStaf();
        Sanctum::actingAs($staf);

        $this->getJson("/api/changes/{$pkgId}")
            ->assertStatus(403);
    }

    public function test_attachment_upload_rejects_more_than_ten_files(): void
    {
        $admin = $this->createAdmin();
        $field = Field::first();
        Sanctum::actingAs($admin);

        // Create draft package
        $response = $this->postJson('/api/changes', [
            'initiation' => [
                'field_id' => $field->id,
                'description' => 'Test',
                'reason' => 'Testing',
            ],
            'implementation' => ['priority' => 'normal', 'impact' => 'Minor'],
        ]);
        $pkgId = $response->json('data.initiation.id');

        // Upload 11 fake files — should fail validation (max:10)
        $files = [];
        for ($i = 0; $i < 11; $i++) {
            $files[$i] = UploadedFile::fake()->image("file{$i}.png", 100, 100);
        }

        $this->postJson("/api/changes/{$pkgId}/attachments", ['files' => $files])
            ->assertStatus(422);
    }
}
