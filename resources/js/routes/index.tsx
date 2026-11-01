/**
 * Router map aplikasi (frontend-phase1, Phase 3-4).
 *
 * Kontrak (spec §Project Structure: "routes/index.tsx → peta route, semua di
 * dalam AppShell"; catatan T10 di plan: leaf-nya dibuat bersama task halaman
 * pertama):
 * - `/login` publik (di luar guard)
 * - Alur reset password publik (openapi: security[]): `/forgot-password` →
 *   `/verify-otp` → `/reset-password`
 * - Route terlindungi dibungkus `ProtectedRoute` (guard sesi + must_change)
 *   dan `SessionBootstrap` (rehidrasi user via GET /auth/me). `/change-password`
 *   berada di dalam guard karena endpoint bearer; ia lolos guard via path.
 * - `/change-password` juga satunya-satunya tujuan saat guard must_change aktif.
 * - Halaman Beranda (placeholder) menunggu modul WFH/Change/fase berikutnya;
 *   outletnya tetap minimal.
 */
import { createBrowserRouter } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { ChangePasswordPage } from "@/pages/auth/ChangePasswordPage";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { ProfilePage } from "@/pages/profile/ProfilePage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { OtpVerificationPage } from "@/pages/auth/OtpVerificationPage";
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage";
import { WfhReportsPage } from "@/pages/wfh/WfhReportsPage";
import { WfhReportDetailPage } from "@/pages/wfh/WfhReportDetailPage";
import { TeamReportsPage } from "@/pages/wfh/TeamReportsPage";
import { MonitoringPage } from "@/pages/wfh/MonitoringPage";

import { SessionBootstrap } from "@/routes/SessionBootstrap";

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
    element: (
      <SessionBootstrap>
        <ProtectedRoute />
      </SessionBootstrap>
    ),
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <HomePage /> },
          { path: "/profile", element: <ProfilePage /> },
          { path: "/change-password", element: <ChangePasswordPage /> },
          { path: "/wfh", element: <WfhReportsPage /> },
          { path: "/wfh/:reportId", element: <WfhReportDetailPage /> },
          { path: "/monitoring", element: <MonitoringPage /> },
          { path: "/team-reports", element: <TeamReportsPage /> },
        ],
      },
    ],
  },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/verify-otp", element: <OtpVerificationPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
]);