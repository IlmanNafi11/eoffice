/**
 * QueueCard — antrean keputusan milik peminta (modul dashboard, T7).
 *
 * Kontrak:
 * - Setiap kunci `queue` hanya ada bila backend menganggap peminta berhak;
 *   kartu dirender hanya bila minimal satu kunci hadir (`undefined` = tidak
 *   dirender).
 * - Satu baris per kunci: jumlah + tautan ke list tempat memutuskan. Jumlah
 *   adalah angka apa adanya (pembilang dari backend, bukan turunan FE).
 */
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DashboardQueue } from "@/api/types";

interface QueueRow {
  key: keyof DashboardQueue;
  text: (count: number) => string;
  to: string;
  label: string;
}

const ROWS: QueueRow[] = [
  {
    key: "change_initiations_pending",
    text: (count) => `${count} paket perubahan menunggu keputusan`,
    to: "/changes",
    label: "Buka paket perubahan",
  },
  {
    key: "implementations_review",
    text: (count) => `${count} implementasi menunggu review`,
    to: "/changes",
    label: "Buka implementasi",
  },
  {
    key: "team_reports_pending",
    text: (count) => `${count} laporan tim menunggu persetujuan`,
    to: "/team-reports",
    label: "Buka laporan tim",
  },
];

export function QueueCard({ queue }: { queue: DashboardQueue | undefined }) {
  if (!queue) return null;

  const rows = ROWS.flatMap((row) => {
    const entry = queue[row.key];
    return entry ? [{ ...row, count: entry.count }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <Card data-testid="queue-card">
      <CardHeader>
        <CardTitle>Menunggu Keputusan Anda</CardTitle>
        <CardDescription>Antrean yang boleh Anda putuskan saat ini.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <p className="text-sm">{row.text(row.count)}</p>
            <Button asChild variant="outline" size="sm">
              <Link to={row.to} data-testid="queue-link">
                {row.label}
              </Link>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
