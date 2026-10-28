# SPEC-dedup-state

> Capability map: `CAPABILITY-MAP.md` → module id `dedup-state`. Depends on:
> `envelope`, `error-contract`, `authorization-consistency`.
> Root conventions: `SPEC.md`.

## Objective

Menghapus duplikasi aturan domain yang sekarang hidup di dua tempat — guard
otorisasi di controller vs scope SQL di repository, dan state machine kembar —
sehingga satu aturan bisnis punya satu definisi.

## In scope

### 1. Trait `EnsuresSameField`

Dua implementasi identik (`ReportApprovalController.php:24-37` vs
`TeamReportController.php:25-38`; beda hanya cara memperoleh `field_id` laporan).

Buat `app/Domains/Wfh/Http/Controllers/Concerns/EnsuresSameField.php`:

```php
trait EnsuresSameField
{
    /**
     * Null bila aktor dan laporan berada di bidang (field) yang sama.
     * @throws ApiException 403
     */
    private function ensureSameField(Request $request, int $reportFieldId): void
```

Pemanggil menyuplai `$reportFieldId` (`$report->user->team?->field_id` atau
`$report->team?->field_id`) — perbedaan data tetap di pemanggil, aturan tinggal
satu. Ganti `return $guard` di kedua controller dengan pemanggilan trait.

### 2. `ChangePackageDecision` — satu jalur approve/reject

`ChangePackageController::approve` (`:223-277`) dan `::reject` (`:279-331`)
simetris ±50 baris. Ekstrak ke `app/Domains/ChangeManagement/Services/ChangePackageDecision.php`:

```php
final class ChangePackageDecision
{
    public function decide(
        ChangeInitiation $package,
        User $actor,
        bool $approve,
        string $reason = '',
    ): ChangeInitiation;
}
```

Aturan bisnis (tidak berubah): self-approval dilarang (403), status harus
`pending` (422), aktor harus bisa mengakses paket (403). Controller tinggal
`authorize(...)` → panggil service → `ApiResponse::ok(...)`.

### 3. Base state machine

`TeamReportStateMachine::{approve,reject}` (`:10-34`) duplikat
`WfhReportStateMachine::{approve,reject}` (`:35-60`): guard status, update,
`verification_token ?? bin2hex(random_bytes(32))`, `fresh()`.

Buat `app/Domains/Wfh/Services/Concerns/TransitionsReportState.php` (trait) berisi
`assertPending()`, `approveTransition()`, `rejectTransition()`, `ensureVerificationToken()`,
lalu pakai di kedua state machine. Perbedaan yang dipertahankan:

- `TeamReportStateMachine::approve` juga menulis `supervisor_id` + `supervisor_signed_at`;
  `WfhReportStateMachine::approve` hanya `supervisor_signed_at`.
- `WfhReportStateMachine` punya `submit`/`revise`/`canEdit`/`isImmutable` — tetap.

### 4. `visibleTo($actor)` di repository

Aturan visibilitas paket ditulis dua kali: SQL di
`EloquentChangeManagementRepository::paginatePackages` (`:113-137`) dan PHP di
`ChangePackageController::actorCanAccessPackage` (`:378-390`).

Tambahkan ke `ChangeManagementRepositoryInterface`:

```php
public function packageVisibleTo(int $id, User $actor): ?ChangeInitiation;
```

Implementasi memakai scope yang sama dengan `paginatePackages` (admin → semua;
kepala_tim/kepala_bidang → satu tim; staf → milik sendiri; `team_id === null`
pada kepala_* → deny). Controller memanggil ini dan **menghapus**
`actorCanAccessPackage`. Hasil: satu definisi aturan.

### 5. Transisi invalid → exception domain

`EloquentChangeManagementRepository::transitionPackage` melempar
`InvalidArgumentException` yang bukan `ApiException`. Ganti kedua `throw`
(`:144`, `:153`) menjadi `ApiException(..., 422)` — sejalan dengan
`SPEC-error-contract.md` §5, sehingga controller tidak perlu try/catch dan 500
hilang.

## Out of scope

- Bentuk respons (modul `envelope`).
- Pemecahan controller gemuk (modul `dedup-http`).
- Resource user (modul `dedup-http`).

## Acceptance criteria

1. `grep -rn "private function ensureSameField"` → 1 hit (di trait).
2. `grep -rn "actorCanAccessPackage"` → 0 hit.
3. `ChangePackageController` tidak lagi memuat blok guard `pending`/self-approval
   inline; panjangnya turun di bawah 300 baris.
4. `grep -rn "verification_token ?? bin2hex"` → 1 hit (di trait state machine).
5. Tidak ada `InvalidArgumentException` di repository ChangeManagement.
6. Perilaku setara: seluruh test `SegregationOfDutiesTest`,
   `ChangePackageFlowTest`, `WfhReportStateMachineTest`, `TeamReportTest`,
   `KbSelfApproveTest` hijau (dengan penyesuaian 403 dari modul sebelumnya).
7. Suite penuh hijau.

## Verify

```bash
docker compose run --rm app php artisan test --compact
docker compose run --rm app php artisan test --compact --filter=ChangePackageFlowTest
docker compose run --rm app php artisan test --compact --filter=Wfh
docker compose run --rm app vendor/bin/pint --test
grep -rn "ensureSameField\|actorCanAccessPackage\|bin2hex" app --include=*.php
```

## Catatan risiko

- `ensureSameField` mengubah bentuk return (null/throw) di dua controller; pastikan
  semua call site (`approve`, `reject`, `submit`) menyesuaikan.
- Scope `visibleTo` harus identik dengan `paginatePackages`; kalau berbeda, satu
  user bisa melihat paket di `show` tapi tidak di `index`. Sertakan test
  konsistensi index-vs-show untuk ketiga role.
