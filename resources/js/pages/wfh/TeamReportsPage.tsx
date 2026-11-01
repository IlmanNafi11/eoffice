/**
 * TeamReportsPage — daftar laporan WFH tim (modul wfh-team-reports, Task 3).
 *
 * Alur (plan Task 3):
 * - mount → `fetchWfhTeamReports` dengan query bersih (halaman 1);
 * - baris render tim (`TeamNested`), tanggal, pembuat (`creator`), dan
 *   status badge via `WfhStatusBadge` (satu sumber label status);
 * - pagination primitive (`components/wfh/pagination`) → fetch halaman tujuan
 *   dengan `per_page` aktif supaya kombinasi query tidak berubah;
 * - per halaman → fetch ulang dari halaman 1; nilai default (15) tidak dikirim
 *   supaya query tetap ramping;
 * - list kosong → pesan bahasa Indonesia; fetch gagal → pesan `list.error`.
 *
 * Form create (Task 4) dan aksi approve/reject (Task 5) menyusul — slice
 * sudah menyediakan actionError untuk pesan 403/422 mutasi.
 */
import { useEffect, useState } from "react";
import { UsersRound } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/wfh/pagination";
import { WfhStatusBadge } from "@/components/wfh/status-badge";
import {
  fetchWfhTeamReports,
  selectWfhTeamList,
  selectWfhTeamListItems,
  selectWfhTeamListMeta,
} from "@/store/wfhTeamSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

const PER_PAGE_OPTIONS = [10, 15, 25, 50, 100];

export function TeamReportsPage() {
  const dispatch = useAppDispatch();

  const { status, error, query } = useAppSelector(selectWfhTeamList);
  const items = useAppSelector(selectWfhTeamListItems);
  const meta = useAppSelector(selectWfhTeamListMeta);

  // `perPage` null = pakai default backend 15 (tidak dikirim).
  const [perPage, setPerPage] = useState<number | null>(null);

  useEffect(() => {
    dispatch(fetchWfhTeamReports({}));
  }, [dispatch]);

  const loading = status === "loading";

  /** Halaman tujuan dari pagination — per_page aktif dipertahankan. */
  function fetchPage(page: number) {
    dispatch(
      fetchWfhTeamReports({
        ...(query.per_page !== undefined ? { per_page: query.per_page } : {}),
        page,
      }),
    );
  }

  /** Ganti per halaman → reset ke halaman 1. */
  function applyPerPage(value: string) {
    const n = Number.parseInt(value, 10);
    setPerPage(Number.isFinite(n) ? n : null);
    dispatch(
      fetchWfhTeamReports({
        ...(Number.isFinite(n) ? { per_page: n } : {}),
        page: 1,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Laporan Tim</h1>
          <p className="text-sm text-muted-foreground">
            Daftar laporan WFH tingkat tim dan persetujuannya.
          </p>
        </div>
        <UsersRound aria-hidden="true" className="size-5 text-muted-foreground" />
      </div>

      <Card size="sm">
        <CardContent>
          <form className="flex flex-wrap items-end gap-3">
            <Field className="w-36" orientation="vertical">
              <FieldLabel htmlFor="team-reports-perpage">Per halaman</FieldLabel>
              <select
                id="team-reports-perpage"
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
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Laporan Tim</CardTitle>
          <CardDescription>Total {meta?.total ?? 0} laporan</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && items.length === 0 ? (
            <div className="space-y-2" data-testid="team-reports-loading">
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
              <p>Belum ada laporan tim untuk filter ini.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Tim</th>
                      <th className="py-2 pr-4 font-medium">Tanggal</th>
                      <th className="py-2 pr-4 font-medium">Pembuat</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr
                        key={r.id}
                        data-testid={`team-report-row-${r.id}`}
                        className="border-b border-border/60"
                      >
                        <td className="py-2 pr-4 font-medium">{r.team?.name ?? "-"}</td>
                        <td className="py-2 pr-4">{r.report_date}</td>
                        <td className="py-2 pr-4">{r.creator?.name ?? "-"}</td>
                        <td className="py-2">
                          <WfhStatusBadge status={r.status} />
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