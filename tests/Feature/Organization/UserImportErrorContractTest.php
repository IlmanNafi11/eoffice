<?php

namespace Tests\Feature\Organization;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Maatwebsite\Excel\Facades\Excel as ExcelFacade;
use Tests\TestCase;

/**
 * Error-contract module (T6): user import separates file/validation errors
 * (422, client-fixable) from infrastructure errors (rethrown → 500 with the
 * generic message, full trace in the log — never a raw message).
 */
class UserImportErrorContractTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.debug' => false]);
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $this->admin = User::create([
            'team_id' => $team->id,
            'name' => 'Admin',
            'nip' => '0000000001',
            'email' => 'admin@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $this->admin->assignRole('admin');
    }

    public function test_corrupt_file_renders_422_not_500(): void
    {
        Sanctum::actingAs($this->admin);

        // Valid .xlsx extension, non-zip content — the reader throws
        // PhpOffice\PhpSpreadsheet\Reader\Exception.
        $file = UploadedFile::fake()->createWithContent('users.xlsx', 'not a real xlsx zip');

        $this->postJson('/api/admin/users/import', ['file' => $file])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Import gagal. Silakan periksa format file.');
    }

    public function test_invalid_row_content_renders_422_not_500(): void
    {
        Sanctum::actingAs($this->admin);

        $csv = "nama,nip,email,role\n"
            ."User Bad,0000000203,bad@test.com,superhero\n";
        $file = UploadedFile::fake()->createWithContent('users.csv', $csv);

        $this->postJson('/api/admin/users/import', ['file' => $file])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Import gagal. Silakan periksa format file.');
    }

    public function test_infrastructure_failure_renders_500_with_generic_message(): void
    {
        Sanctum::actingAs($this->admin);

        ExcelFacade::shouldReceive('import')
            ->andThrow(new QueryException(
                'pgsql',
                'select * from users',
                [],
                new \Exception('SQLSTATE[08006] connection refused'),
            ));

        $file = UploadedFile::fake()->createWithContent('users.csv', "nama,nip,email,role\nA,1,a@b.co,staf\n");

        $response = $this->postJson('/api/admin/users/import', ['file' => $file]);

        $response->assertStatus(500)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Terjadi kesalahan pada server.');

        $this->assertStringNotContainsString('08006', (string) $response->getContent());
    }
}
