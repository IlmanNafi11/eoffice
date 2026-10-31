/**
 * SessionBootstrap — rehidrasi user setelah refresh (frontend-phase1 Phase 3).
 *
 * Kontrak (spec §Success Criteria 2): sesi bertahan lewat `GET /auth/me`.
 * Token sudah di-rehydrate dari localStorage oleh `makeStore`; yang hilang
 * hanyalah `user` (sengaja null di `initialAuthState`), jadi bootstrapper ini
 * men-dispatch `fetchMe` tepat sekali saat token ada dan user belum termuat.
 *
 * Sengaja TIDAK membersihkan token saat rehidrasi gagal: 401 sudah ditangani
 * interceptor `@/api/client` (hapus localStorage + redirect /login); error
 * non-401 (jaringan mati) tidak boleh mengakhiri sesi yang masih valid.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchMe } from "@/store/authSlice";

interface WithAuth {
  auth: { token: string | null; user: unknown };
}

export function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s: WithAuth) => s.auth.token);
  const user = useAppSelector((s: WithAuth) => s.auth.user);
  // Guard mounting rapat (React StrictMode / re-render): satu rehidrasi per
  // sesi browser, bukan per render.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || !token || user) return;
    attempted.current = true;
    void dispatch(fetchMe());
  }, [dispatch, token, user]);

  return <>{children}</>;
}
