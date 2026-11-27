# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.1.0).
Rilis internal dibatasi oleh modul; lihat `SPEC-*.md` untuk kontrak tiap modul.

## [Unreleased]

### Fixed (backend+frontend, 2026-11-27 — tuntas temuan ship review #22)
- PDF tim tidak lagi mencetak draf pribadi anggota: `getTeamReportData`
  memilih laporan live terbaru (fallback rejected) memakai aturan yang sama
  dengan halaman detail. Foto presensi kini diambil dari laporan yang SAMA
  dengan tautannya — presensi lepas milik draf/laporan lain tidak ikut
  tercetak. Urutan staf deterministik (nama).
- Filter laporan tim bertahan saat kembali ke halaman: mount hanya membuang
  sisa paginasi (kembali ke halaman 1) dan me-refetch filter terapan, sehingga
  kontrol dan daftar selalu menunjukkan query yang sama.
- `submitReject` memakai guard ref sinkron (`busyRef`) seperti `submitApprove`
  — dua klik beruntun sebelum re-render tidak mengirim reject dua kali.
- PDF tim: `team_report_id` tanpa `date` memakai tanggal laporan itu sendiri
  (roster, tanda tangan, dan `isApproved` tidak lagi dari hari yang berbeda);
  unduhan tim sendiri untuk tanggal lampau mensyaratkan
  `wfh.monitoring.view` (papan hari ini tetap tak bergerbang untuk staf).
- Migrasi data `null`→kosong: tautan bukti kerja lama yang bukan `https://`
  (mis. `javascript:`, `data:`) di-null-kan (kolom `url` NOT NULL, dipakai
  string kosong) agar tidak lagi dirender ke `href`/PDF.
- `config/dompdf.php`: `allowed_protocols` dipersempit ke `data://` +
  `https://` — `file://`/`http://` (footgun bila `enable_remote` dinyalakan
  kelak) dicabut; semua gambar PDF saat ini data-URI/chroot lokal.
- `Cache-Control: no-store` kini hanya untuk request ber-kredensial atau
  respons error — health check `/up` (tanpa sesi) tidak lagi dibekukan.
  Regresi uji memastikan `/up` tetap tanpa `no-store`.
- `team_id` pada filter laporan tim tidak lagi memakai `exists:teams,id`
  (oracle keberadaan tim lintas bidang untuk non-admin): id tak dikenal
  menghasilkan halaman kosong yang sama untuk semua peran.
- Template PDF tim: variabel loop tautan dalam di-rename (`$linkIndex`) agar
  tidak menutupi indeks staf.
- Uji cakupan baru: HTTP show tim kosong, `meta.total` filter, `status=draft`
  → kosong, rentang hari tunggal, KT menyempit dalam timnya sendiri,
  `http://`/`HTTPS://` ditolak 422, foto gagal dimuat, tema Sistem gelap,
  detail basi (rejected), toast gagal Unduh PDF di halaman detail, pesan
  server 403 pada unduhan PDF tim.

### Fixed (backend+frontend, 2026-11-27 — tuntas temuan ship review #21)
- Tautan kegiatan jalur bulk `POST/PUT /wfh/reports` kini juga dibatasi
  https (`starts_with:https://` di `StoreReportRequest`) — `url` saja masih
  menerima `file://`/`about://` yang lolos FILTER_VALIDATE_URL dan dirender
  ke `href` di halaman detail laporan tim. Uji 422 + uji positif https.
- `phpunit.xml` mem-pin `APP_ENV=testing` dengan `force="true"`: docker
  compose menyetel `APP_ENV=local` sehingga perintah uji bawaan repo
  menjalankan suite sebagai `local` (CSP terlewati) dan uji hash CSP RED.
- Respons detail laporan tim tidak lagi memuat isi draf pribadi anggota —
  draf bersifat privat penulis; anggota yang hanya punya draf tampil
  "belum ada laporan" (konsisten dengan halaman daftar). Anggota yang hanya
  punya laporan rejected tetap tampil sebagai `rejected`, dan urutan kartu
  anggota kini deterministik (nama).
- Guard `latestRequestId` pada thunk detail (`wfhTeamSlice`) — respons basi
  akibat navigasi detail-ke-detail tidak lagi menimpa detail terbaru atau
  menyisipkan pesan error laporan lama; selaras guard daftar.
- `setTeamListQuery` kini reset penuh (bukan merge) — sisa `page`/`per_page`
  navigasi sebelumnya tidak lagi selamat saat mount dan refetch mutasi.
- Header `Cache-Control: no-store, private` untuk semua respons API yang
  membawa konteks `private` (data pribadi tidak tersimpan cache browser/
  proxy; paritas endpoint foto).
- Toast error Unduh PDF di halaman daftar kini selaras halaman detail;
  `pdfErrorMessage` diberi uji langsung (termasuk fallback non-Error).
- `openapi.yaml`: gate ganda (`wfh.team_report.view` + `wfh.monitoring.view`)
  pada show dan admin lintas-tim pada PDF tim terdokumentasi.
- Uji unit `TeamReportScope` (fail-closed `1 = 0` tanpa field, admin tanpa
  batasan, kunci tim sendiri, kepala bidang lintas tim, 403/`null` denial).

### Fixed (backend+frontend, 2026-11-27 — ship review: tuntas temuan review)
- Skrip anti-flash tema di `app.blade.php` kini diizinkan CSP melalui hash
  sha256 eksplisit di `script-src` (`SecurityHeaders`); sebelumnya skrip inline
  diblokir di semua env selain local sehingga kilatan tema kembali saat
  deploy. Regresi uji membandingkan hash skrip yang dirender dengan hash CSP.
- `GET /admin/wfh/team-reports/{report}` kini menuntut `wfh.monitoring.view`
  selain `wfh.team_report.view` (payload memuat konten grade monitoring);
  cabang positif kepala bidang lintas tim dalam bidang dipin uji 200, ditambah
  uji 404 dan uji role tanpa `wfh.monitoring.view`.
- Aturan tautan kegiatan dibatasi https di boundary (`starts_with:https://`);
  `url` saja menerima skema `javascript:` yang kemudian dirender ke `href`.
- Scope baca laporan tim (admin/kepala bidang/anggota) disatukan ke
  `TeamReportScope` — `index()` dan `show()` kini memakai satu implementasi;
  anggota detail diselesaikan di controller dan diinjeksikan ke
  `TeamReportDetailResource` (tanpa service location di serializer).
- Enum status laporan WFH disatukan: konstanta `WfhReportStatus` (backend,
  termasuk `LIVE`) dan modul `lib/wfh-report-statuses` (frontend) menggantikan
  daftar literal terduplikasi; pesan error PDF dibagi lewat
  `lib/pdf-error-message`.
- FE: kontrol filter daftar laporan tim kini terinisialisasi dari query redux
  aktif (tidak lagi menampilkan "Semua status" padahal daftar terfilter),
  pindah antar laporan menampilkan skeleton alih-alih isi laporan lama, dan
  permukaan error Unduh PDF di halaman detail diselaraskan dengan daftar
  (banner inline + toast memakai pesan yang sama). Uji tambahan: approve
  gagal + guard double-submit, reject me-refetch detail aktif, toggle tema di
  Header.
- `openapi.yaml`: field `session` pada detail anggota diberi enum
  `[pagi, siang, sore]` dan deskripsi roster diperjelas (keanggotaan saat
  ini, bukan per tanggal laporan). `phpunit.xml` mem-pin `memory_limit=1G`
  untuk render PDF dompdf.

### Added (backend+frontend, 2026-11-27 — Laporan Tim: detail, filter, toggle tema)
- Daftar Laporan Tim (`/team-reports`) mendapat filter berlapis di atas scope
  peran (status, rentang tanggal, tim) yang hanya mempersempit hasil; kepala
  tim yang memilih tim lain melihat data kosong, bukan kebocoran data.
- Halaman detail `GET /admin/wfh/team-reports/{report}` + `/team-reports/:id`
  menyusun konten laporan per anggota (absensi + foto, kegiatan) dengan aksi
  approve/reject ber-alasan wajib dan unduh PDF; guard `exportTeam` kini
  menerima admin lintas bidang (sebelumnya 403 di depan tombol yang sudah
  tampil), tanpa mengubah isi PDF.
- Header mendapat toggle tema Terang/Gelap/Sistem (`next-themes`, storageKey
  `theme`, default Sistem) dengan class `dark` di `<html>`; script inline di
  blade mencegah kilatan tema saat reload; toast mengikuti tema.
- Smoke 2026-11-27 (browser, stack dev localhost:8000): filter status
  approved menyaring 3→2 baris; detail laporan 2026-11-06 ditolak dengan
  alasan tampil di detail; PDF tim via endpoint mengembalikan 200
  `application/pdf` (~0.9 MB); tema Gelap/Terang/Sistem terverifikasi termasuk
  persist setelah reload tanpa kilatan dan toast mengikuti tema. Guard admin
  lintas bidang dibuktikan test (`PdfExportGuardsTest`, 29 passed). Gate:
  backend 920 passed, FE 829 passed, Pint bersih, typecheck + build hijau.

### Fixed (backend, 2026-11-25 — ekspor PDF laporan tim WFH)
- Kolom "Link Bukti Kerja" pada PDF rekap tim kini menampilkan seluruh tautan
  dari semua kegiatan anggota dengan penomoran berurutan (`1.`, `2.`, …),
  bukan daftar tanpa nomor; placeholder `-` untuk anggota tanpa tautan tetap
  dipertahankan.

### Fixed (backend+frontend, 2026-11-24 — ship review #20 dashboard)
- `today.scope` kini diberi gate eksplisit pada `wfh.monitoring.view` (plus
  scope riil), bukan sekadar efek samping role seeding — sesuai kontrak
  openapi; role yang kehilangan permission tersebut tidak lagi menerima rekap
  monitoring di beranda (dengan regresi uji + verifikasi mutasi).
- `trend` dan `attention` kini gagal-tertutup: pemegang `wfh.monitoring.view`
  tanpa tim/bidang yang dipimpin tidak lagi menerima tren kepatuhan dan daftar
  perhatian seluruh organisasi — seksi dihilangkan, konsisten dengan kontrak
  deny-by-default `DashboardScope` (sebelumnya setengah builder memperlakukan
  scope `null` sebagai "tanpa filter").
- Numerator kepatuhan `attention` hanya menghitung laporan pada tanggal hari
  kerja (`whereIn` pada jendela kerja, bukan `whereBetween` kalender), sehingga
  laporan di hari libur di tengah rentang tidak lagi menaikkan rasio di atas
  100% dan menyembunyikan ketidakpatuhan.
- Scope dashboard di-resolve sekali per request di `DashboardService` dan
  diwariskan ke semua builder (tidak ada lagi empat kali resolusi per request
  atau dua definisi scope yang bisa berbeda); lookup tim/bidang deterministik
  (`orderBy('id')`).
- Daftar perhatian eager-load nama tim (`with('team:id,name')`) — bukan satu
  query lazy-load per user.
- Refetch-on-focus beranda tidak lagi berkedip jadi skeleton: data lama tetap
  tampil dengan redup opacity di semua seksi; respons fetch yang lebih lama
  (`generated_at` basi) tidak lagi menimpa data yang lebih segar.
- Seeder demo mengikuti konvensi rotasi kredensial `DemoUsersSeeder`
  (password selalu ditulis ulang + wajib ganti saat login pertama).

### Added (backend+frontend, 2026-11-24 — dashboard beranda)
- Beranda `/` kini adalah dashboard per-permission, bukan placeholder: satu
  endpoint `GET /api/dashboard` (domain `app/Domains/Dashboard/`) dan satu
  halaman SPA (`pages/dashboard/`) yang menjawab "apa yang harus saya kerjakan
  hari ini dan bagaimana kepatuhan WFH?" sesuai peran peminta.
- Seksi hanya dikirim/dirender bila peminta berhak: `today` (semua role),
  rekap `scope` Tim/Bidang/Organisasi (`wfh.monitoring.view`), `queue` per
  permission keputusan (`change.initiation.approve`,
  `change.implementation.review`, `wfh.team_report.approve`), `trend` 14 hari
  kerja terakhir dari setelan `wfh_allowed_days`, dan `attention` maksimal
  5 user kepatuhan < 60% urut terendah dulu.
- Semua angka kepatuhan memakai pembilang + penyebut ("3 dari 12 belum
  absen"); penyebut hanya menghitung user aktif; hari non-kerja menampilkan
  status netral tanpa angka menyesatkan; user nonaktif dikecualikan dari
  rekap, tren, dan daftar perhatian.
- Skeleton per seksi saat loading, refetch saat tab kembali fokus tanpa
  blank, chart dari shadcn `chart` (`recharts@3.8.0`), dan seeder demo
  `DashboardDemoSeeder` (local/testing saja, idempoten) yang mengisi data
  contoh agar keempat role langsung terlihat hidup.

### Fixed (frontend, 2026-11-24 — UX lampiran paket perubahan)
- Input unggah lampiran kini tetap menampilkan "Tambah lampiran" setelah
  berkas dipilih: daftar berkas tampil di bawah input, sehingga tombol
  selalu jelas sebagai aksi untuk menambah berkas berikutnya.
- Tombol hapus pada berkas antrean kini memakai "Hapus Lampiran#N" dan tidak
  lagi menyertakan nama berkas (lebih rapi untuk nama panjang); berkas yang
  dihapus tetap berkas pada nomor urut tersebut.
### Fixed (backend+frontend, 2026-11-24 — ship-review #19 closeout)
- Log tamper path lampiran kini satu-baris (`addcslashes`): path DB yang
  tertamper memuat karakter kontrol tidak lagi bisa memalsukan baris log
  di sekelilingnya (CWE-117 — formatter Monolog mengembalikan `\n` pada
  konteks inline). Ditutup dengan test regresi yang mutation-verified.
- Coverage ship#19: penghapusan optimistis lampiran (baris hilang saat
  DELETE in-flight, dikembalikan bila ditolak, TIDAK dihidupkan kembali
  saat refetch gagal), retry Submit memakai draft yang SAMA, dan unduhan
  PDF tim tetangga oleh pemegang `wfh.monitoring.view` (positif) kini
  punya test yang mutation-verified.
### Fixed (backend+frontend, 2026-11-24 — ship-review #18 closeout)
- PDF laporan tim WFH kini butuh `wfh.monitoring.view` bila pengunduh bukan
  anggota tim itu: staf dengan `wfh.report.export_pdf` saja tidak lagi bisa
  mengunduh PDF tim tetangga dalam bidang yang sama — dokumen itu memuat
  nama+NIP seluruh anggota, foto absensi, identitas pembuat laporan, dan
  (bila disetujui) tanda tangan kepala bidang. Unduh tim sendiri tetap bebas.
- Retry "Simpan Draft"/"Submit" setelah gagal unggah antrean kini memakai
  paket draft yang SAMA (bukan membuat draft kedua — orphan dengan nomor
  dokumen baru yang tidak pernah terlihat user).
- Memilih berkas saat Simpan/Submit in-flight kini diblokir (input disabled +
  guard `busy || uploading`), menutup race lintas-alur yang sebelumnya hanya
  ditutup di sisi hapus lampiran.
- Hapus "Hapus" pada berkas antrean dinonaktifkan saat unggah in-flight:
  batch yang sudah terkirim tidak bisa dibatalkan dari UI (dulu klik terlihat
  berhasil tapi berkas tetap terunggah).
- Hapus lampiran kini optimistis: baris hilang dari daftar seketika; refetch
  yang gagal tidak lagi menghidupkan kembali baris yang sudah terhapus di
  server (klik kedua hanya menghasilkan 404 yang menimpa pesan sukses).
- Path lampiran tertamper (di luar `change-attachments/`) yang dihapus kini
  tercatat sebagai `Log::warning` — dulu baris terhapus diam-diam tanpa jejak;
  gagal unlink (disk penuh/izin bergeser) juga memunculkan warning karena
  kedua disk non-throwing dan tidak ada lagi baris untuk atribusi.
- Test isolation: bucket rate-limit (`throttle:auth`, api 60/menit) kini
  di-flush per test di `TestCase` — dulu kelas yang menghujam login/verify
  meracuni kelas lain dengan 429 sesuai urutan file.

### Fixed (frontend, 2026-11-24 — ship-review #18)
- Gagal unggah antrean lampiran saat Submit (create) kini MENGABORT submit:
  paket tidak lagi terkunci status submitted tanpa bukti, dan state form
  (berkas antrean) tidak hilang bersama navigasi. "Simpan Draft" gagal-unggah
  tetap menyimpan draft dan TIDAK menavigasi — pesan error tampil di kartu
  Lampiran agar bisa dicoba ulang.
- Klik "Hapus Lampiran" diabaikan saat simpan/submit masih in-flight: DELETE
  yang mendarat di tengah alur itu bisa menghapus baris yang baru diunggah,
  atau refetch menghidupkan lagi baris yang terhapus.
- Pesan error server (mis. "Hanya inisiator yang dapat menghapus lampiran.")
  kini tampil apa adanya di kartu Lampiran, bukan pesan generik.

### Fixed (backend+frontend, 2026-11-24 — ship-review #17)
- Hapus attachment kini menolak path baris di luar `change-attachments/`:
  baris yang tertamper menunjuk `signatures/...` atau `../` tidak lagi
  menghapus berkas di luar direktori lampiran (baris tetap terhapus, berkas
  lain aman). Berlaku juga untuk pembacaan snapshot lama saat delete.
- Klik ganda pada "Hapus Lampiran" saat DELETE masih in-flight tidak lagi
  menembak DELETE kedua (404 palsu yang menimpa pesan sukses).
- Dialog "Buat laporan tim" yang dibuka ulang setelah create gagal tidak lagi
  menampilkan pesan error 422 dari percobaan sebelumnya.
- Antrean lampiran (create) memakai kunci React unik: dua berkas bernama sama
  dari folder berbeda tidak lagi bentrok.
- Kolom pembuat PDF tim tanpa laporan kini memakai em-dash `—` sesuai spec.

### Fixed (backend+frontend, 2026-11-24 — perbaikan lintas modul)
- PDF laporan WFH tim: kop surat & tanggal kini sejajar dengan PDF individu;
  kolom "Yang Membuat Laporan" diisi `created_by` laporan tim (lookup tim+tanggal
  bila `team_report_id` tak dikirim) — bukan admin pengunduh; tanpa laporan
  maker `—` dan PDF tetap 200.
- Detail WFH: tombol Kembali mengarah ke `/monitoring` bila dibuka dari papan
  monitoring, fallback `/wfh` bila state hilang. `/team-reports` kini tombol
  "Buat laporan" + dialog (bukan section card form).
- Label role human-friendly ("Admin", "Kepala Bidang", "Kepala Tim", "Staf")
  di form user, tabel users, dan halaman roles; `aria-label` checkbox tetap
  nilai mentah.
- Lampiran paket perubahan: thumbnail + lightbox sejak pemilihan file (create),
  hapus berkas pending, hapus/ganti attachment existing saat draft via endpoint
  `DELETE /changes/{id}/attachments/{attachment}` (204, draft+inisiator only,
  file dihapus dari disk `local` dan `public`); input unggah hanya di form
  create/edit, halaman detail read-only. Label "Hasil implementasi" seragam
  menjadi "Tanggapan Perubahan" di form & detail; PDF Implementasi dapat caption
  "Tanda Tangan" di atas 3 image tanda tangan.

### Fixed (backend+frontend, 2026-11-23 — tindak lanjut ship-review #15)
- Slot absensi terkunci permanen: unique index `wfh_attendance_unique`
  mencakup baris yang di-soft-delete, sehingga sesi yang dihapus dari laporan
  draft tidak pernah bisa diunggah ulang (guard aplikasi hanya membaca baris
  hidup → INSERT menabrak index → 500). Index kini parsial
  `WHERE deleted_at IS NULL` (migration 2026_11_23_000003).
- Jalur koreksi laporan rejected kini aman terhadap baris absensi yang
  di-soft-delete: relink tetap memindahkan baris hidup, baris terhapus tetap
  sebagai riwayat laporan rejected (tidak memblokir unggahan baru).
- Race 23505 pada `POST /wfh/reports` yang rethrow (tanpa draft selamat)
  kini menghapus foto absensi yang sudah tersimpan — invarian "tidak ada
  file yatim" berlaku di semua jalur gagal, bukan hanya jalur konflik relink.
- Batas 10 lampiran paket perubahan kini TOTAL per implementasi (server
  menghitung baris yang ada; sebelumnya hanya per request `files.max:10`,
  sehingga batch kedua lolos). Pre-check klien menghitung antrean + yang
  sudah terpasang dengan batas yang sama.
- Submit (create mode) kini mengunggah antrean lampiran ke paket baru
  SEBELUM POST /submit — sebelumnya lampiran tertinggal bersama state form
  saat navigasi, meski kartu menjanjikan "terunggah otomatis".
- Regresi ditambahkan: reject-on-rejected ditolak state machine, route
  `/revise` terverifikasi tidak ada (404), PDF evaluator (posisi & bidang)
  di-assert dari inisiator, negative type test `PackageSubmitInput`
  dipulihkan.

### Changed (backend+frontend, 2026-11-23 — penutupan flow WFH & paket perubahan)
- **Revisi laporan WFH personal dihapus.** Laporan `rejected` kini terminal &
  immutable (PUT/DELETE/submit/approve ditolak); koreksi = laporan baru untuk
  tanggal yang sama — absensi laporan rejected ikut berpindah ke laporan baru.
  Route `POST /wfh/reports/{report}/revise`, method controller, thunk FE, dan
  op OpenAPI dihapus bersih.
- **Evaluator paket perubahan otomatis = inisiator.** Input evaluator dihapus
  dari form; kolom `evaluator_id`/`evaluator_signed_at` di-drop dari DB
  (migration 2026_11_23_000002); payload lama yang masih mengirim
  `evaluator_id` diabaikan (bukan 422); blok tanda tangan evaluator di PDF
  implementasi tetap dicetak dari data inisiator.
- Konsumen FE `GET /users` (picker evaluator) dilepas — endpoint backend tetap;
  `resources/js/api/users.ts` dihapus, `Combobox` tetap sebagai primitif umum.
- Kontrak & dokumen diperbarui: `postman/specs/openapi.yaml` (tanpa op revise,
  tanpa field evaluator), `SPEC-wfh-reports.md`, `SPEC-change-package.md`.
  Rujukan: `docs/superpowers/specs/2026-11-23-wfh-change-flow-closeout-design.md`.

### Fixed (frontend+PDF, 2026-11-22 — umpan balik UX)
- PDF WFH personal: label "Yang Membuat Laporan" dan "Atasan Langsung" kini
  berada di satu baris tabel yang sama (sejajar horizontal); tanggal
  "Surabaya, …" menempati baris terpisah di atas kolom Atasan Langsung.
- Form Implementasi (create & edit): input Lampiran (hasil pengujian
  implementasi) tersedia sejak awal — tidak lagi menunggu draft tersimpan;
  label "Effort yang dibutuhkan" → "Upaya/Tindakan", plus penyelarasan label
  lain dengan `form-implementasi-example.pdf`.
- `/changes/new`: opsi evaluator berformat "Nama - NIP"; kolom "Tanggal
  dibutuhkan" dan "Evaluator" sejajar horizontal (`sm:grid-cols-2`,
  responsif).
- Kartu Absensi WFH: tombol X (hapus file) digroup satu baris dengan Hapus &
  Unggah; root cause overflow diperbaiki di `FileInput` (`w-full` →
  `flex-1 min-w-0` karena tombol X adalah sibling di baris yang sama).
- Navigasi: "Profil Saya" pindah dari sidebar ke dropdown avatar (di atas
  Keluar).

### Fixed (backend+frontend, 2026-11-22 — tindak lanjut ship-review #14)
- `TeamReportsPage`: `pending` salah dipakai sebagai gate disable pada tombol
  "Tolak laporan" — dialog selalu menampilkan spinner saat dibuka padahal tak
  ada aksi in-flight (melanggar S2). Kini `pending={rejecting}` +
  `disabled={alasan kosong}`; tombol Setujui baris juga kembali men-disable
  global saat ada mutasi berjalan (gate symmetry approve/reject).
- Kegagalan 422 dengan kunci field yang tak dirender halaman (Profil, Form
  User) tidak lagi senyap: toast error selalu dikirim, banner inline tetap.
- Seam `toUiError` kini menerjemahkan kunci field internal ke label Indonesia
  (S6 tuntas): `files.0` → "Lampiran 1", kunci tak dikenal dijatuhkan;
  `fieldErrorsByKey` memetakan balik ke kunci server untuk state per-field
  halaman. `fieldMessage` + duplikasi label di `api/client.ts` dihapus.
- Envelope `message` tidak lagi bocor ke cache resource: matcher mutasi
  `wfhSlice`, `syncRolePermissions` di `adminSlice`, dan `setUser` pasca
  `updateProfile` kini melepas `message` (invarian yang sebelumnya hanya
  dipatuhi 2 dari 5 site).
- `PdfImage`: guard bom dekompresi — header gambar dengan dimensi > 16M px
  (bitmap ~64MB) ditolak SEBELUM GD dipanggil; tanpa guard, header palsu
  meng-OOM-kan worker PDF (exit 137, bukan exception).
- Dockerfile: `php.ini-production` (bukan development — `display_errors=On`,
  `expose_php=On`), `expose_php=Off`, log PHP ke `/dev/stderr`.

### Fixed (backend+frontend, 2026-11-22 — tindak lanjut ship-review #13)
- `ChangePackageFormPage`: `handleSaveDraft` kehilangan `finally { setBusy(false) }`
  (terhapus saat refactor T7a) — gagal simpan draft membiarkan tombol
  "Simpan Draft" + "Submit" nonaktif permanen sampai reload. `finally`
  dipulihkan; regresi dikunci test "Simpan Draft gagal → kedua tombol aktif
  kembali" (diverifikasi gagal tanpa fix via mutasi).
- Toast sukses hapus paket dirender kosong: `DELETE /changes/{id}` membalas
  204 tanpa body sementara UI membaca `res.message` dari envelope. Thunk kini
  menyisipkan pesan statis "Paket perubahan berhasil dihapus." (pola yang sama
  dengan fallback user-delete); komentar kontrak di `admin.ts`/`change-package.ts`/
  `wfh.ts` dikoreksi (204, bukan envelope).
- Export PDF OOM pada test suite: `PdfImage::dataUri` semula menyematkan
  bitmap 1400×1960 penuh (~1.8MB PNG internal dompdf per logo); kini bitmap
  diturunkan ke lebar render (2× dari 74px) via GD — data URI ~12KB. MIME
  diambil dari isi (`getimagesize`), symlink keluar root `public/` ditolak
  (`realpath` containment), dan Dockerfile menetapkan `memory_limit=256M`
  plus `php.ini-development` (sebelumnya tanpa config file, default 128M).
- Test `POST /api/profile/signature` ditambahkan (sebelumnya tanpa test sama
  sekali): PNG valid dinormalisasi + persist, PHP tersamar `.png` ditolak
  (sniff isi, bukan nama), pesan Indonesia untuk oversize (2MB) dan dimensi
  (>2000px), file kosong ditolak. Pesan `files.*.max` (10MB) dan `photo.max`
  (2MB) juga dikunci test.
- Pre-check upload client kini menolak file dengan MIME palsu di luar
  allowlist walau ekstensinya benar (`application/x-httpd-php` bernama
  `.png` tidak lolos); MIME kosong tetap diterima lewat ekstensi.
- `SettingsPage.doSave` diberi guard double-submit (`savingRef` sinkron) —
  satu-satunya jalur mutasi tanpa guard.
- `VerifyPage` melalui seam `toUiError` (T10); `MonitoringPage.pdfErrorMessage`
  didokumentasikan sebagai pemakai `ApiError` yang sudah terkurasi.
- `decodeBlobEnvelope` + `firstMessages` memvalidasi bentuk `errors`
  (harus array of string) — body malformed tidak lagi diindeks sebagai
  karakter; branch degraded (body kosong, JSON non-object, errors malformed,
  blob 5xx) dikunci test.
- `Button pending`: spinner memakai slot `data-icon="inline-start"` — lebar
  tombol tidak bergeser saat pending toggles.
- Test Toaster mount diganti dari baca teks sumber `app.tsx` menjadi mount
  React nyata + toast sampai DOM; copy `conflict`/409 dikunci test.
- `composer:latest` di Dockerfile dipin ke `composer:2`.

### Changed (frontend, 2026-11-10 — inisiatif ui-feedback T1–T10)
- Seam error tunggal `UiError` (`lib/ui-errors.ts`) dengan tabel copy per
  kind (validation/auth/forbidden/notFound/conflict/rateLimited/server/
  network/unknown); semua slice dan halaman melalui `toUiError` — teks
  teknis axios tidak pernah sampai ke UI (T1, T10).
- Mutasi API mengembalikan envelope berpesan (`Messaged<T>`, T4); decode
  blob untuk respons PDF/upload 4xx/5xx dengan fallback copy per status
  (T2); `Button` prop `pending` + `<Toaster/>` global sonner (T3); spinner
  pending + toast di seluruh halaman mutasi (T7a/b); pre-check upload
  client (ukuran/tipe/jumlah) sebelum request (T9); pesan validasi mimes
  Indonesia di FormRequest (T10). Lihat `SPEC-ui-feedback.md`.

### Changed (backend+frontend, 2026-11-08 — rebuild layout PDF)
- Tiga template PDF dibangun ulang dengan kop surat + logo dokumen WebP:
  laporan WFH personal & tim (legal clause digugurkan), form inisiasi dan
  implementasi paket perubahan (checkbox grid per opsi, kolom identitas
  3-kolom, tanda tangan di dalam box tanpa trik `top:-55px`, form implementasi
  dua halaman). `PdfImage::dataUri` menyematkan logo; `productionImpact`
  dirender pada form implementasi. Lihat `SPEC-pdf-signature.md`.

### Fixed (backend, 2026-11-20 — dukungan WebP pada GD container)
- Gambar logo dokumen (`logo-doc.webp`) disematkan sebagai data URI `image/webp`
  ke PDF; runtime `eoffice-app` sebelumnya membangun ekstensi GD **tanpa** WebP,
  sehingga DOMPDF melempar `Dompdf\Exception: Function imagecreatefromwebp() not
  found` dan export PDF gagal (HTTP 500). `Dockerfile` kini memasang `libwebp-dev`
  dan mengonfigurasi GD dengan `--with-webp` (paritas dengan dukungan JPEG/FreeType
  yang sudah ada). Regresi dikunci di `PdfImageTest::test_webp_logo_renders_as_an_embedded_pdf_image`
  (merender logo ke PDF dan menegaskan image XObject benar-benar tertanam).

### Changed (frontend, 2026-11-10 — preview gambar lampiran & penataan detail paket)
- `ChangePackageDetailPage`: lampiran kini dirender `AttachmentList` baru — gambar
  ditampilkan sebagai thumbnail proporsional (`object-contain`) dengan lightbox
  zoom/swipe di seluruh lampiran (library `react-photo-view`, kompatibel React 19);
  berkas non-gambar tetap berlabel "Berkas" + tombol Unduh ber-bearer. Deskripsi
  kartu Lampiran tidak lagi memuat detail teknis "endpoint ber-otorisasi (bearer)
  — bukan tautan /storage". Tombol aksi (Ubah Draft/Submit/Unggah/Hapus serta
  Setujui/Tolak) dipindah ke bawah kartu Lampiran.

### Changed (frontend, 2026-11-10 — paritas UX header tabel + tombol aksi)
- `UsersPage`: tombol "Buat User" pindah ke kanan-atas header halaman
  (sejajar judul, `space-between`) dengan ikon di dalam tombol; input import
  spreadsheet dipindah ke `CardAction` header kartu "Daftar User" dengan label
  ringkas "Import file" (input `aria-label`/`inputLabel` "Pilih file import"
  dipertahankan untuk aksesibilitas & test).
- `ChangesPage`: filter status menjadi dropdown tunggal "Filter" di
  `CardAction` header kartu "Daftar Paket" (pola `WfhReportsPage`/`Monitoring`;
  guard `onInteractOutside` untuk portal `Select`); kontrol "Per halaman"
  pindah ke footer tabel (`Pagination.rightSlot`); ikon `GitBranch` masuk ke
  dalam tombol "Buat Paket"; card filter terpisah dan span duplikat
  "Halaman N · per halaman" di footer dihapus (footer kini identik halaman WFH).
- `TeamReportsPage`: kontrol "Per halaman" pindah dari card filter terpisah
  ke footer tabel (`Pagination.rightSlot`); card filter dihapus.

### Changed (frontend, 2026-11-09 — paritas UX tabel "Semua Laporan" monitoring)
- Tab "Semua Laporan" di `MonitoringPage` diselaraskan dengan `WfhReportsPage`:
  form filter (status, tim, rentang tanggal) dipecah ke dropdown tunggal
  "Filter" di header kartu tabel "Daftar Laporan WFH" (ikon `ListFilter`);
  card filter terpisah dihapus; kontrol "Per halaman" pindah ke footer tabel
  lewat slot `rightSlot` komponen `Pagination`. Dropdown bersifat controlled
  dengan guard `onInteractOutside` agar popover kalender `DateInput` dan opsi
  `Select` (portal Radix terpisah) tidak menutup dropdown saat dipakai.
- Label "Cakupan: … · Tanggal efektif …" pada kartu Papan Harian dihapus.

### Changed (frontend, 2026-11-08 — rework daftar WFH personal & monitoring)
- `WfhReportsPage`: form filter (rentang tanggal) dipecah ke dropdown tunggal
  di kanan atas header tabel "Daftar Laporan" (ikon `ListFilter`) — card filter
  terpisah dihapus; kontrol "Per halaman" pindah ke footer tabel lewat slot
  `rightSlot` komponen `Pagination`. Kolom "Status WFH" ditambahkan sebagai
  ringkasan absensi per sesi aktif (`GET /wfh/session-config`, fallback kosong)
  menggunakan pill "Pagi/Siang/Sore" (sudah/belum absen). Ikon dekoratif ganda
  pada header halaman dihapus — hanya ikon pada tombol aksi yang tersisa.
- Tabel "Semua Laporan" di `MonitoringPage` ikut memakai kolom "Status WFH"
  (sesi dari konfigurasi yang sama), menjaga baris `WfhReportRow` satu sumber.

### Fixed (frontend, 2026-11-08)
- `listWfhReports` tidak meneruskan `date_from`/`date_to` ke query params,
  sehingga filter rentang tanggal di `/wfh` (personal) tidak pernah sampai ke
  backend (list selalu diambil tanpa filter). Kini diteruskan; regresi dikunci
  di `api/wfh.test.ts`.

### Fixed (frontend+backend, 2026-11-03 — tindak lanjut ship-review #12)
- `PUT /api/admin/settings/{key}`: `wfh_allowed_days`/`wfh_sessions`
  menerima array kosong (= WFH/sesi nonaktif, fail-closed di attendance &
  reminder); rule `value` kini `present` (key wajib ada) bukan `required`
  yang menolak `[]`. Non-list/assoc tetap 422 (test baru 4 kasus).
- Filter laporan WFH: `date_to` tanpa `date_from` kini teruji (batas atas
  saja), plus suite baru `AdminDateRangeWiringTest` menutup wiring rentang
  di endpoint admin (from+to, to-only, date_from cacat → 422).
- A11y: tombol hapus (`X`) `DateInput`/`MonthInput`/`TimeInput` kini
  `Button` sibling trigger — bukan `role="button"` nested di dalam
  `<button>` (ARIA-in-ARIA) — dedup via `ClearButton` bersama
  (`clear-button.tsx`), setara pola Combobox/FileInput.
- Keamanan: redirect QR `GET /api/verify/{token}` memancarkan `Location`
  relatif (Symfony `RedirectResponse` langsung) — Laravel `redirect()`
  mengabsolutkan via header Host yang bisa dipalsukan di belakang proxy
  yang salah konfigurasi. Test mengunci Location relatif.
- Keamanan: picker `GET /api/users` tidak lagi eager-load
  `roles.permissions`/`permissions` (dead weight — `PickerUserResource`
  tidak pernah menyerialisasi keduanya); test pivot kini mengunci 0 query.
- `POST /wfh/reports`: `report_date` dibatasi `<= hari ini` dan
  `>= 2020-01-01` — foto absensi ditulis sebelum cek unique-key, jadi
  tanggal tak terbatas sebelumnya memungkinkan autentik user menyebarkan
  direktori arbitrer di disk (ship #12; menutup temuan pre-existing).
- Performa: route-level code splitting (`React.lazy` per halaman +
  `Suspense` di AppShell & route publik) — bundle utama 1.002 kB → 396 kB
  (gzip 122 kB), halaman berat (admin/WFH/changes) termuat on-demand.

### Changed (frontend+backend, 2026-11-03 — inisiatif ux-fixes: pengaturan, WFH personal, RBAC)
- `WfhReportsPage`: filter pasangan date+month diganti rentang
  `date_from`–`date_to` (kalender popover, inklusif); Monitoring tab "Semua
  Laporan" idem (rentang mencakup hari tunggal via from=to). UI tak pernah
  mengirim `month` lagi; backend tetap menerimanya (kompatibel). Tombol
  "Buat Laporan" (pilih tanggal → get-or-create → navigate) kini tampil
  untuk semua pemegang `wfh.report.create`.
- Halaman Pengaturan dinamis: label Indonesia + kontrol sesuai jenis nilai
  dari kamus `settings-meta.ts` — 7 checkbox hari kerja (ISO 1..7), 3
  checkbox sesi fixed, `TimeInput` adapter `HH:mm` non-native (Popover 24
  jam × langkah menit 5), password tetap masked + dialog konfirmasi; key tak
  dikenal tetap tampil sebagai teks. Nilai array dikirim apa adanya
  (sebelumnya JSON string read-only).
- `PUT /api/admin/settings/{key}` memvalidasi format per key di server:
  `wfh_notify_start_time` `H:i` 24-jam, `wfh_allowed_days` array integer
  1..7, `wfh_sessions` subset {pagi,siang,sore}; `password_default_*`
  tetap 8..255 karakter. Input cacat → 422 dengan pesan Indonesia.
- Peran & Permission: nama permission programatik tak lagi menjadi label
  checkbox; kamus `permissions-meta.ts` (38 permission seeder) merendernya
  sebagai label Indonesia dikelompokkan per section modul (Manajemen
  Pengguna / RBAC / WFH / Manajemen Perubahan / Pengaturan) di dalam tiap
  card role. Permission tak dikenal tetap tampil di "Lainnya" — grid RBAC
  selalu mencerminkan daftar server. Sync penuh, dialog lockout, dan gate
  tidak berubah.

### Changed (frontend, 2026-11-02 — inisiatif form-consistency)
- Seluruh kontrol native SPA (~24 di 12 file: select, date, month,
  checkbox, radio, file) diganti komponen bergaya animate-ui.com di
  `resources/js/components/ui/*` (`Select`, `Checkbox`, `DateInput`,
  `MonthInput`, `FileInput`, `Combobox`) — kanvas form konsisten,
  audit grep kontrol native = nol.
- Form change-package: picker evaluator baru (Combobox) dari
  `GET /api/users` (field-scoped, active-only) untuk issue backend #1;
  tanggal dibutuhkan/eksekusi/rilis memakai calendar popover, bukan
  `input type=date`.

### Added
- Health probe `GET /up`: tanpa autentikasi, memeriksa koneksi database,
  menjawab `503` bila database tidak tercapai (sebelumnya orchestrator hanya
  bisa menebak kesehatan dari traffic).
- Endpoint lampiran berotorisasi `GET /api/changes/{id}/attachments/{attachment}`
  (S2): bukti perubahan tidak lagi di-serve sebagai URL statis `/storage/*`.
- `DocNumberGenerator` membaca prefix dokumen dari `config('change-mgmt.doc_prefix')`
  (`CHANGE_DOC_PREFIX`), bukan literal yang di-hard-code.
- `GET /api/users` — daftar user aktif read-only untuk dropdown picker
  (mis. evaluator pada form change-package), di-scope bidang: non-admin hanya
  melihat user aktif di bidang sendiri; admin/`user.manage` boleh `?field_id=`.
  User non-aktif dan user tanpa tim tidak pernah dikembalikan (konsisten
  dengan aturan validasi evaluator lintas-bidang). Payload memakai proyeksi
  lean `PickerUserResource` (`id`, `name`, `nip`, `team`) — email/roles/
  permissions/must_change_password tidak lagi bocor ke picker (ship #10 SEC-01);
  `team.leader` ikut eager-load sehingga daftar tetap flat walau tim ber-pemimpin.
- Redirect QR lama (`GET /api/verify/{token}` → SPA) kini hanya untuk Accept
  yang secara eksplisit meminta `text/html` dengan q>0 (wildcard `*/*`, absent,
  dan `text/html;q=0` tetap menerima JSON), dan hanya untuk token berformat
  64-hex — token cacat selalu menjawab 404 JSON yang sama (ship #10 SEC-02).
- Kontrol select hasil migrasi animate-ui kembali punya opsi reset ("Semua
  status", "Semua tim", "—" di draft prioritas/dampak) sehingga filter form
  bisa dikembalikan ke kosong tanpa reload (ship #10 M2).
- Kalender popover: atribut `data-day` locale-dependent di tombol hari dihapus;
  kontrak query deterministik memakai `data-day` ISO milik gridcell
  react-day-picker (ship #10 M3).
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
- QR pada PDF kini mengarah ke halaman SPA `/verify/{token}` (bukan
  `/api/verify/{token}` yang memunculkan JSON mentah saat discan). QR pada
  dokumen yang sudah tercetak tetap berfungsi: `GET /api/verify/{token}` dengan
  `Accept: text/html` di-redirect (302) ke halaman SPA yang sama; kontrak JSON
  untuk klien non-HTML tidak berubah.
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
- `react-router-dom` 7.18.1 → 7.18.5 (menutup GHSA-qwww-vcr4-c8h2, RSC-mode
  CSRF bypass). `composer audit` dan `npm audit --omit=dev` kini bersih.
- `DocNumberGenerator`: `CHANGE_DOC_PREFIX=""` kini jatuh ke default, tidak lagi
  menghasilkan nomor rusak seperti `001//2026`.

### Fixed
- **Laporan Tim** (`/team-reports`) menampilkan "Total 0 laporan" padahal baris
  ada. `GET /api/admin/wfh/team-reports` mengirim envelope
  `ApiResponse::paginated` (`{success, data[], meta}`), tetapi klien membaca
  `res.data` sebagai paginator raw (`current_page`, `last_page`, …) sehingga
  `reports` selalu kosong; skema `TeamReportListResponse` di `openapi.yaml`
  ikut salah mendokumentasikannya sebagai "raw paginator tanpa success wrapper".
  `listWfhTeamReports` kini memetakan `res.data` → baris dan `res.meta` →
  `PaginationMeta`; skema openapi dikoreksi. Ditemukan lewat E2E manual 3 peran
  di browser, dikunci test pemetaan (RED→GREEN).
- **Ship review #5** Laporan Tim: (1) pesan gagal reject kini dirender *di dalam*
  dialog agar tidak terkurung di belakang overlay `DialogOverlay`; (2) query
  redux list di-reset saat mount (`setTeamListQuery({})`) supaya fetch ulang
  benar-benar bersih dari sisa navigasi sebelumnya; (3) `rejectWfhTeamReport`
  kini memakai `RejectTeamReportInput` (tipe kontrak yang sebelumnya diekspor
  tak terpakai). Ketiganya dikunci test RED→GREEN (refetch non-fatal, pesan
  reject dalam dialog).
- Pesan error mutasi WFH (422) kini benar-benar terlihat: `WfhReportDetailPage`
  memanggil refetch detail tanpa syarat setelah setiap mutasi, dan
  `fetchWfhReport.pending` membersihkan `current.error` sebelum render
  berikutnya — submit laporan kosong menjawab 422 "Setidaknya satu kegiatan atau
  satu absensi harus diisi sebelum submit." yang tak pernah tampil ke pengguna.
  Refetch kini hanya berjalan saat mutasi sukses (`runMutation`,
  `persistActivities`), dan pesan dari matcher `rejected` dibiarkan di layar.
- **SEC-01** — filter `status`/`team_id` pada `/api/admin/wfh/reports` divalidasi;
  input sampah sebelumnya diteruskan ke Postgres dan memicu 500 (22P02).
- **C2** — baris duplikat dalam satu berkas impor kini dilewati dan dilaporkan,
  tidak lagi menggagalkan seluruh impor dengan 500.
- Pemulihan `23505` (unique violation) pada pembuatan laporan & absensi
  mengembalikan jawaban domain 422, bukan 500 — dan foto yang tersimpan dibersihkan.
- Endpoint foto absensi memakai `resolveAny()`/`existsAny()` sehingga baris
  lama (publik, pra-`media:migrate-private`) tetap terlayani — sama seperti jalur
  PDF yang sudah toleran.
- Baris kosong sebelum `<?php` di `routes/api.php` memberi prefiks byte `\n`
  pada setiap respons API. JSON tetap ter-parse dan menyembunyikan cacat ini,
  tetapi respons biner (`GET /api/signatures/{user}`) rusak — browser menolak
  PNG-nya sehingga preview tanda tangan tampil kosong. Baris kosong dihapus;
  `SignatureAccessTest::test_application_bootstrap_emits_no_stray_output`
  mengunci invarian: bootstrap Laravel tidak boleh menulis byte apa pun ke stdout.
- Parity guard route↔controller dikunci oleh test: setiap route mutating yang
  mendeklarasikan `permission:<name>` wajib memanggil `$this->authorize('<name>')`
  di controllernya (drift inilah yang membuat `destroy` memakai `update`).
- Pemulihan `23505` yang sama pada pembuatan laporan tim (`wfh_team_reports`
  unique `(team_id, report_date)`): dua request bersamaan kini menjawab 422,
  bukan 500.
- Token verifikasi tidak lagi dibuat ulang saat approval ulang: QR pada PDF yang
  sudah dicetak tetap bisa diverifikasi.
- **`media:migrate-private`** kini membersihkan salinan web secara rekursif.
  Sebelumnya `public/storage/{signatures,attendances,change-attachments}` disapu
  dengan `glob()` satu level, sedangkan bukti tersimpan bersarang
  (`attendances/{user}/{tanggal}/x.jpg`). Pada deployment yang menyalin direktori
  (bukan symlink) setiap berkas tetap terunduh di `/storage/<tree>/...` sementara
  perintah melaporkan sukses; sekarang direktori salinan dihapus seluruhnya dan
  hasilnya dilaporkan per-tree.

### Tests
- Test pemetaan list Laporan Tim: `listWfhTeamReports` wajib membaca envelope
  `ApiResponse::paginated` (`data` → baris, `meta` → `PaginationMeta`) — RED bila
  klien kembali memperlakukan `res.data` sebagai paginator raw.
- E2E manual modul `wfh-team-reports` 3 peran di browser nyata: admin — buat
  laporan (status `pending`, `created_by`=aktor) + duplikat `(team_id,
  report_date)` menjawab 422 "Laporan untuk tim dan tanggal ini sudah ada." yang
  tampil dan tetap ada setelah refetch; admin membuat tim di luar bidangnya
  ditolak 403 "Tim tidak ditemukan dalam bidang Anda."; kepala bidang — Setujui
  (`supervisor_id` terisi, tombol hilang) dan Tolak via dialog alasan wajib
  (tombol mati saat alasan kosong, `reject_reason` tersimpan); kepala tim —
  view-only pada timnya (tanpa form buat, tanpa tombol aksi); staf — menu
  "Laporan Tim"/"Monitoring WFH" hilang dari sidebar, akses URL langsung
  menjawab 403 dengan pesan Indonesia "Anda tidak memiliki izin untuk aksi ini."
  E2E menemukan + memicu perbaikan cacat bentuk list (lihat bagian Fixed).
- Bootstrap tanpa output liar (`test_application_bootstrap_emits_no_stray_output`):
  bootstrap Laravel dalam proses terisolasi wajib menulis 0 byte ke stdout —
  RED bila ada baris kosong/BOM/"echo" sebelum `<?php` pada file yang dimuat
  (menutup kelas bug prefiks-byte pada respons biner).
- Preview tanda tangan FE teruji unit: request preview wajib membawa header
  `Authorization: Bearer ...` (RED bila helper kembali memakai URL polos).
- E2E manual 3 role `DemoUsersSeeder` di browser (staf vs kepala_tim vs
  kepala_bidang: sidebar berbeda sesuai permission, must_change_password
  memaksa /change-password, profil + upload signature persist setelah refresh,
  logout menghapus token, 401 memicu auto-logout + redirect /login).
- E2E manual modul WFH 3 role `DemoUsersSeeder` di browser nyata (wfh-reports
  Phase 4, CP4): staf — login → must_change_password → daftar/filter
  `/wfh` → detail → unggah absensi sesi (siang) → Ajukan (draft→pending) →
  Unduh PDF (blob `WFH-1-2026-11-01.pdf`, valid PDF 1.7, butuh tanda tangan
  pemilik: tanpa itu endpoint menjawab 422 sesuai `SignatureGuard`); kepala
  bidang — Setujui (pending→disetujui, tombol aksi hilang) dan Tolak via
  dialog alasan wajib (alasan tampil ke pemilik); staf — Revisi laporan
  (rejected→draft) → tambah kegiatan → Ajukan ulang (→pending); kepalatim
  melihat nav Monitoring/Laporan Tim tanpa Setujui/Tolak (approve/reject =
  kepala bidang, kontrak `RolePermissionSeeder`). 403 DAN 422 tampil sebagai
  pesan Indonesia ke pengguna. E2E menemukan + memicu perbaikan bug visibilitas
  pesan 422 (lihat bagian Fixed) — regresi dikunci test unit halaman detail.
  Catatan lingkungan: E2E hari Minggu butuh `wfh_allowed_days` [1..7] sementara
  (dikembalikan ke [1..5] setelahnya); database `kominfo_wfh` dibiarkan berisi
  data demo E2E — suite PHPUnit memakai `eoffice-pgtest` terpisah.
- Rate limit `/verify/{token}` dikunci test (RED bila `ThrottleRequests:api`
  dilepas dari grup `api`) — sebelumnya tak ada test yang gagal tanpanya.
- Test fallback render non-JSON memakai probe `POST`: probe `GET` tertutup
  catch-all SPA, sehingga ia hanya menguji view SPA dan menjadi merah palsu
  begitu `public/build` ada.
- Otorisasi baca foto absensi (`/wfh/reports/{report}/attendances/{attendance}/photo`):
  pemilik boleh, `kepala_*` hanya bila bidangnya sama, kolega lain 403. Rute ini
  sengaja tanpa `permission:` (tidak bisa menyatakan "pemilik ATAU atasan"), jadi
  sebelumnya seluruh jalur baca tak teruji — mencopot guard-nya membuat suite
  tetap hijau.
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
