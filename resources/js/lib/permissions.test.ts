import { describe, it, expect } from "vitest";
import { can, hasRole } from "@/lib/permissions";
import { NAV_REGISTRY, visibleNav } from "@/lib/nav-registry";
import type { AuthUser } from "@/api/types";

/**
 * Permission string di bawah ini disalin apa adanya dari
 * `database/seeders/RolePermissionSeeder.php` (sumber kebenaran RBAC).
 * Kalau seeder berubah, test ini harus ikut berubah — itulah gunanya:
 * registry nav tidak boleh memakai permission yang tidak pernah di-seed.
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

/** Permission per role persis seperti `RolePermissionSeeder` (demo users). */
const STAF_PERMISSIONS = [
  "wfh.attendance.create",
  "wfh.report.create",
  "wfh.report.update",
  "wfh.report.submit",
  "wfh.report.activity.delete",
  "wfh.report.attendance.delete",
  "change.initiation.delete",
  "wfh.report.delete",
  "wfh.report.export_pdf",
  "change.initiation.view",
  "change.initiation.create",
  "change.initiation.update",
  "change.initiation.submit",
  "change.implementation.view",
  "change.implementation.create",
  "change.implementation.update",
  "change.implementation.submit",
];

const KEPALA_TIM_PERMISSIONS = [
  "wfh.attendance.create",
  "wfh.report.create",
  "wfh.report.update",
  "wfh.report.activity.delete",
  "wfh.report.attendance.delete",
  "change.initiation.delete",
  "wfh.report.submit",
  "wfh.monitoring.view",
  "wfh.team_report.view",
  "wfh.report.export_pdf",
  "change.initiation.view",
  "change.initiation.create",
  "change.initiation.update",
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
];

const KEPALA_BIDANG_PERMISSIONS = [
  "wfh.attendance.create",
  "wfh.report.create",
  "wfh.report.update",
  "wfh.report.submit",
  "wfh.report.approve",
  "wfh.report.activity.delete",
  "wfh.report.attendance.delete",
  "change.initiation.delete",
  "wfh.report.reject",
  "wfh.monitoring.view",
  "wfh.report.export_pdf",
  "wfh.team_report.view",
  "wfh.team_report.approve",
  "wfh.team_report.reject",
  "change.initiation.view",
  "change.initiation.export_pdf",
  "change.implementation.view",
  "change.implementation.export_pdf",
];

/** Admin memegang `Permission::all()`; di sini cukup gabungan role + RBAC admin. */
const ADMIN_PERMISSIONS = [
  ...new Set([
    ...STAF_PERMISSIONS,
    ...KEPALA_TIM_PERMISSIONS,
    ...KEPALA_BIDANG_PERMISSIONS,
    "user.manage",
    "user.create",
    "user.update",
    "user.delete",
    "user.import",
    "role.manage",
    "permission.manage",
    "setting.manage",
    "wfh.report.delete",
    "wfh.team_report.create",
    "wfh.team_report.approve",
    "wfh.team_report.reject",
    "change.implementation.export_pdf",
  ]),
];

function userWith(roles: string[], permissions: string[]): AuthUser {
  return {
    id: 1,
    name: "Budi Santoso",
    nip: "199001012023011001",
    email: "budi@kominfo.go.id",
    must_change_password: false,
    is_active: true,
    roles,
    permissions,
  };
}

const staf = userWith(["staf"], STAF_PERMISSIONS);
const kepalaTim = userWith(["kepala_tim"], KEPALA_TIM_PERMISSIONS);
const kepalaBidang = userWith(["kepala_bidang"], KEPALA_BIDANG_PERMISSIONS);
const admin = userWith(["admin"], ADMIN_PERMISSIONS);

const navIds = (user: AuthUser | null) => visibleNav(user).map((item) => item.id);

describe("lib/permissions — can()", () => {
  it("true bila permission ada di payload user", () => {
    expect(can(kepalaTim, "wfh.monitoring.view")).toBe(true);
  });

  it("false bila permission tidak dimiliki", () => {
    expect(can(staf, "wfh.monitoring.view")).toBe(false);
  });

  it("false untuk user null (shell render sebelum GET /auth/me selesai)", () => {
    expect(can(null, "wfh.report.create")).toBe(false);
  });

  it("false untuk user undefined", () => {
    expect(can(undefined, "wfh.report.create")).toBe(false);
  });

  it("tidak memberi grant implisit untuk role admin", () => {
    // Backend memberi admin SEMUA permission lewat seeder, bukan bypass nama
    // role. Frontend tidak boleh menciptakan aturan yang tidak ada di server.
    const adminTanpaPermission = userWith(["admin"], []);
    expect(can(adminTanpaPermission, "setting.manage")).toBe(false);
  });

  it("aman bila payload user belum membawa permissions", () => {
    const tanpaDaftar = { ...userWith(["staf"], []), permissions: undefined } as unknown as AuthUser;
    expect(can(tanpaDaftar, "wfh.report.create")).toBe(false);
  });
});

describe("lib/permissions — hasRole()", () => {
  it("true bila role ada", () => {
    expect(hasRole(kepalaBidang, "kepala_bidang")).toBe(true);
  });

  it("false bila role tidak dimiliki", () => {
    expect(hasRole(staf, "admin")).toBe(false);
  });

  it("false untuk user null", () => {
    expect(hasRole(null, "staf")).toBe(false);
  });
});

describe("lib/nav-registry — bentuk registry", () => {
  it("setiap entri punya id unik, label, path absolut, dan ikon", () => {
    const ids = NAV_REGISTRY.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const item of NAV_REGISTRY) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.path.startsWith("/")).toBe(true);
      expect(item.icon).toBeTruthy();
    }
  });

  it("setiap requiredPermission adalah permission yang benar-benar di-seed", () => {
    const tidakDikenal = NAV_REGISTRY.map((item) => item.requiredPermission)
      .filter((perm): perm is string => typeof perm === "string")
      .filter((perm) => !SEEDED_PERMISSIONS.includes(perm));

    expect(tidakDikenal).toEqual([]);
  });
});

describe("lib/nav-registry — visibleNav() per role", () => {
  it("staf: tanpa monitoring, laporan tim, dan menu admin", () => {
    expect(navIds(staf)).toEqual(["home", "wfh", "changes", "profile"]);
  });

  it("kepala_tim: menambah monitoring + laporan tim", () => {
    expect(navIds(kepalaTim)).toEqual([
      "home",
      "wfh",
      "monitoring",
      "team-report",
      "changes",
      "profile",
    ]);
  });

  it("kepala_bidang: menu sama dengan kepala_tim — pembeda antar keduanya ada di aksi, bukan menu", () => {
    // kepemilikan view-level identik (monitoring + team_report); yang berbeda
    // adalah wfh.report.approve (kepala_bidang) vs change.initiation.approve
    // (kepala_tim), dan itu menggerakkan tombol di dalam halaman, bukan sidebar.
    expect(navIds(kepalaBidang)).toEqual(navIds(kepalaTim));
  });

  it("admin: seluruh entri termasuk menu khusus admin", () => {
    expect(navIds(admin)).toEqual([
      "home",
      "wfh",
      "monitoring",
      "team-report",
      "changes",
      "users",
      "settings",
      "profile",
    ]);
  });

  it("user null: hanya entri tanpa syarat permission", () => {
    expect(navIds(null)).toEqual(["home", "profile"]);
  });

  it("urutan mengikuti urutan registry, bukan urutan permission user", () => {
    const urutanRegistry = NAV_REGISTRY.map((item) => item.id);
    const terfilter = navIds(admin);
    expect(terfilter).toEqual(urutanRegistry);
  });
});
