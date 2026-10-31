/**
 * SessionBootstrap — rehidrasi user setelah refresh (frontend-phase1 Phase 3).
 *
 * Kontrak (spec §Success Criteria 2): sesi bertahan lewat `GET /auth/me`.
 * Token sudah di-rehydrate dari localStorage oleh `makeStore`; yang hilang
 * hanyalah `user` (sengaja null di `initialAuthState`), jadi bootstrapper ini
 * men-dispatch `fetchMe` selama token ada, user belum termuat, dan tidak ada
 * permintaan yang sedang berjalan.
 *
 * Sengaja TIDAK membersihkan token saat rehidrasi gagal: 401 sudah ditangani
 * interceptor `@/api/client` (hapus localStorage + redirect /login); error
 * non-401 (jaringan mati) tidak boleh mengakhiri sesi yang masih valid —
 * efek ini menyala ulang setelah `fetchMe.rejected` (status kembali dari
 * "loading"), jadi rehidrasi mencoba lagi saat jaringan pulih tanpa latch
 * satu-kali yang membekukan sesi tanpa user.
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchMe } from "@/store/authSlice";

interface WithAuth {
  auth: { token: string | null; user: unknown; status: string };
}

export function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s: WithAuth) => s.auth.token);
  const user = useAppSelector((s: WithAuth) => s.auth.user);
  const status = useAppSelector((s: WithAuth) => s.auth.status);

  useEffect(() => {
    // `status === "loading"` mencakup fetchMe yang sedang berjalan (mencegah
    // double-dispatch saat re-render); setelah rejected/failed, efek menyala
    // ulang dan mencoba lagi.
    if (!token || user || status === "loading") return;
    void dispatch(fetchMe());
  }, [dispatch, token, user, status]);

  return <>{children}</>;
}

