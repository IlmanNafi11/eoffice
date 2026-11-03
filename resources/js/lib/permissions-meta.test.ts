/**
 * Unit test kamus permission (spec `SPEC-rbac-ux.md`, plan Task 7).
 *
 * Kontrak:
 * - tiap permission seeder punya entri kamus (atau jatuh ke "Lainnya");
 * - `groupPermissions` mengembalikan section stabil, permission urut;
 * - input kosong aman; permission tak dikenal tidak pernah disembunyikan.
 */
import { describe, expect, it } from "vitest";

import {
  PERMISSION_META,
  UNKNOWN_SECTION,
  SECTION_ORDER,
  groupPermissions,
  permissionMeta,
} from "@/lib/permissions-meta";

/**
 * Mirror daftar permission `database/seeders/RolePermissionSeeder.php`.
 * Sumber kontrak: grid RBAC harus selalu mencerminkan daftar server.
 */
const SEEDED_PERMISSIONS = [
  "user.manage",
  "user.create",
  "user.update",
  "user.delete",
  "user.import",
  "role.manage",
  "permission.manage",
  "wfh.attendance.create",
  "wfh.report.create",
  "wfh.report.update",
  "wfh.report.delete",
  "wfh.report.activity.delete",
  "wfh.report.attendance.delete",
  "wfh.report.submit",
  "wfh.report.approve",
  "wfh.report.reject",
  "wfh.monitoring.view",
  "wfh.report.export_pdf",
  "change.initiation.view",
  "change.initiation.create",
  "change.initiation.update",
  "change.initiation.delete",
  "change.initiation.submit",
  "change.initiation.approve",
  "change.initiation.reject",
  "change.initiation.export_pdf",
  "change.implementation.view",
  "change.implementation.create",
  "change.implementation.update",
  "change.implementation.submit",
  "change.implementation.review",
  "change.implementation.export_pdf",
  "setting.manage",
  "wfh.team_report.view",
  "wfh.team_report.create",
  "wfh.team_report.approve",
  "wfh.team_report.reject",
];

describe("permissionMeta — label + section", () => {
  it("tiap permission seeder punya entri kamus (bukan fallback)", () => {
    const missing = SEEDED_PERMISSIONS.filter((name) => !(name in PERMISSION_META));
    expect(missing).toEqual([]);
  });

  it("tiap entri seeder punya section + label non-kosong", () => {
    for (const name of SEEDED_PERMISSIONS) {
      const meta = permissionMeta(name);
      expect(meta.section.length).toBeGreaterThan(0);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.label).not.toBe(name);
    }
  });

  it("permission tak dikenal → section 'Lainnya', label = nama mentah", () => {
    expect(permissionMeta("fitur.baru.aksi")).toEqual({
      section: UNKNOWN_SECTION,
      label: "fitur.baru.aksi",
    });
  });

  it("section kamus semuanya terdaftar di SECTION_ORDER", () => {
    for (const meta of Object.values(PERMISSION_META)) {
      expect(SECTION_ORDER).toContain(meta.section);
    }
  });
});

describe("groupPermissions — grouping stabil", () => {
  it("input kosong → array kosong (empty-safe)", () => {
    expect(groupPermissions([])).toEqual([]);
  });

  it("mengelompokkan per section, urut sesuai SECTION_ORDER", () => {
    const groups = groupPermissions(SEEDED_PERMISSIONS);
    const sections = groups.map((g) => g.section);

    // Urutan = SECTION_ORDER (tanpa "Lainnya" karena semua dikenal).
    expect(sections).toEqual(SECTION_ORDER.filter((s) => s !== UNKNOWN_SECTION));

    // Semua permission terwakili tepat sekali.
    const flat = groups.flatMap((g) => g.permissions.map((p) => p.name)).sort();
    expect(flat).toEqual([...SEEDED_PERMISSIONS].sort());
  });

  it("permission urut di dalam section", () => {
    const groups = groupPermissions(SEEDED_PERMISSIONS);
    for (const group of groups) {
      const names = group.permissions.map((p) => p.name);
      expect(names).toEqual([...names].sort());
    }
  });

  it("permission tak dikenal masuk 'Lainnya' (paling akhir) dan tetap tampil", () => {
    const groups = groupPermissions(["user.manage", "fitur.baru"]);

    const last = groups.at(-1);
    expect(last).toBeDefined();
    expect(last!.section).toBe(UNKNOWN_SECTION);
    expect(last!.permissions).toEqual([
      { name: "fitur.baru", label: "fitur.baru" },
    ]);
    expect(groups[0]!.permissions).toEqual([
      { name: "user.manage", label: permissionMeta("user.manage").label },
    ]);
  });

  it("tiap permission pasangan {name,label} dari kamus", () => {
    const groups = groupPermissions(["wfh.report.approve"]);
    expect(groups[0]!.permissions[0]).toEqual({
      name: "wfh.report.approve",
      label: permissionMeta("wfh.report.approve").label,
    });
  });
});
