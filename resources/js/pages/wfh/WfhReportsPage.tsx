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
 * Task UX-fixes Task 2: tombol "Buat Laporan" (gate `wfh.report.create`)
 * → dialog DateInput default hari ini → `createWfhReport({report_date})`
 * → navigate `/wfh/{id}` (get-or-create 200/201 sama-sama navigate).
 */
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { MonthInput } from "@/components/ui/month-input";
import { DateInput, toDateString } from "@/components/ui/date-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/wfh/pagination";
import { WfhReportRow } from "@/components/wfh/report-row";
import {
  fetchWfhReports,
  selectWfhList,
  selectWfhListItems,
  selectWfhListMeta,
} from "@/store/wfhSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { can } from "@/lib/permissions";
import { selectUser } from "@/store/authSlice";
import { createWfhReport } from "@/api/wfh";

const PER_PAGE_OPTIONS = [10, 15, 25, 50, 100];

export function WfhReportsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);

  const { status, error, query } = useAppSelector(selectWfhList);
  const items = useAppSelector(selectWfhListItems);
  const meta = useAppSelector(selectWfhListMeta);

  const canCreate = can(user, "wfh.report.create");

  // Filter lokal: baru dikirim ke backend saat "Terapkan" (menghindari fetch
  // per karakter). `perPage` null = pakai default backend (tidak dikirim).
  const [date, setDate] = useState("");
  const [month, setMonth] = useState("");
  const [perPage, setPerPage] = useState<number | null>(null);

  // Dialog create: DateInput bersifat lokal (get-or-create 200/201 di sisi
  // server; respons apa pun di-navigate ke detail).
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState(() => toDateString(new Date()));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  /** Buka dialog → reset tanggal ke hari ini + bersihkan error. */
  function openCreate() {
    setCreateDate(toDateString(new Date()));
    setCreateError(null);
    setCreateOpen(true);
  }

  /** Create → navigate ke detail (200 get-or-create & 201 sama-sama). */
  async function submitCreate() {
    if (creating || !createDate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createWfhReport({ report_date: createDate });
      setCreateOpen(false);
      navigate(`/wfh/${created.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Gagal membuat laporan.");
    } finally {
      setCreating(false);
    }
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
        <div className="flex items-center gap-2">
          {canCreate ? (
            <Button type="button" onClick={openCreate}>
              <Plus aria-hidden="true" className="size-4" />
              Buat Laporan
            </Button>
          ) : null}
          <ClipboardList aria-hidden="true" className="size-5 text-muted-foreground" />
        </div>
      </div>

      <Card size="sm">
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={applyFilter}>
            <Field className="w-48" orientation="vertical">
              <FieldLabel htmlFor="wfh-filter-date">Tanggal</FieldLabel>
              <DateInput
                id="wfh-filter-date"
                value={date}
                onChange={setDate}
              />
            </Field>
            <Field className="w-44" orientation="vertical">
              <FieldLabel htmlFor="wfh-filter-month">Bulan</FieldLabel>
              <MonthInput
                id="wfh-filter-month"
                value={month}
                onChange={setMonth}
              />
            </Field>
            <Field className="w-36" orientation="vertical">
              <FieldLabel htmlFor="wfh-filter-perpage">Per halaman</FieldLabel>
              <Select
                value={perPage?.toString() ?? "15"}
                onValueChange={applyPerPage}
              >
                <SelectTrigger
                  id="wfh-filter-perpage"
                  aria-label="Per halaman"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PER_PAGE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                      <WfhReportRow
                        key={r.id}
                        report={r}
                        onOpen={(reportId) => navigate(`/wfh/${reportId}`)}
                      />
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Laporan</DialogTitle>
            <DialogDescription>
              Pilih tanggal kerja. Bila laporan untuk tanggal itu sudah ada,
              Anda akan diarahkan ke laporan tersebut.
            </DialogDescription>
          </DialogHeader>
          <Field orientation="vertical">
            <FieldLabel htmlFor="wfh-create-date">Tanggal</FieldLabel>
            <DateInput
              id="wfh-create-date"
              value={createDate}
              onChange={setCreateDate}
            />
          </Field>
          {createError && (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
              data-testid="wfh-create-error"
            >
              {createError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={creating || createDate === ""}
              onClick={() => void submitCreate()}
            >
              Buat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}