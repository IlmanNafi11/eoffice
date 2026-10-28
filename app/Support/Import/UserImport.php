<?php

namespace App\Support\Import;

use App\Models\Setting;
use App\Models\Team;
use App\Models\User;
use App\Support\Constants\Roles;
use Illuminate\Validation\Rule;
use Maatwebsite\Excel\Concerns\ToModel;
use Maatwebsite\Excel\Concerns\WithHeadingRow;
use Maatwebsite\Excel\Concerns\WithValidation;
use Spatie\Permission\Models\Role;

class UserImport implements ToModel, WithHeadingRow, WithValidation
{
    public array $results = [
        'imported' => 0,
        'skipped' => 0,
        'errors' => [],
    ];

    public array $roleAssignments = [];

    private int $rowNumber = 1;

    public function model(array $row)
    {
        $this->rowNumber++;

        $nip = trim($row['nip'] ?? '');
        $email = trim($row['email'] ?? '');
        $name = trim($row['nama'] ?? '');
        $teamName = trim($row['tim'] ?? '');
        $roleName = trim($row['role'] ?? '');

        // Skip if required fields missing
        if (empty($nip) || empty($email) || empty($name)) {
            $this->results['skipped']++;
            $this->results['errors'][] = "Baris {$this->rowNumber}: Data tidak lengkap (nama/nip/email kosong).";

            return null;
        }

        // Skip duplicate NIP
        if (User::where('nip', $nip)->exists()) {
            $this->results['skipped']++;
            $this->results['errors'][] = "Baris {$this->rowNumber}: NIP {$nip} sudah terdaftar.";

            return null;
        }

        // Skip duplicate email
        if (User::where('email', $email)->exists()) {
            $this->results['skipped']++;
            $this->results['errors'][] = "Baris {$this->rowNumber}: Email {$email} sudah terdaftar.";

            return null;
        }

        // Find team by name
        $team = Team::where('name', $teamName)->first();
        if ($teamName && ! $team) {
            $this->results['skipped']++;
            $this->results['errors'][] = "Baris {$this->rowNumber}: Tim '{$teamName}' tidak ditemukan.";

            return null;
        }

        $this->results['imported']++;

        // Determine default password from Setting based on role
        $hasAdmin = $roleName === Roles::ADMIN;
        $defaultPassword = $hasAdmin
            ? Setting::get('password_default_admin', 'admin123')
            : Setting::get('password_default_user', 'user1234');

        $this->roleAssignments[$email] = $roleName;

        return new User([
            'team_id' => $team?->id,
            'name' => $name,
            'nip' => $nip,
            'email' => $email,
            'phone' => trim($row['telepon'] ?? ''),
            'rank' => trim($row['pangkat_golongan'] ?? ''),
            'position' => trim($row['jabatan'] ?? ''),
            'password' => $defaultPassword,
            'must_change_password' => true,
            'is_active' => true,
        ]);
    }

    public function rules(): array
    {
        $roleNames = Role::pluck('name')->toArray();

        return [
            'nama' => 'required|string',
            'nip' => 'required|string',
            'email' => 'required|email',
            'role' => ['required', 'string', Rule::in($roleNames)],
        ];
    }
}
