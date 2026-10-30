# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.1.0).
Rilis internal dibatasi oleh modul; lihat `SPEC-*.md` untuk kontrak tiap modul.

## [Unreleased]

### Added
- Health probe `GET /up`: tanpa autentikasi, memeriksa koneksi database,
  menjawab `503` bila database tidak tercapai (sebelumnya orchestrator hanya
  bisa menebak kesehatan dari traffic).
- Endpoint lampiran berotorisasi `GET /api/changes/{id}/attachments/{attachment}`
  (S2): bukti perubahan tidak lagi di-serve sebagai URL statis `/storage/*`.
- `DocNumberGenerator` membaca prefix dokumen dari `config('change-mgmt.doc_prefix')`
  (`CHANGE_DOC_PREFIX`), bukan literal yang di-hard-code.

### Changed
- `DemoUsersSeeder` gagal tertutup (fail closed): menolak berjalan di luar
  `local`/`testing` dan tidak pernah menulis kata sandi yang terdokumentasi
  publik; kata sandi dibuat acak dan dicetak sekali bila tidak disetel.
- `SettingsSeeder` menyemai `password_default_admin`/`password_default_user`
  hanya di `local`/`testing`. Sebelumnya `admin123`/`user1234` ikut ter-seed di
  produksi, dan `UserController` store/impor memberikannya ke setiap akun baru.
  Di produksi kini kata sandi dibuat acak per akun (dicetak sekali) sampai
  operator menyetelnya sendiri.
- Bukti dipindahkan seragam ke disk privat: foto absensi WFH dan lampiran paket
  perubahan kini disimpan di disk `local`, sama seperti tanda tangan, dan dibaca
  lewat endpoint berotorisasi (`.../attendances/{attendance}/photo` dan
  `.../attachments/{attachment}`) yang memeriksa ulang hak akses per request.
- Perintah cutover `signatures:migrate-private` digeneralisasi menjadi
  `media:migrate-private` (menangani signatures, attendances, change-attachments
  dan membersihkan `public/storage/*`); perintah lama dihapus.
- `ApiException` 4xx tidak lagi dicatat sebagai "Unhandled exception": hanya
  status >= 500 yang dibawa ke log, sehingga 422 domain (jawaban normal) tidak
  lagi mengotori alert operator.
- `PUT /api/admin/settings/{key}` menolak nilai `password_default_*` yang lebih
  pendek dari 8 karakter: nilai itu diterapkan apa adanya ke setiap akun yang
  dibuat massal, sehingga satu karakter di sini menjadi kredensial lemah massal.
- Endpoint verifikasi QR publik `GET /verify/{token}` kini di-rate-limit
  (`throttle:60,1`) — token tetap 256-bit, limiter mencegahnya dipakai sebagai
  oracle/amplifier bila QR bocor.
- `.env.example` memakai `LOG_LEVEL=warning`, bukan `debug`.
- `ChangePackageController::destroy` memakai permission route-nya
  (`change.initiation.delete`), bukan `update`; `authorize()` ditambahkan
  sebagai defence-in-depth di controller WFH update/destroy/submit/revise dan
  unduhan lampiran agar guard tidak hanya bergantung pada middleware route.
- `SignatureController` menambahkan pemeriksaan permission
  (`wfh.monitoring.view`) di atas pemeriksaan nama peran (SEC-02), sehingga
  sekadar memegang `kepala_tim`/`kepala_bidang` tidak lagi cukup.
- Header `Cache-Control` pada aliran lampiran & tanda tangan kini konsisten
  `no-store, private`; sebelumnya Symfony menyisipkan `public`, menghasilkan
  `no-store, public` yang kontradiktif.
- `ImplementationResource` memakai URL endpoint berotorisasi, menyamai
  `AttachmentResource` (keduanya sebelumnya tidak konsisten dan salah satunya
  masih mempublikasikan `/storage/...`).
- `DocNumberGenerator`: `CHANGE_DOC_PREFIX=""` kini jatuh ke default, tidak lagi
  menghasilkan nomor rusak seperti `001//2026`.

### Fixed
- **SEC-01** — filter `status`/`team_id` pada `/api/admin/wfh/reports` divalidasi;
  input sampah sebelumnya diteruskan ke Postgres dan memicu 500 (22P02).
- **C2** — baris duplikat dalam satu berkas impor kini dilewati dan dilaporkan,
  tidak lagi menggagalkan seluruh impor dengan 500.
- Pemulihan `23505` (unique violation) pada pembuatan laporan & absensi
  mengembalikan jawaban domain 422, bukan 500 — dan foto yang tersimpan dibersihkan.
- Endpoint foto absensi memakai `resolveAny()`/`existsAny()` sehingga baris
  lama (publik, pra-`media:migrate-private`) tetap terlayani — sama seperti jalur
  PDF yang sudah toleran.
- Parity guard route↔controller dikunci oleh test: setiap route mutating yang
  mendeklarasikan `permission:<name>` wajib memanggil `$this->authorize('<name>')`
  di controllernya (drift inilah yang membuat `destroy` memakai `update`).
- Pemulihan `23505` yang sama pada pembuatan laporan tim (`wfh_team_reports`
  unique `(team_id, report_date)`): dua request bersamaan kini menjawab 422,
  bukan 500.
- Token verifikasi tidak lagi dibuat ulang saat approval ulang: QR pada PDF yang
  sudah dicetak tetap bisa diverifikasi.

### Tests
- Matriks 403 untuk seluruh rute ber-permission (38 kasus) — menghapus satu
  `permission:` middleware sekarang menggagalkan suite.
- Pemulihan duplikat `23505` via HTTP dengan double repository yang menjaga
  kode SQLSTATE berupa *string* (PDOException mengubahnya jadi int).
- Penguncian baris (`lockForUpdate`) pada transisi paket perubahan.
- Guard PDF: status draft, lintas bidang, tanda tangan belum ada,
  `team_report_id` milik tim lain diabaikan.
- Meta paginasi pada halaman > 1 dan penjepitan `per_page` (1..100, default 15
  untuk input non-numerik).
- Logging `Handler::register` — pengecualian tak tertangani tercatat; error
  klien (401/403/422) tidak membanjiri log "Unhandled exception".
