<?php

namespace Tests\Feature\Organization;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Testing\MimeType;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * POST /api/profile/signature (ship review #13: endpoint ini tanpa test sama
 * sekali). Kontrak UploadSignatureRequest:
 * - `mimes:png,jpg,jpeg` (sniff isi, bukan ekstensi),
 * - `max:2048` KB → pesan "Ukuran file maksimal 2MB.",
 * - `dimensions:max_width=2000,max_height=2000` → pesan dimensi,
 * - sukses → envelope ok + `signature_url`, berkas dinormalisasi service.
 */
class SignatureUploadTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);

        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $this->user = User::factory()->create(['team_id' => $team->id]);
    }

    private function upload(UploadedFile $file): TestResponse
    {
        return $this->actingAs(Sanctum::actingAs($this->user))
            ->postJson('/api/profile/signature', ['signature' => $file]);
    }

    /**
     * `UploadedFile::fake()` melaporkan ekstensi dari NAMA file
     * (`Illuminate\Http\Testing\File::$guessExtension`), sehingga `mimes` lolos
     * untuk nama .png apa pun. Untuk membuktikan sniff isi, pakai
     * Symfony UploadedFile nyata yang `guessExtension()`-nya membaca bytes +
     * `symfony/mime` (jalur yang sama dengan request produksi).
     */
    private function realUpload(string $bytes, string $name, string $clientMime): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'sig');
        file_put_contents($path, $bytes);
        $this->app->terminating(fn () => @unlink($path));

        return new UploadedFile($path, $name, $clientMime, null, true);
    }

    public function test_valid_png_signature_is_accepted_and_persists(): void
    {
        Storage::fake('local');

        $res = $this->upload(UploadedFile::fake()->image('ttd.png', 300, 100));

        $res->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Tanda tangan berhasil diunggah.')
            ->assertJsonStructure(['data' => ['signature_url']]);

        $user = $this->user->fresh();
        $this->assertNotNull($user->signature_path);
        Storage::disk('local')->assertExists($user->signature_path);
    }

    public function test_content_sniffing_rejects_php_disguised_as_png(): void
    {
        // Isi PHP murni dengan ekstensi .png: server harus menolak
        // (mimes sniff isi via guessExtension) — bukan mengandalkan nama.
        $file = $this->realUpload('<?php echo 1;', 'evil.png', 'image/png');

        $res = $this->upload($file);

        // `image` (getimagesize) menolak lebih dulu untuk isi non-gambar,
        // jadi pesannya boleh dari `image` atau `mimes` — yang dikunci test
        // adalah: nama .png palsu TIDAK membawa berkas ke service normalisasi.
        $res->assertStatus(422)
            ->assertJsonValidationErrors('signature');
        $this->assertContains($res->json('errors.signature.0'), [
            'File harus berupa gambar.',
            'Format file harus PNG, JPG, atau JPEG.',
        ]);
    }

    public function test_oversized_file_is_rejected_with_indonesian_message(): void
    {
        // 3MB > max:2048KB — pesan kustom server wajib terkunci (drift copy
        // client pre-check vs server tidak boleh lolos senyap).
        $res = $this->upload(UploadedFile::fake()->create(
            'ttd.png',
            3 * 1024,
            MimeType::from('ttd.png'),
        ));

        $res->assertStatus(422)
            ->assertJsonValidationErrors('signature')
            ->assertJsonPath('errors.signature.0', 'Ukuran file maksimal 2MB.');
    }

    public function test_dimensions_over_2000px_are_rejected(): void
    {
        $res = $this->upload(UploadedFile::fake()->image('ttd.png', 2400, 100));

        $res->assertStatus(422)
            ->assertJsonValidationErrors('signature')
            ->assertJsonPath('errors.signature.0', 'Dimensi gambar maksimal 2000x2000 pixel.');
    }

    public function test_missing_file_is_rejected(): void
    {
        $res = $this->actingAs(Sanctum::actingAs($this->user))
            ->postJson('/api/profile/signature', []);

        $res->assertStatus(422)
            ->assertJsonValidationErrors('signature')
            ->assertJsonPath('errors.signature.0', 'File tanda tangan wajib diunggah.');
    }
}
