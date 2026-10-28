# SPEC-authorization-consistency

> Capability map: `CAPABILITY-MAP.md` → module id `authorization-consistency`.
> Depends on: `envelope`. Root conventions: `SPEC.md`.

## Objective

Menyelaraskan semantik otorisasi: status code mencerminkan jenis pelanggaran
(authorization vs state vs keberadaan), urutan guard seragam di semua aksi, dan
setiap operasi punya permission yang bermakna sesuai verb-nya.

## Aturan status (final)

| Jenis pelanggaran | Status | Contoh |
|---|---|---|
| Tidak terautentikasi | 401 | tanpa token |
| Tidak berizin / bukan pemilik / self-approval | **403** | staf meng-approve milik sendiri |
| Resource tidak ada | 404 | paket tidak ditemukan |
| State/precondition tidak valid | 422 | submit paket yang bukan draft |
| Payload tidak valid | 422 + `errors` | field wajib kosong |

**Self-approval → 403.** Ini eksplisit: aturan bisnis "tidak boleh self-approval"
tetap, hanya representasinya berubah dari 422 menjadi 403 karena ini pelanggaran
otorisasi, bukan validasi input.

## In scope

### 1. Self-approval → 403

- `ChangePackageController::approve` (`:236-241`) dan `::reject` (`:292-297`):
  `throw new ApiException('Inisiator tidak dapat menyetujui/menolak paketnya sendiri.', 403)`.
- Update test: `tests/Feature/SegregationOfDutiesTest.php:238` dan `:255` →
  `assertStatus(403)`; `assertJsonPath('success', false)` dipertahankan.
- Periksa seluruh test lain yang meng-assert 422 untuk self-approval:
  `grep -rn "cannot_approve_own\|cannot_reject_own\|self_approve" tests/`.

### 2. Urutan guard seragam

Urutan baku untuk setiap aksi yang menyentuh satu resource:

```
1. authorize(permission)      → 403
2. resolusi resource          → 404
3. cek kepemilikan/peran      → 403
4. cek state/precondition     → 422
5. eksekusi
```

Terapkan ke: `ChangePackageController` (`show`, `update`, `destroy`, `submit`,
`approve`, `reject`, `uploadAttachments`), `ReportController` (`show`, `update`,
`destroy`), `ReportApprovalController` (`submit`, `approve`, `reject`, `revise`),
`TeamReportController` (`index`, `store`, `approve`, `reject`), `UserController`
(`show`, `update`, `destroy`).

Temuan yang harus tertutup: `approve`/`reject` paket memeriksa self-approval
sebelum access (sekarang `:236-254` vs `:82-91`).

### 3. Endpoint terbuka — least privilege

| Endpoint | Sekarang | Menjadi |
|---|---|---|
| `GET /teams` (`:47`) | semua user terautentikasi, semua tim | hanya tim dalam **bidang** user; `admin`, `wfh.monitoring.view`, `user.manage` melihat semua. **Q2 RESOLVED:** `kepala_tim`/`kepala_bidang` melihat **seluruh bidang** (bukan hanya tim yang dipimpin). Parameter `field_id` hanya dihormati untuk admin. |
| `GET /wfh/session-config` (`:76`) | semua user terautentikasi | **tetap** tanpa permission — dibutuhkan form absensi setiap user. Terverifikasi: SPA (`resources/js/Root.jsx`, 11 baris) belum memanggil API apa pun. Perbaikan yang relevan hanya envelope (modul `envelope`). Kedua field (`sessions`, `allowed_days`) dipertahankan. |
| `GET /wfh/reports/{report}` (`:81`) | tanpa permission, guard di controller | **pertahankan** guard pemilik-atau-`wfh.monitoring.view` (middleware akan memblokir pemilik tanpa permission khusus). Test eksplisit: pengguna lain → 403, pemilik → 200, monitoring → 200. |

### 4. Permission bermakna sesuai verb

Tambah di `RolePermissionSeeder` + pakai di `routes/api.php`:

| Permission baru | Route |
|---|---|
| `wfh.report.activity.delete` | `DELETE /wfh/reports/{report}/activities/{activity}` (`:92`) |
| `wfh.report.attendance.delete` | `DELETE /wfh/reports/{report}/attendances/{attendance}` (`:100`) |
| `change.initiation.delete` | `DELETE /changes/{id}` (`:140`) |

**Q1 RESOLVED — assignment:** ketiga permission delete di atas diberikan ke
`staf`, `kepala_tim`, `kepala_bidang`, dan `admin` (staf boleh menghapus
kegiatan/absensi miliknya sendiri). Permission **bukan** pengganti guard:
`authorizeEdit` (kepemilikan + status draft/rejected) tetap dijalankan lebih dulu
sehingga staf tidak bisa menghapus data orang lain atau data laporan terkunci.

Permission yang sudah ada tapi belum dipakai route — **pakai**:

| Permission | Route |
|---|---|
| `wfh.report.submit` | `POST /wfh/reports/{report}/submit` (`:103`) |
| `wfh.attendance.create` | `POST /wfh/reports/{report}/attendances` (`:97`) |
| `user.create/update/delete` | `/admin/users` (`:50-54`) menggantikan `user.manage` untuk aksi spesifik |
| `change.implementation.create/submit/review/view` | aksi implementasi yang setara (`:148`, PDF implementasi) |

`POST /wfh/reports/{report}/revise` (`:108`) → gunakan `wfh.report.update`
(keputusan: revisi = edit pemilik atas laporan yang ditolak).

### 5. Permission seed mati

Setelah §4, hapus dari seeder hanya permission yang **benar-benar** tetap tak
dirujuk. Target saat ini:

```
field.manage      (jika tidak dipakai route mana pun)
team.manage
```

Sisanya (`user.*`, `change.implementation.*`, `wfh.attendance.create`,
`wfh.report.submit`) **dipakai** lewat §4 → tidak dihapus. Verifikasi dengan:

```bash
seeded=$(grep -oE "'[a-z]+\.[a-z_.]+'" database/seeders/RolePermissionSeeder.php | tr -d "'" | sort -u)
used=$(grep -rhoE "permission:[a-z_.]+" routes app | sed 's/permission://' | sort -u)
comm -23 <(echo "$seeded") <(echo "$used")
```

Hasil akhir harus kosong (atau hanya berisi permission yang secara eksplisit
dipertahankan untuk masa depan — **tidak boleh** tanpa alasan tertulis).

Test wajib baru: `GET /api/teams` sebagai staf hanya mengembalikan tim bidangnya.

### 6. `verification_token`

Pindah ke modul `dedup-http` (resource), bukan di sini.

## Out of scope

- Bentuk body error (modul `error-contract`).
- Penggabungan controller/resource (modul `dedup-*`).

## Acceptance criteria

1. Self-approval paket → 403 di approve **dan** reject; test diperbarui.
2. Urutan guard identik di semua aksi yang tercantum (dibuktikan dengan membaca
   tiap aksi + satu test per aksi untuk kasus cross-owner).
3. Tiga permission delete baru ada di seeder, dipakai di route, dan di-assign ke
   role yang tepat (staf/kepala_tim yang boleh update, boleh delete miliknya).
4. `comm` seeded-vs-used kosong atau setiap sisa punya justifikasi tertulis di
   komentar seeder.
5. `GET /api/teams` sebagai staf → hanya tim bidangnya; sebagai `kepala_tim` →
   semua tim dalam bidangnya (bukan hanya tim yang dipimpinnya); sebagai admin →
   semua tim.
6. `POST /wfh/reports/{report}/submit` tanpa `wfh.report.submit` → 403.
7. Suite penuh hijau.

## Verify

```bash
docker compose run --rm app php artisan test --compact
docker compose run --rm app php artisan test --compact --filter=SegregationOfDutiesTest
docker compose run --rm app php artisan test --compact --filter=TeamEndpointTest
docker compose run --rm app php artisan test --compact --filter=RbacManagementTest
```

## Catatan risiko

- Menambah middleware permission ke route yang sebelumnya hanya guard
  controller dapat memutus alur yang sah (mis. kepala_tim submit laporan sendiri).
  Karena itu `wfh.report.submit` harus di-assign ke **semua** role yang memang
  membuat laporan: `staf`, `kepala_tim`, `kepala_bidang`, `admin`.
- `user.create/update/delete` menggantikan `user.manage` pada route: pastikan
  role yang punya `user.manage` juga memperoleh ketiganya, atau alur admin rusak.
