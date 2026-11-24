/**
 * AttentionCard — user dengan kepatuhan di bawah threshold (modul dashboard, T7).
 *
 * Kontrak:
 * - Hanya dirender bila backend mengirim `attention` (pemegang
 *   `wfh.monitoring.view`); urutan sudah dari backend (terendah dulu) — FE
 *   merender apa yang ada, tidak mengurut ulang.
 * - `threshold_note` ditampilkan apa adanya; `users: []` → empty state satu
 *   kalimat (bukan daftar kosong menyesatkan).
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardAttention } from "@/api/types";

export function AttentionCard({ attention }: { attention: DashboardAttention | undefined }) {
  if (!attention) return null;

  return (
    <Card data-testid="attention-card">
      <CardHeader>
        <CardTitle>Perlu Perhatian</CardTitle>
        <CardDescription>{attention.threshold_note}</CardDescription>
      </CardHeader>
      <CardContent>
        {attention.users.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="attention-empty">
            Semua user memenuhi target kepatuhan.
          </p>
        ) : (
          <ul className="space-y-2">
            {attention.users.map((user) => (
              <li
                key={user.user_id}
                data-testid="attention-row"
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  {user.name}
                  {user.team ? <span className="text-muted-foreground"> · {user.team}</span> : null}
                </span>
                <span className="tabular-nums">
                  {user.compliant}/{user.total} hari
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
