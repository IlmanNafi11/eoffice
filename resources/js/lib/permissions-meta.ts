/**
 * Kamus permission — satu sumber label + section (spec `SPEC-rbac-ux.md`).
 *
 * Permission tak dikenal SELALU tampil di section "Lainnya" dengan nama
 * mentah: grid RBAC harus mencerminkan daftar server apa pun isinya, agar
 * admin tak pernah buta terhadap permission baru.
 */

export interface PermissionMeta {
  section: string;
  label: string;
}

/** Urutan tampil section; "Lainnya" selalu terakhir (fallback). */
export const UNKNOWN_SECTION = "Lainnya";

export const SECTION_ORDER: readonly string[] = [
  "Manajemen Pengguna",
  "RBAC",
  "WFH",
  "Manajemen Perubahan",
  "Pengaturan",
  UNKNOWN_SECTION,
];

export const PERMISSION_META: Record<string, PermissionMeta> = {
  // ── Manajemen Pengguna ────────────────────────────────────────────
  "user.manage": { section: "Manajemen Pengguna", label: "Kelola Pengguna" },
  "user.create": { section: "Manajemen Pengguna", label: "Tambah Pengguna" },
  "user.update": { section: "Manajemen Pengguna", label: "Ubah Pengguna" },
  "user.delete": { section: "Manajemen Pengguna", label: "Hapus Pengguna" },
  "user.import": { section: "Manajemen Pengguna", label: "Impor Pengguna" },

  // ── RBAC ──────────────────────────────────────────────────────────
  "role.manage": { section: "RBAC", label: "Kelola Peran" },
  "permission.manage": { section: "RBAC", label: "Kelola Permission" },

  // ── WFH ───────────────────────────────────────────────────────────
  "wfh.attendance.create": { section: "WFH", label: "Buat Absensi" },
  "wfh.report.create": { section: "WFH", label: "Buat Laporan WFH" },
  "wfh.report.update": { section: "WFH", label: "Ubah Laporan WFH" },
  "wfh.report.delete": { section: "WFH", label: "Hapus Laporan WFH" },
  "wfh.report.activity.delete": {
    section: "WFH",
    label: "Hapus Kegiatan Laporan",
  },
  "wfh.report.attendance.delete": {
    section: "WFH",
    label: "Hapus Absensi Laporan",
  },
  "wfh.report.submit": { section: "WFH", label: "Kirim Laporan WFH" },
  "wfh.report.approve": { section: "WFH", label: "Menyetujui Laporan" },
  "wfh.report.reject": { section: "WFH", label: "Menolak Laporan" },
  "wfh.monitoring.view": { section: "WFH", label: "Lihat Monitoring WFH" },
  "wfh.report.export_pdf": { section: "WFH", label: "Ekspor Laporan PDF" },
  "wfh.team_report.view": { section: "WFH", label: "Lihat Laporan Tim" },
  "wfh.team_report.create": { section: "WFH", label: "Buat Laporan Tim" },
  "wfh.team_report.approve": { section: "WFH", label: "Menyetujui Laporan Tim" },
  "wfh.team_report.reject": { section: "WFH", label: "Menolak Laporan Tim" },

  // ── Manajemen Perubahan ───────────────────────────────────────────
  "change.initiation.view": { section: "Manajemen Perubahan", label: "Lihat Usulan" },
  "change.initiation.create": { section: "Manajemen Perubahan", label: "Buat Usulan" },
  "change.initiation.update": { section: "Manajemen Perubahan", label: "Ubah Usulan" },
  "change.initiation.delete": { section: "Manajemen Perubahan", label: "Hapus Usulan" },
  "change.initiation.submit": { section: "Manajemen Perubahan", label: "Kirim Usulan" },
  "change.initiation.approve": { section: "Manajemen Perubahan", label: "Menyetujui Usulan" },
  "change.initiation.reject": { section: "Manajemen Perubahan", label: "Menolak Usulan" },
  "change.initiation.export_pdf": {
    section: "Manajemen Perubahan",
    label: "Ekspor Usulan PDF",
  },
  "change.implementation.view": { section: "Manajemen Perubahan", label: "Lihat Implementasi" },
  "change.implementation.create": { section: "Manajemen Perubahan", label: "Buat Implementasi" },
  "change.implementation.update": { section: "Manajemen Perubahan", label: "Ubah Implementasi" },
  "change.implementation.submit": { section: "Manajemen Perubahan", label: "Kirim Implementasi" },
  "change.implementation.review": { section: "Manajemen Perubahan", label: "Review Implementasi" },
  "change.implementation.export_pdf": {
    section: "Manajemen Perubahan",
    label: "Ekspor Implementasi PDF",
  },

  // ── Pengaturan ────────────────────────────────────────────────────
  "setting.manage": { section: "Pengaturan", label: "Kelola Pengaturan" },
};

/** Meta permission dengan fallback aman (label = nama mentah). */
export function permissionMeta(name: string): PermissionMeta {
  return PERMISSION_META[name] ?? { section: UNKNOWN_SECTION, label: name };
}

export interface PermissionGroup {
  section: string;
  permissions: { name: string; label: string }[];
}

/**
 * Kelompokkan nama permission per section. Urutan section mengikuti
 * `SECTION_ORDER` (fallback "Lainnya" paling akhir); di dalam section,
 * permission diurut alfabetis. Section kosong tidak muncul.
 */
export function groupPermissions(names: string[]): PermissionGroup[] {
  const bySection = new Map<string, { name: string; label: string }[]>();

  for (const name of [...names].sort()) {
    const { section, label } = permissionMeta(name);
    const bucket = bySection.get(section);
    if (bucket) {
      bucket.push({ name, label });
    } else {
      bySection.set(section, [{ name, label }]);
    }
  }

  const known = SECTION_ORDER.filter(
    (section) => section !== UNKNOWN_SECTION,
  ).filter((section) => bySection.has(section));

  const ordered = bySection.has(UNKNOWN_SECTION)
    ? [...known, UNKNOWN_SECTION]
    : known;

  return ordered.map((section) => ({
    section,
    permissions: bySection.get(section) ?? [],
  }));
}
