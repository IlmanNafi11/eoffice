/**
 * DashboardPage — beranda SPA (modul dashboard, plan T6).
 *
 * Alur:
 * - mount → `fetchDashboard` sekali (satu endpoint `GET /dashboard`; seksi
 *   per-permission diputuskan backend — FE merender apa yang ada);
 * - seksi opsional (`queue`/`trend`/`attention`) mengikuti T7; T6 merender
 *   seksi `today` (selalu ada) via `TodayCards`;
 * - fetch gagal → pesan error siap tampil; data lama (bila ada) tetap
 *   dirender di atasnya (refetch halus, slice T5 yang mempertahankannya).
 */
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchDashboard, selectDashboard } from "@/store/dashboardSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { TodayCards } from "@/pages/dashboard/sections/TodayCards";

export function DashboardPage() {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectDashboard);

  useEffect(() => {
    void dispatch(fetchDashboard());
  }, [dispatch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Beranda</h1>
        <p className="text-sm text-muted-foreground">Ringkasan hari ini sesuai peran Anda.</p>
      </div>

      {error && (
        <Card className="border-destructive/50" data-testid="dashboard-error">
          <CardContent className="text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <TodayCards section={data?.today} status={status} />
    </div>
  );
}
