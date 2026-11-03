/**
 * Router map aplikasi (frontend-phase1, Phase 3-4).
 *
 * Kontrak (spec §Project Structure: "routes/index.tsx → peta route, semua di
 * dalam AppShell"; catatan T10 di plan: leaf-nya dibuat bersama task halaman
 * pertama):
 * - `/login` publik (di luar guard)
 * - Alur reset password publik (openapi: security[]): `/forgot-password` →
 *   `/verify-otp` → `/reset-password`
 * - `/verify/:token` publik (modul verification, openapi: security[]): kartu
 *   hasil verifikasi dokumen QR — di luar guard, tanpa AppShell, tanpa entri
 *   nav-registry (bukan fitur sesi login).
 * - Route terlindungi dibungkus `ProtectedRoute` (guard sesi + must_change)
 *   dan `SessionBootstrap` (rehidrasi user via GET /auth/me). `/change-password`
 *   berada di dalam guard karena endpoint bearer; ia lolos guard via path.
 * - `/change-password` juga satunya-satunya tujuan saat guard must_change aktif.
 * - Halaman Beranda (placeholder) menunggu modul WFH/Change/fase berikutnya;
 *   outletnya tetap minimal.
 */
import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { SessionBootstrap } from "@/routes/SessionBootstrap";

// Route-level code splitting (ship review #12): the animate-ui kit (Select,
// Popover, Command, Calendar, FileInput) pushed the single bundle past 1 MB.
// Heavy page modules load on demand; the auth/reset/verify pages stay small
// enough to remain in the bootstrap chunk so login is never split.
const LoginPage = lazy(() => import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const ChangePasswordPage = lazy(() => import("@/pages/auth/ChangePasswordPage").then((m) => ({ default: m.ChangePasswordPage })));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const OtpVerificationPage = lazy(() => import("@/pages/auth/OtpVerificationPage").then((m) => ({ default: m.OtpVerificationPage })));
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const VerifyPage = lazy(() => import("@/pages/verification/VerifyPage").then((m) => ({ default: m.VerifyPage })));
const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const WfhReportsPage = lazy(() => import("@/pages/wfh/WfhReportsPage").then((m) => ({ default: m.WfhReportsPage })));
const WfhReportDetailPage = lazy(() => import("@/pages/wfh/WfhReportDetailPage").then((m) => ({ default: m.WfhReportDetailPage })));
const TeamReportsPage = lazy(() => import("@/pages/wfh/TeamReportsPage").then((m) => ({ default: m.TeamReportsPage })));
const MonitoringPage = lazy(() => import("@/pages/wfh/MonitoringPage").then((m) => ({ default: m.MonitoringPage })));
const ChangesPage = lazy(() => import("@/pages/changes/ChangesPage").then((m) => ({ default: m.ChangesPage })));
const ChangePackageFormPage = lazy(() => import("@/pages/changes/ChangePackageFormPage").then((m) => ({ default: m.ChangePackageFormPage })));
const ChangePackageDetailPage = lazy(() => import("@/pages/changes/ChangePackageDetailPage").then((m) => ({ default: m.ChangePackageDetailPage })));
const UsersPage = lazy(() => import("@/pages/admin/UsersPage").then((m) => ({ default: m.UsersPage })));
const UserFormPage = lazy(() => import("@/pages/admin/UserFormPage").then((m) => ({ default: m.UserFormPage })));
const RolesPage = lazy(() => import("@/pages/admin/RolesPage").then((m) => ({ default: m.RolesPage })));
const SettingsPage = lazy(() => import("@/pages/admin/SettingsPage").then((m) => ({ default: m.SettingsPage })));

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
  {
    path: "/login",
    element: (
      <Suspense fallback={null}>
        <LoginPage />
      </Suspense>
    ),
  },
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
          { path: "/changes", element: <ChangesPage /> },
          { path: "/changes/new", element: <ChangePackageFormPage /> },
          { path: "/changes/:packageId/edit", element: <ChangePackageFormPage /> },
          { path: "/changes/:packageId", element: <ChangePackageDetailPage /> },
          { path: "/admin/users", element: <UsersPage /> },
          { path: "/admin/users/new", element: <UserFormPage /> },
          { path: "/admin/users/:userId/edit", element: <UserFormPage /> },
          { path: "/admin/roles", element: <RolesPage /> },
          { path: "/admin/settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
  {
    path: "/forgot-password",
    element: (
      <Suspense fallback={null}>
        <ForgotPasswordPage />
      </Suspense>
    ),
  },
  {
    path: "/verify-otp",
    element: (
      <Suspense fallback={null}>
        <OtpVerificationPage />
      </Suspense>
    ),
  },
  {
    path: "/reset-password",
    element: (
      <Suspense fallback={null}>
        <ResetPasswordPage />
      </Suspense>
    ),
  },
  {
    path: "/verify/:token",
    element: (
      <Suspense fallback={null}>
        <VerifyPage />
      </Suspense>
    ),
  },
]);
