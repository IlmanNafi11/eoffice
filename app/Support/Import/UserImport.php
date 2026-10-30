<?php

namespace App\Support\Import;

use App\Models\Team;
use App\Models\User;
use App\Support\Users\DefaultPassword;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Maatwebsite\Excel\Concerns\ToModel;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadingRow;
use Maatwebsite\Excel\Concerns\WithValidation;
use Maatwebsite\Excel\Events\BeforeImport;
use Spatie\Permission\Models\Role;

class UserImport implements ToModel, WithEvents, WithHeadingRow, WithValidation
{
    public array $results = [
        'imported' => 0,
        'skipped' => 0,
        'errors' => [],
    ];

    public array $roleAssignments = [];

    private int $rowNumber = 1;

    private ?Collection $existingNips = null;

    private ?Collection $existingEmails = null;

    private ?Collection $teamIdsByName = null;

    private array $roleNames = [];

    public function model(array $row)
    {
        $this->primeIfNeeded();

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
        if (isset($this->existingNips[$nip])) {
            $this->results['skipped']++;
            $this->results['errors'][] = "Baris {$this->rowNumber}: NIP {$nip} sudah terdaftar.";

            return null;
        }

        // Skip duplicate email
        if (isset($this->existingEmails[$email])) {
            $this->results['skipped']++;
            $this->results['errors'][] = "Baris {$this->rowNumber}: Email {$email} sudah terdaftar.";

            return null;
        }

        // Resolve team id from the preloaded name map
        $teamId = $teamName !== '' ? ($this->teamIdsByName[$teamName] ?? null) : null;
        if ($teamName !== '' && $teamId === null) {
            $this->results['skipped']++;
            $this->results['errors'][] = "Baris {$this->rowNumber}: Tim '{$teamName}' tidak ditemukan.";

            return null;
        }

        $this->results['imported']++;

        // Determine default password from Setting based on role
        $defaultPassword = DefaultPassword::forRoles([$roleName]);

        $this->roleAssignments[$email] = $roleName;

        return new User([
            'team_id' => $teamId,
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

    public function registerEvents(): array
    {
        return [
            BeforeImport::class => fn () => $this->prime(),
        ];
    }

    public function rules(): array
    {
        if ($this->roleNames === []) {
            $this->roleNames = Role::pluck('name')->toArray();
        }

        return [
            'nama' => ['required', 'string', 'max:255'],
            'nip' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'role' => ['required', 'string', Rule::in($this->roleNames)],
            'tim' => ['nullable', 'string', 'max:255'],
            'telepon' => ['nullable', 'string', 'max:20'],
            'pangkat_golongan' => ['nullable', 'string', 'max:255'],
            'jabatan' => ['nullable', 'string', 'max:255'],
        ];
    }

    private function prime(): void
    {
        $this->existingNips = User::pluck('nip')->filter()->flip();
        $this->existingEmails = User::pluck('email')->filter()->flip();
        $this->teamIdsByName = Team::pluck('id', 'name');
        $this->roleNames = Role::pluck('name')->toArray();
    }

    private function primeIfNeeded(): void
    {
        if ($this->existingNips === null) {
            $this->prime();
        }
    }
}
