# Spec: field-user-picker

> Modul dari capability map 2026-11-02 (backend issues #1 & #2). Menutup
> [issue #1](https://github.com/IlmanNafi11/eoffice/issues/1). Intent:
> `docs/intent/backend-qr-spa-and-evaluator-picker.md`.

## Objective

FE modul `change-package` butuh daftar user untuk **picker evaluator** tanpa
mengirim `evaluator_id = null` (REQuery #1, `SPEC-change-package.md:319-325`).
Endpoint admin `GET /admin/users` di-gate `permission:user.manage`, sehingga
kepala tim/staf pembuat paket selalu 403. Disediakan endpoint baru:
**`GET /api/users`** — read-only, least-privilege, di-scope bidang.

## Tech Stack

Laravel 11 (PHP 8.4), Spatie permission, Sanctum auth — mengikuti semua pola
domain `Organization` yang sudah ada. Tidak ada dependency baru.

## Kontrak

| Aspek | Aturan |
|-------|--------|
| Path | `GET /api/users` (grup `auth:sanctum` + `password.changed`) |
| Permission | **Tidak ada** middleware permission — visible untuk semua user terautentikasi; scoping di controller (pola persis `TeamController::index`) |
| Scope non-admin | hanya user `is_active` di bidang sendiri (`team.field_id`); user tanpa tim/bidang → koleksi kosong; param `field_id` **diabaikan** |
| Scope admin / `user.manage` | boleh `?field_id=` (kosong = semua bidang); tetap filter `is_active` |
| Respons | `ApiResponse::ok(UserResource::collection($users))` — non-paginated (konsisten modul `dedup-http`) |

**Alasan filter `is_active` di semua kasus:** `ChangePackageRules::evaluatorRule`
menolak evaluator non-aktif (422), jadi menampilkannya di picker hanya
menghasilkan pilihan pasti-gagal.

## Perubahan

| # | File | Perubahan |
|---|------|-----------|
| 1 | `app/Domains/Organization/Repositories/UserRepositoryInterface.php` | Tambah `listActiveForField(?int $fieldId): Collection` |
| 2 | `app/Domains/Organization/Repositories/EloquentUserRepository.php` | Implement: `where('is_active', true)` + optional `whereTeam field` + eager-load `team.field` + `roles.permissions` + `permissions` (hindari N+1 `UserResource`) |
| 3 | `app/Domains/Organization/Http/Controllers/UserController.php` | Tambah method `indexForField(Request)` dengan scoping (pola `TeamController::index`) |
| 4 | `routes/api.php` (dekat `GET /teams` :54) | `Route::get('/users', [UserController::class, 'indexForField']);` |
| 5 | `postman/specs/openapi.yaml` | Operation baru `/api/users` + response schema (reuse `UserListResponse` / `UserResource`) + bump versi |
| 6 | `CHANGELOG.md` (Unreleased/Added) | Entri endpoint baru |

## Testing Strategy

TDD — RED dulu, satu commit. File test baru
`tests/Feature/Organization/FieldUserPickerEndpointTest.php` (mirror
`TeamEndpointTest`):

| Test | Assert |
|------|--------|
| guest → 401 | `getJson('/api/users')->assertUnauthorized()` |
| staf hanya bidang sendiri | aktif bidang A saja terlihat; user bidang B & non-aktif tidak |
| param `field_id` diabaikan non-admin | `?field_id=other` tetap bidang sendiri |
| admin melihat semua bidang | count = semua user aktif |
| admin `?field_id=` filter bekerja | hanya bidang itu |
| `user.manage` melihat semua | sama dengan admin |
| user tanpa tim/bidang → `data: []` | koleksi kosong |
| non-aktif tidak pernah muncul (non-admin & admin) | filter `is_active` di kedua jalur |
| query flat (no N+1) | pattern `AdminUserListQueryCountTest`: query `model_has_permissions` flat saat rows bertambah |

## Acceptance Criteria

- AC1: Route openapi baru + response schema; `GET /api/users` ada di `routes/api.php`.
- AC2: Non-admin (kepala tim/staf) menerima 200 dengan user bidangnya, tanpa
  permission `user.manage`.
- AC3: FE dapat memakai daftar ini untuk picker evaluator tanpa perubahan
  arsitektur (resource `id,name,nip,team` konsisten `UserResource`).
- AC4: `vendor/bin/pint --test` clean; suite penuh hijau.

## Verify

```bash
php artisan test --compact
php artisan test --filter=FieldUserPickerEndpointTest
vendor/bin/pint --test
```

## Boundaries

- Always: least-privilege (scope bidang), `is_active` filter, `UserResource`,
  no N+1.
- Ask first: menambah permission RBAC baru/seeder; menambah field resource.
- Never: mengubah `UserResource` shape; menyentuh middleware `permission:user.manage`.

## Open Questions

None — keputusan dikunci oleh interview + issue.