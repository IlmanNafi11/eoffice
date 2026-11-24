/**
 * `useRefetchOnFocus` — muat ulang data saat tab kembali terlihat.
 *
 * Kontrak:
 * - Hanya bereaksi pada `visibilitychange` → `document.visibilityState === "visible"`;
 *   menyembunyikan tab tidak memicu fetch.
 * - Listener dipasang sekali per mount (cleanup saat unmount).
 * - `refetch` disimpan di ref sehingga callback terbaru selalu dipakai tanpa
 *   memasang ulang listener tiap render.
 */
import { useEffect, useRef } from "react";

export function useRefetchOnFocus(refetch: () => void): void {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") refetchRef.current();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);
}
