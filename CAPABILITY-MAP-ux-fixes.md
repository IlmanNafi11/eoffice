# CAPABILITY-MAP-ux-fixes

> **CLOSED 2026-11-03 — ketiga modul tuntas.** Commits: 74fb2e3, a8010f3,
> 639ed44 (wfh-reports-ux), 65cd6bd, 845cb3c, aa035f1 (ux-settings),
> bce5668, 0fc1c89 (rbac-ux), closeout (+CHANGELOG). Plan/todo diarsipkan
> di `tasks/archive/{plan,todo}-ux-fixes.md`. E2E manual 3 alur direkam di
> pesan commit closeout.

> Phase 0, approved 2026-11-03. Intent: `docs/intent/ux-settings-wfh-rbac.md`.
> Satu inisiatif perbaikan UX memayungi tiga modul yang bisa dikirim dan
> diverifikasi terpisah. Spec per modul di root repo dengan module id yang
> sama (`SPEC-<module-id>.md`).

| Module id | Responsibility | Depends on | Backend change |
|---|---|---|---|
| `wfh-reports-ux` | Tombol "Buat Laporan" di `WfhReportsPage` untuk semua pemegang `wfh.report.create` (alur pilih tanggal → POST get-or-create → navigate detail); filter halaman personal jadi rentang `date_from`–`date_to`; `MonthInput` dihapus dari `WfhReportsPage` dan tab "Semua Laporan" `MonitoringPage` | — | Kecil: `GET /api/wfh/reports` menerima `date_from`/`date_to` (pola `resolveAdminBounds`); repository tidak berubah (`applyDateRangeFilter` sudah menerapkannya) |
| `ux-settings` | Halaman Pengaturan dinamis: kamus label (`resources/js/lib/settings-meta.ts`), kontrol khusus per key (checkbox 7 hari, checkbox 3 sesi fixed, TimeInput non-native), fallback key tak dikenal; validasi format nilai per key di `UpdateSettingRequest` | `ui-form-kit` (primitif Popover/Checkbox/Calendar ada) | Kecil: rule validasi per key di `UpdateSettingRequest` |
| `rbac-ux` | Halaman Peran & Permission: kamus label Indonesia per permission (`resources/js/lib/permissions-meta.ts`) + grouping per modul di dalam section role; section "Lainnya" fallback dengan nama mentah | — | Tidak ada |

**Build order:** `wfh-reports-ux` → `ux-settings` → `rbac-ux`.

Alasan: `wfh-reports-ux` satu-satunya dengan backend change (openapi.yaml +
test kontrak ikut diubah sekali jalan); dua lainnya murni frontend dan saling
independen — urutannya konvensi, bukan ketergantungan teknis.

**Konvensi lama yang berlaku:**`ui-form-kit` (CAPABILITY-MAP-frontend.md,
tertutup) adalah penyedia primitif; kontrol tanpa primitif animate setara
(time picker — terverifikasi absen dari `@animate-ui/react` dan shadcn base)
memakai komposisi base shadcn dengan pola adapter `MonthInput` (string
kontrak, Preseden dikonfirmasi user di gelombang form-consistency).
