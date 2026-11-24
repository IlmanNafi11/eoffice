/**
 * TrendChart — grafik kepatuhan 14 hari kerja terakhir (modul dashboard, T7).
 *
 * Kontrak:
 * - Menerima `days: DashboardTrendDay[]` + `summary`; bar `compliant` per
 *   tanggal (label sumbu `dd/MM`); ringkasan pembilang + penyebut agregat
 *   ("118 dari 140"), bukan persen telanjang.
 * - Chart memakai `ChartContainer` shadcn (generated, style radix-nova);
 *   warna via token tema (`--chart-*`), bukan hardcode.
 */
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DashboardTrend } from "@/api/types";

const chartConfig = {
  compliant: { label: "Patuh", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** `2026-11-03` → `03/11` (label sumbu-x ringkas). */
function labelOf(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

export function TrendChart({ trend }: { trend: DashboardTrend | undefined }) {
  if (!trend) return null;

  const data = trend.days.map((day) => ({ ...day, label: labelOf(day.date) }));

  return (
    <Card data-testid="trend-chart">
      <CardHeader>
        <CardTitle>Tren Kepatuhan</CardTitle>
        <CardDescription data-testid="trend-summary">
          {trend.summary.compliant} dari {trend.summary.total} hari kerja terpenuhi
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-48 w-full">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="compliant" fill="var(--color-compliant)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
