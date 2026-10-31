/**
 * NAV_REGISTRY — satu-satunya sumber menu sidebar.
 *
 * Aturan (lihat `docs/SPEC-frontend-phase1.md` §Code Style):
 * - Sidebar tidak boleh meng-hardcode role; ia hanya memfilter registry ini
 *   lewat `can(user, requiredPermission)`.
 * - `requiredPermission` WAJIB berupa permission yang benar-benar di-seed
 *   (`database/seeders/RolePermissionSeeder.php`) dan dipakai route API.
 *   Contoh di spec (`changes.view`) adalah ilustrasi — nama sebenarnya
 *   `change.initiation.view`.
 * - Entri tanpa `requiredPermission` tampil untuk setiap sesi terautentikasi.
 */

import {
  ClipboardList,
  GitBranch,
  Home,
  Monitor,
  Settings,
  UserCog,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { can } from "@/lib/permissions";
import type { AuthUser } from "@/api/types";

export interface NavItem {
  /** Identitas stabil untuk key React dan test. */
  id: string;
  label: string;
  /** Path absolut di router. */
  path: string;
  icon: LucideIcon;
  /** Kosong = tampil untuk semua user yang sudah login. */
  requiredPermission?: string;
}

export const NAV_REGISTRY: NavItem[] = [
  { id: "home", label: "Beranda", path: "/", icon: Home },
  // `GET /wfh/reports` sendiri hanya butuh auth (scoped per user), tetapi
  // halaman ini berisi pembuatan laporan — `wfh.report.create` adalah
  // permission yang dimiliki keempat role, jadi menu tidak hilang.
  {
    id: "wfh",
    label: "WFH",
    path: "/wfh",
    icon: ClipboardList,
    requiredPermission: "wfh.report.create",
  },
  // Pembeda utama staf vs kepala tim/bidang/admin.
  {
    id: "monitoring",
    label: "Monitoring WFH",
    path: "/monitoring",
    icon: Monitor,
    requiredPermission: "wfh.monitoring.view",
  },
  {
    id: "team-report",
    label: "Laporan Tim",
    path: "/team-reports",
    icon: UsersRound,
    requiredPermission: "wfh.team_report.view",
  },
  {
    id: "changes",
    label: "Change Package",
    path: "/changes",
    icon: GitBranch,
    requiredPermission: "change.initiation.view",
  },
  {
    id: "users",
    label: "Manajemen User",
    path: "/admin/users",
    icon: UserCog,
    requiredPermission: "user.manage",
  },
  {
    id: "settings",
    label: "Pengaturan",
    path: "/admin/settings",
    icon: Settings,
    requiredPermission: "setting.manage",
  },
  { id: "profile", label: "Profil Saya", path: "/profile", icon: UserRound },
];

/**
 * Entri registry yang boleh dilihat user ini, urutan tetap seperti registry.
 * `user` null/undefined (sebelum `GET /auth/me` selesai) → hanya entri tanpa
 * syarat permission.
 */
export function visibleNav(user: AuthUser | null | undefined): NavItem[] {
  return NAV_REGISTRY.filter(
    (item) => !item.requiredPermission || can(user, item.requiredPermission),
  );
}
