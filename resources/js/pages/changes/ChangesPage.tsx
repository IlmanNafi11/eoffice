/**
 * ChangesPage — daftar paket perubahan (modul change-package, Phase 3 Task 4).
 *
 * Alur (plan Task 4 + spec):
 * - mount → `fetchPackages` dengan query bersih (halaman 1, default per_page
 *   backend 15 TIDAK dikirim supaya query tetap ramping);
 * - filter status bersifat lokal sampai "Terapkan" ditekan → fetch ulang dari
 *   halaman 1 (pola `WfhReportsPage`); kosong → reset tanpa `status`;
 * - pagination primitive (`components/wfh/pagination`) → fetch halaman tujuan
 *   dengan filter aktif dipertahankan (slice menyimpan query terakhir);
 * - tombol "Buat Paket" digate `can(user, "change.initiation.create")` +
 *   `user.team.field` terisi (Resolved #2 — admin tanpa tim tak melihat);
 *   klik → `/changes/new`;
 * - klik baris → `/changes/{packageId}` (id = `initiation.id`);
 * - badge status via `WfhStatusBadge` (union `draft|pending|approved|rejected`
 *   identik — satu sumber label Indonesia);
 * - list kosong → pesan bahasa Indonesia; fetch gagal → pesan `list.error`.
 *
 * Konvensi modul: pesan UI Indonesia, typed hooks, gate UI = permission
 * persis seeder + kondisi data — bukan nama role.
 */
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { GitBranch } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  fetchPackages,
  selectChangePackageList,
  selectChangePackageListItems,
  selectChangePackageListMeta,
} from "@/store/changePackageSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { can } from "@/lib/permissions";
import { selectUser } from "@/store/authSlice";
import type { ChangePackageStatus } from "@/api/types";

export function ChangesPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const user = useAppSelector(selectUser);
  const { statusFilter, page, perPage, status, error } =
    useAppSelector(selectChangePackageList);
  const items = useAppSelector(selectChangePackageListItems);
  const meta = useAppSelector(selectChangePackageListMeta);

  // Filter status lokal: baru dikirim ke backend saat "Terapkan". Select
  // What-initialized dari slice supaya mount ulang menunjukkan filter aktif.
  const [statusSelect, setStatusSelect] = useState<ChangePackageStatus | "">("");
  // `perPage` null = pakai default backend 15 (tidak dikirim).
  const [perPageSelect, setPerPageSelect] = useState<number | null>(null);

  useEffect(() => {
    dispatch(fetchPackages({}));
  }, [dispatch]);

  const loading = status === "loading";

  /** Halaman tujuan dari pagination — filter & per_page aktif dipertahankan. */
  function fetchPage(target: number) {
    dispatch(
      fetchPackages({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(perPage !== null ? { per_page: perPage } : {}),
        page: target,
      }),
    );
  }

  /** Terapkan filter lokal → selalu kembali ke halaman 1, reset per_page. */
  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPerPageSelect(null);
    dispatch(
      fetchPackages({
        ...(statusSelect ? { status: statusSelect } : {}),
        page: 1,
      }),
    );
  }

  /** Ganti per halaman → reset ke halaman 1, filter status tetap. */
  function applyPerPage(value: string) {
    const n = Number.parseInt(value, 10);
    const next = Number.isFinite(n) ? n : null;
    setPerPageSelect(next);
    setStatusSelect(statusFilter ?? "");
    dispatch(
      fetchPackages({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(next !== null ? { per_page: next } : {}),
        page: 1,
      }),
    );
  }

  // Resolved #2: gate create = permission + tim/bidang terisi (sumber field_id
  // pada form). Tanpa itu tombol disembunyikan — admin punya jalur view/decide.
  const canCreate = can(user, "change.initiation.create") && Boolean(user?.team?.field);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Paket Perubahan</h1>
          <p className="text-sm text-muted-foreground">
            Daftar paket perubahan beserta status persetujuannya.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canCreate && (
            <Button onClick={() => navigate("/changes/new")}>Buat Paket</Button>
          )}
          <GitBranch aria-hidden="true" className="size-5 text-muted-foreground" />
        </div>
      </div>

      <Card size="sm">
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={applyFilter}>
            <Field className="w-52" orientation="vertical">
              <FieldLabel htmlFor="changes-filter-status">Status</FieldLabel>
              <select
                id="changes-filter-status"
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                value={statusSelect}
                onChange={(e) => setStatusSelect(e.target.value as ChangePackageStatus | "")}
              >
                <option value="">Semua status</option>
                <option value="draft">Draf</option>
                <option value="pending">Menunggu persetujuan</option>
                <option value="approved">Disetujui</option>
                <option value="rejected">Ditolak</option>
              </select>
            </Field>
            <Field className="w-36" orientation="vertical">
              <FieldLabel htmlFor="changes-filter-perpage">Per halaman</FieldLabel>
              <select
                id="changes-filter-perpage"
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                value={perPageSelect?.toString() ?? "15"}
                onChange={(e) => applyPerPage(e.target.value)}
              >
                {[10, 15, 25, 50, 100].map((n) => (
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
          <CardTitle>Daftar Paket</CardTitle>
          <CardDescription>Total {meta?.total ?? 0} paket perubahan</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && items.length === 0 ? (
            <div className="space-y-2" data-testid="changes-list-loading">
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
              <p>Belum ada paket perubahan untuk filter ini.</p>
              {canCreate && <p className="mt-1">Buat paket baru untuk memulai pengajuan.</p>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">No. Dokumen</th>
                      <th className="py-2 pr-4 font-medium">Deskripsi</th>
                      <th className="py-2 pr-4 font-medium">Inisiator</th>
                      <th className="py-2 pr-4 font-medium">Bidang</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr
                        key={p.initiation.id}
                        data-testid={`change-package-row-${p.initiation.id}`}
                        className="cursor-pointer border-b border-border/60 hover:bg-muted/40"
                        onClick={() => navigate(`/changes/${p.initiation.id}`)}
                      >
                        <td className="py-2 pr-4 font-medium">{p.initiation.doc_number}</td>
                        <td className="py-2 pr-4">{p.initiation.description}</td>
                        <td className="py-2 pr-4">{p.initiation.initiator?.name ?? "-"}</td>
                        <td className="py-2 pr-4">{p.initiation.field?.name ?? "-"}</td>
                        <td className="py-2">
                          <WfhStatusBadge status={p.initiation.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Halaman {page} · {perPage ?? 15} per halaman
                </span>
                <Pagination meta={meta} onPageChange={fetchPage} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
