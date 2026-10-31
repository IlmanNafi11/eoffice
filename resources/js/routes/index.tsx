/**
 * Router map aplikasi (frontend-phase1, Phase 3).
 *
 * Kontrak (spec §Project Structure: "routes/index.tsx → peta route, semua di
 * dalam AppShell"; catatan T10 di plan: leaf-nya dibuat bersama task halaman
 * pertama):
 * - `/login` publik (di luar guard) — satu-satunya route otentikasi yang ada
 *   sejak Slice 1.
 * - Route terlindungi dibungkus `ProtectedRoute` (guard sesi +
 *   `must_change_password`). Halaman Beranda sengaja belum ada sebagai file
 *   (task "Beranda" tidak ada di plan); outletnya placeholder minimal yang
 *   akan diganti modul WFH/Change di fase berikutnya.
 */

import { createBrowserRouter } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { LoginPage } from "@/pages/auth/LoginPage";

/** Placeholder outlet `/` sampai modul WFH/Change (fase berikutnya). */
function HomePage() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <LayoutDashboard aria-hidden="true" className="size-5" />
      <span>Beranda — modul menyusul di fase berikutnya.</span>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [{ path: "/", element: <HomePage /> }],
      },
    ],
  },
]);
