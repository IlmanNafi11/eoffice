/**
 * ProtectedRoute — guard sesi & must_change_password (frontend-phase1 Phase 2).
 *
 * Kontrak (spec §Project Structure, §Resolved Questions 3):
 * - Tanpa token (belum login, atau sesi sudah dibersihkan interceptor 401)
 *   → redirect ke `/login`.
 * - `user.must_change_password === true` → semua route diblokir kecuali
 *   `/change-password`, tempat user dipaksa mengganti password dulu.
 * - Sesi valid → render `<Outlet/>` (route anak dari `routes/index.tsx`).
 *
 * Catatan: `user` boleh `null` saat shell baru mount (`fetchMe` berjalan);
 * guard tidak menolak sesi valid hanya karena user belum termuat — flag
 * `must_change_password` baru aktif setelah user ada.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAppSelector } from "@/store/hooks";
import { selectToken, selectUser } from "@/store/authSlice";

/** Satu-satunya route yang lolos saat `must_change_password` aktif. */
const CHANGE_PASSWORD_PATH = "/change-password";

export function ProtectedRoute() {
  const token = useAppSelector(selectToken);
  const user = useAppSelector(selectUser);
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (user?.must_change_password && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }

  return <Outlet />;
}
