/**
 * WfhReportsPage — daftar laporan WFH personal (frontend-phase2, Phase 3).
 *
 * Alur (plan Task "WfhReportsPage"):
 * - mount → `fetchWfhReports` dengan query bersih (halaman 1);
 * - filter tanggal (YYYY-MM-DD) / bulan (YYYY-MM) bersifat lokal sampai
 *   "Terapkan" ditekan, lalu fetch ulang (openapi: `date` menang atas `month`
 *   di sisi backend; frontend hanya meneruskan yang terisi);
 * - per halaman (`per_page`, clamp backend 1..100) → fetch ulang dari halaman 1,
 *   nilai default (15) TIDAK dikirim supaya query tetap ramping;
 * - pagination primitive (`components/wfh/pagination`) → fetch halaman tujuan
 *   dengan filter + per_page aktif supaya kombinasi query tidak berubah;
 * - klik baris → `/wfh/{reportId}`; list kosong → pesan bahasa Indonesia;
 * - status fetch gagal → pesan `list.error` dari slice.
 *
 * Konvensi Phase 1: pesan UI Indonesia, typed hooks, komponen `.tsx`.
 * Aksi "Tambah Laporan" bukan bagian task list ini (slice create menyusul).
 */
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/wfh/pagination";
import { WfhStatusBadge } from "@/components/wfh/status-badge";
import {
  fetchWfhReports,
  selectWfhList,
  selectWfhListItems,
  selectWfhListMeta,
} from "@/store/wfhSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

const PER_PAGE_OPTIONS = [10, 15, 25, 50, 100];

export function WfhReportsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const { status, error, query } = useAppSelector(selectWfhList);
  const items = useAppSelector(selectWfhListItems);
  const meta = useAppSelector(selectWfhListMeta);

  // Filter lokal: baru dikirim ke backend saat "Terapkan" (menghindari fetch
  // per karakter). `perPage` null = pakai default backend (tidak dikirim).
  const [date, setDate] = useState("");
  const [month, setMonth] = useState("");
  const [perPage, setPerPage] = useState<number | null>(null);

  useEffect(() => {
    dispatch(fetchWfhReports({}));
  }, [dispatch]);

  const loading = status === "loading";

  /** Halaman tujuan dari pagination — filter & per_page aktif dipertahankan. */
  function fetchPage(page: number) {
    dispatch(
      fetchWfhReports({
        ...(query.date ? { date: query.date } : {}),
        ...(query.month ? { month: query.month } : {}),
        ...(perPage != null ? { per_page: perPage } : {}),
        page,
      }),
    );
  }

  /** Terapkan filter dari input lokal → selalu kembali ke halaman 1, reset per_page. */
  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPerPage(null);
    dispatch(
      fetchWfhReports({
        ...(month ? { month } : {}),
        ...(date ? { date } : {}),
        page: 1,
      }),
    );
  }

  /** Ganti per halaman → reset ke halaman 1, filter date/month tetap. */
  function applyPerPage(value: string) {
    const n = Number.parseInt(value, 10);
    setPerPage(Number.isFinite(n) ? n : null);
    dispatch(
      fetchWfhReports({
        ...(query.date ? { date: query.date } : {}),
        ...(query.month ? { month: query.month } : {}),
        ...(Number.isFinite(n) ? { per_page: n } : {}),
        page: 1,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Laporan WFH</h1>
          <p className="text-sm text-muted-foreground">
            Daftar laporan kerja dari rumah Anda.
          </p>
        </div>
        <ClipboardList aria-hidden="true" className="size-5 text-muted-foreground" />
      </div>

      <Card size="sm">
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={applyFilter}>
            <Field className="w-48" orientation="vertical">
              <FieldLabel htmlFor="wfh-filter-date">Tanggal</FieldLabel>
              <Input
                id="wfh-filter-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field className="w-44" orientation="vertical">
              <FieldLabel htmlFor="wfh-filter-month">Bulan</FieldLabel>
              <Input
                id="wfh-filter-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </Field>
            <Field className="w-36" orientation="vertical">
              <FieldLabel htmlFor="wfh-filter-perpage">Per halaman</FieldLabel>
              <select
                id="wfh-filter-perpage"
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                value={perPage?.toString() ?? "15"}
                onChange={(e) => applyPerPage(e.target.value)}
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit">Terapkan</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Laporan</CardTitle>
          <CardDescription>Total {meta?.total ?? 0} laporan</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && items.length === 0 ? (
            <div className="space-y-2" data-testid="wfh-list-loading">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <p>Belum ada laporan untuk filter ini.</p>
              <p className="mt-1">Buat laporan baru untuk tanggal kerja Anda.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Tanggal</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 text-right font-medium">Kegiatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr
                        key={r.id}
                        data-testid={`wfh-report-row-${r.id}`}
                        className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50"
                        onClick={() => navigate(`/wfh/${r.id}`)}
                      >
                        <td className="py-2 pr-4 font-medium">{r.report_date}</td>
                        <td className="py-2 pr-4">
                          <WfhStatusBadge status={r.status} />
                        </td>
                        <td className="py-2 text-right">
                          {r.activity_count ?? r.activities?.length ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Pagination meta={meta} onPageChange={fetchPage} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}