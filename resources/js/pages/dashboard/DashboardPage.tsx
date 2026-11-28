/**
 * DashboardPage — beranda SPA (modul dashboard, plan T6–T7).
 *
 * Alur:
 * - mount → `fetchDashboard` sekali (satu endpoint `GET /dashboard`; seksi
 *   per-permission diputuskan backend — FE merender apa yang ada);
 * - tab kembali terlihat (`visibilitychange` → visible) → refetch; selama
 *   refetch data lama tetap dirender dengan skeleton halus (opacity) di atas
 *   data lama, bukan blank (design §Refresh, keputusan 4);
 * - seksi opsional (`queue`/`trend`/`attention`) dirender hanya bila kuncinya
 *   ada; `ShortcutsRow` mengikuti permission peminta;
 * - fetch gagal → pesan error siap tampil; data lama (bila ada) tetap
 *   dirender di atasnya (refetch halus, slice T5 yang mempertahankannya).
 */
import { lazy, Suspense, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchDashboard, selectDashboard } from "@/store/dashboardSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { TodayCards } from "@/pages/dashboard/sections/TodayCards";
const TrendChart = lazy(() => import("@/pages/dashboard/sections/TrendChart").then((m) => ({ default: m.TrendChart })));
import { QueueCard } from "@/pages/dashboard/sections/QueueCard";
import { AttentionCard } from "@/pages/dashboard/sections/AttentionCard";
import { ShortcutsRow } from "@/pages/dashboard/sections/ShortcutsRow";
import { selectUser } from "@/store/authSlice";

export function DashboardPage() {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectDashboard);
  const user = useAppSelector(selectUser);

  useEffect(() => {
    void dispatch(fetchDashboard());
  }, [dispatch]);

  // Refetch saat tab kembali fokus; thunk terbaru dipakai lewat ref di hook.
  useRefetchOnFocus(() => void dispatch(fetchDashboard()));

  // Skeleton halus: refetch berjalan di atas data lama (bukan fetch pertama).
  const refetching = status === "loading" && data != null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Beranda</h1>
        <p className="text-sm text-muted-foreground">Ringkasan hari ini sesuai peran Anda.</p>
      </div>

      {error && (
        <Card className="border-destructive/50" data-testid="dashboard-error" role="alert">
          <CardContent className="text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className={refetching ? "space-y-6 opacity-60 transition-opacity" : "space-y-6"}>
        <TodayCards section={data?.today} status={status} />
        <Suspense fallback={null}>
          <TrendChart trend={data?.trend} />
        </Suspense>
        <QueueCard queue={data?.queue} />
        <AttentionCard attention={data?.attention} />
      </div>

      <ShortcutsRow user={user} />
    </div>
  );
}
