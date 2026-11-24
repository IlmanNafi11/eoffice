/**
 * ShortcutsRow — pintasan cepat sesuai permission peminta (modul dashboard, T7).
 *
 * Kontrak:
 * - Satu-satunya sumber hak akses tetap `can()` (permission gabungan dari
 *   payload user); tidak ada grant implisit per role.
 * - Pintasan dasar (absen + laporan WFH) tampil bagi pemegang
 *   `wfh.report.create`; pintasan lain hanya muncul bila permission-nya ada.
 * - Tanpa satu pun pintasan → baris tidak dirender.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import type { AuthUser } from "@/api/types";

interface Shortcut {
  label: string;
  to: string;
  requiredPermission: string;
}

const SHORTCUTS: Shortcut[] = [
  { label: "Absen & laporan WFH", to: "/wfh", requiredPermission: "wfh.report.create" },
  { label: "Monitoring WFH", to: "/monitoring", requiredPermission: "wfh.monitoring.view" },
  { label: "Laporan tim", to: "/team-reports", requiredPermission: "wfh.team_report.view" },
  { label: "Paket perubahan", to: "/changes", requiredPermission: "change.initiation.view" },
  { label: "Kelola user", to: "/admin/users", requiredPermission: "user.manage" },
];

export function ShortcutsRow({ user }: { user: AuthUser | null | undefined }) {
  const shortcuts = SHORTCUTS.filter((item) => can(user, item.requiredPermission));
  if (shortcuts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" data-testid="shortcuts-row">
      {shortcuts.map((item) => (
        <Button key={item.to} asChild variant="secondary" size="sm">
          <Link to={item.to} data-testid="shortcut-link">
            {item.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
