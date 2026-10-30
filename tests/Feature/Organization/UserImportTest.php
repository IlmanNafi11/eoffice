<?php

namespace Tests\Feature\Organization;

use App\Models\Field;
use App\Models\Setting;
use App\Models\Team;
use App\Models\User;
use App\Support\Import\UserImport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Maatwebsite\Excel\Facades\Excel;
use Maatwebsite\Excel\Validators\ValidationException;
use Tests\TestCase;

class UserImportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    public function test_import_with_role_column_creates_users_with_role(): void
    {
        $csv = "nama,nip,email,role\n"
            ."User Satu,0000000201,satu@test.com,staf\n"
            ."User Dua,0000000202,dua@test.com,kepala_tim\n";

        file_put_contents('/tmp/test_import.csv', $csv);

        $import = new UserImport;
        Excel::import($import, '/tmp/test_import.csv');

        $this->assertEquals(2, $import->results['imported']);

        $user1 = User::where('email', 'satu@test.com')->first();
        $this->assertNotNull($user1);
        $this->assertEquals('staf', $import->roleAssignments['satu@test.com']);
        $this->assertTrue($user1->must_change_password);
        $this->assertTrue(Hash::check(Setting::get('password_default_user', 'user1234'), $user1->password));

        $user2 = User::where('email', 'dua@test.com')->first();
        $this->assertNotNull($user2);
        $this->assertEquals('kepala_tim', $import->roleAssignments['dua@test.com']);
        $this->assertTrue($user2->must_change_password);
        $this->assertTrue(Hash::check(Setting::get('password_default_user', 'user1234'), $user2->password));
    }

    public function test_import_with_admin_role_uses_admin_default_password(): void
    {
        $csv = "nama,nip,email,role\n"
            ."Admin Satu,0000000301,adminimport@test.com,admin\n";

        file_put_contents('/tmp/test_import_admin.csv', $csv);

        $import = new UserImport;
        Excel::import($import, '/tmp/test_import_admin.csv');

        $this->assertEquals(1, $import->results['imported']);

        $user = User::where('email', 'adminimport@test.com')->first();
        $this->assertNotNull($user);
        $this->assertEquals('admin', $import->roleAssignments['adminimport@test.com']);
        $this->assertTrue($user->must_change_password);
        $this->assertTrue(Hash::check(Setting::get('password_default_admin', 'admin123'), $user->password));
    }

    public function test_import_with_invalid_role_triggers_validation_error(): void
    {
        $csv = "nama,nip,email,role\n"
            ."User Bad,0000000203,bad@test.com,superhero\n";

        file_put_contents('/tmp/test_import_invalid.csv', $csv);

        $import = new UserImport;

        try {
            Excel::import($import, '/tmp/test_import_invalid.csv');
            $this->fail('Expected validation exception was not thrown.');
        } catch (ValidationException $e) {
            $this->assertNotEmpty($e->errors());
        }
    }

    public function test_import_endpoint_returns_success_with_valid_data(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $admin = User::create([
            'team_id' => $team->id,
            'name' => 'Admin',
            'nip' => '0000000001',
            'email' => 'admin@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $admin->assignRole('admin');

        Sanctum::actingAs($admin);

        $csv = "nama,nip,email,role\n"
            ."User A,0000000101,a@test.com,staf\n"
            ."User B,0000000102,b@test.com,kepala_tim\n";

        $file = UploadedFile::fake()->createWithContent('users.csv', $csv);

        $response = $this->postJson('/api/admin/users/import', [
            'file' => $file,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['message', 'data']);
    }

    public function test_import_endpoint_queries_do_not_grow_linearly_per_row(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $admin = User::create([
            'team_id' => $team->id,
            'name' => 'Admin Import',
            'nip' => '0000000002',
            'email' => 'adminimport@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $csv2 = "nama,nip,email,role,tim\n"
            ."User A,0000000101,a@test.com,staf,Tim Test\n"
            ."User B,0000000102,b@test.com,kepala_tim,Tim Test\n";
        $csv6 = "nama,nip,email,role,tim\n"
            ."User C,0000000103,c@test.com,staf,Tim Test\n"
            ."User D,0000000104,d@test.com,kepala_tim,Tim Test\n"
            ."User E,0000000105,e@test.com,staf,Tim Test\n"
            ."User F,0000000106,f@test.com,kepala_tim,Tim Test\n"
            ."User G,0000000107,g@test.com,staf,Tim Test\n"
            ."User H,0000000108,h@test.com,kepala_tim,Tim Test\n";

        $q2 = $this->importAndCountQueries($csv2);
        $q6 = $this->importAndCountQueries($csv6);

        $this->assertLessThanOrEqual(
            $q6['insert'] - $q2['insert'],
            $q6['total'] - $q2['total'],
        );
    }

    private function importAndCountQueries(string $csv): array
    {
        $file = UploadedFile::fake()->createWithContent('users.csv', $csv);

        DB::enableQueryLog();
        DB::flushQueryLog();

        $this->postJson('/api/admin/users/import', ['file' => $file])->assertStatus(200);

        $log = DB::getQueryLog();
        DB::flushQueryLog();

        $insert = 0;
        foreach ($log as $entry) {
            if (str_starts_with(strtolower(ltrim($entry['query'])), 'insert')) {
                $insert++;
            }
        }

        return ['total' => count($log), 'insert' => $insert];
    }
}
