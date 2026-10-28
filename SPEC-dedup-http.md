# SPEC-dedup-http

> Capability map: `CAPABILITY-MAP.md` → module id `dedup-http`. Depends on:
> `envelope`, `authorization-consistency`. Root conventions: `SPEC.md`.

## Objective

Menghapus duplikasi di lapisan HTTP dan memecah controller yang memikul terlalu
banyak tanggung jawab (SRP), serta menutup kebocoran `verification_token`.

## In scope

### 1. Satu bentuk payload user (hapus drift)

Dua definisi bentuk user yang sudah **menyimpang**:

- `app/Domains/Auth/Concerns/FormatsUserPayload.php:8-52` — punya `signature_url`,
  `must_change_password`, `permissions` (semua izin), `team.leader`.
- `app/Domains/Organization/Http/Resources/UserResource.php:10-46` — punya
  `direct_permissions`, `created_at`; **tanpa** `signature_url`/`must_change_password`.

Keputusan: **`UserResource` jadi satu-satunya sumber**, diperluas dengan
`signature_url` + `must_change_password` + `permissions` (gabungan izin peran,
karena klien butuh untuk menyusun menu). `FormatsUserPayload` dihapus;
`AuthController::login`/`me` dan `ProfileController::show`/`update` memakai
`new UserResource($user)`.

`UserController` tetap memakai `UserResource` (field `permissions` konsisten
untuk admin view; `direct_permissions` dihapus karena tidak dipakai klien mana
pun — SPA belum ada).

**Acceptance bentuk:** satu test baru meng-assert bahwa payload
`GET /api/auth/me` dan `GET /api/admin/users/{id}` memuat himpunan kunci yang
sama untuk kunci bersamanya (`id,name,nip,email,rank,position,phone,signature_path,
signature_url,must_change_password,is_active,roles,permissions,team`).

### 2. `verification_token` keluar dari resource

`WfhReportResource.php:19` mengekspos `verification_token` ke setiap pembaca
(termasuk viewer monitoring). Token itu rahasia verifikasi QR publik.

- Hapus `'verification_token'` dari `WfhReportResource`.
- PDF (satu-satunya konsumen sah) mengambil token langsung dari model di
  `ReportPdfController` — sudah begitu (`$report->verification_token`), jadi tidak
  ada perubahan di sana.
- Test baru: `GET /api/admin/wfh/reports` dan `GET /api/wfh/reports/{id}` tidak
  memuat `verification_token` pada level mana pun di `data`.
- Verifikasi QR publik (`GET /verify/{token}`) tidak berubah.

### 3. Service resolusi signature + builder view-data PDF

Duplikasi: `ChangeManagementPdfController::resolveSignature()` (`:178`) vs
`ReportPdfController` yang meng-inline `public_path('storage/'.$path)` (`:76-87`,
`:168-181`).

Buat `app/Support/Signature/SignaturePath.php`:

```php
final class SignaturePath
{
    /** Path absolut untuk dompdf, atau '' bila tidak ada. */
    public static function resolve(?string $relative): string;
}
```

Pakai di ketiga tempat (`ReportPdfController`, `ChangeManagementPdfController`,
`SpikeController` — yang terakhir dihapus oleh modul `dead-code`).

Susun data PDF ke `app/Domains/Wfh/Services/WfhReportPdfData.php` dan
`app/Domains/ChangeManagement/Services/ChangePackagePdfData.php` sehingga
controller tinggal: authorize → guard → `$pdfRenderer->render($view, $data)`.
`ReportPdfController` (218 ln) turun di bawah 120 ln.

### 4. Pecah controller gemuk

| Controller | Sekarang | Aksi |
|---|---|---|
| `ChangePackageController` | 391 ln, 10 public | Setelah modul `dedup-state` mengekstrak keputusan, sisakan CRUD + submit + attachments; pindahkan penyusunan resource list ke `ChangePackageResource` (sudah ada) dan guard ke repo `visibleTo`. Target < 250 ln. |
| `ReportController` | 264 ln, 7 public | Ekstrak `resolveAdminBounds`/`paginatedReportResponse` yang sudah ada ke `app/Domains/Wfh/Http/Controllers/Concerns/RespondsWithReports.php` (dipakai juga `WfhMonitoringController` bila relevan). |
| `ChangeManagementPdfController` | 212 ln | Setelah §3, target < 120 ln. |
| `UserController` | 185 ln | Setelah §1 dan pemakaian `ApiResponse`, target < 150 ln. |

Batas: **tidak** memecah controller menjadi satu kelas per aksi; hanya menarik
tanggung jawab non-HTTP keluar.

### 5. `POST /changes/{id}/attachments` respons

Kembalikan `ImplementationResource`-style untuk lampiran (`id`, `url`, `path`,
`sort_order`), bukan koleksi Eloquent mentah (`ChangePackageController.php:369-372`).

## Out of scope

- Aturan visibilitas/otorisasi (modul `dedup-state`, `authorization-consistency`).
- Bentuk envelope (modul `envelope`).
- Query/N+1 (modul `query-hygiene`).

## Acceptance criteria

1. `grep -rn "FormatsUserPayload"` → 0 hit (trait dihapus).
2. Test kontrak kunci user: `/auth/me` dan `/admin/users/{id}` konsisten (§1).
3. `grep -rn "verification_token" app/Domains/Wfh/Http/Resources/` → 0 hit.
4. Test baru: respons laporan (detail & admin list) tanpa `verification_token`.
5. `grep -rn "public_path('storage/" app/` → hanya di `SignaturePath`.
6. `ReportPdfController` < 120 ln, `ChangeManagementPdfController` < 120 ln,
   `ChangePackageController` < 250 ln, `UserController` < 150 ln.
7. Lampiran memakai resource ber-`url`.
8. Suite penuh hijau; test PDF (`TeamReportPdfTest`, `WfhReportPdfTest`, dsb.)
   tetap lulus tanpa perubahan perilaku.

## Verify

```bash
docker compose run --rm app php artisan test --compact
docker compose run --rm app php artisan test --compact --filter=Pdf
docker compose run --rm app php artisan test --compact --filter=Auth
docker compose run --rm app vendor/bin/pint --test
wc -l app/Domains/*/Http/Controllers/*.php
```

## Catatan risiko

- Menghapus `verification_token` dari resource bisa memutus test PDF yang
  mengambil token dari respons API, bukan dari model — periksa
  `tests/Feature/Wfh/TeamReportPdfTest.php` dan `QrVerificationTest.php`.
- Menggabungkan payload user mengubah kunci `direct_permissions` →
  `permissions`; `RbacManagementTest` dan `SmokeTest` meng-assert kunci ini —
  perbarui assertion, jangan hapus test.
