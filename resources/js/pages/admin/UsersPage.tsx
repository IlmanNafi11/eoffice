/**
 * UsersPage — Manajemen User (modul admin, plan Task 4).
 *
 * Alur (spec SPEC-admin.md):
 * - mount → `fetchUsers` query bersih (halaman 1);
 * - tabel users paginated (nama, NIP, email, tim, role, aktif) via slice
 *   `fetchUsers`; pagination primitive (`components/wfh/pagination`) → fetch
 *   halaman tujuan dengan `per_page` aktif;
 * - tombol "Buat User" gate `can(user, "user.create")`; input file import
 *   `.xlsx/.xls/.csv` gate `user.import` → `importUsersThunk` → panel hasil
 *   `{imported, skipped, errors[]}`; list di-refresh pasca import sukses;
 * - aksi hapus per baris gate `user.delete` + confirm dialog →
 *   `deleteUserThunk` → list refresh; gagal → pesan server tampil (error tak
 *   lenyap saat refetch — `a602c46` ditegakkan di slice);
 * - klik nama user (Link) → navigasi ke `/admin/users/{id}/edit` (Task 5);
 * - gate = permission sintetik (`can()` nama persis seeder), BUKAN nama role.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/wfh/pagination";
import {
  deleteUserThunk,
  fetchUsers,
  importUsersThunk,
  selectAdminImport,
  selectAdminUsersItems,
  selectAdminUsersList,
  selectAdminUsersMeta,
} from "@/store/adminSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { can } from "@/lib/permissions";
import { selectUser } from "@/store/authSlice";
import type { AdminUser, ListUsersQuery } from "@/api/types";

export function UsersPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const user = useAppSelector(selectUser);
  const { status, error, page, perPage } = useAppSelector(selectAdminUsersList);
  const items = useAppSelector(selectAdminUsersItems);
  const meta = useAppSelector(selectAdminUsersMeta);
  const importResult = useAppSelector(selectAdminImport);

  const canCreate = can(user, "user.create");
  const canImport = can(user, "user.import");
  const canDelete = can(user, "user.delete");

  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    dispatch(fetchUsers({}));
  }, [dispatch]);

  /** Query aktif (halaman saat ini + per_page bila diterapkan) — refetch pasca-mutasi. */
  function activeQuery(): ListUsersQuery {
    return {
      page,
      ...(perPage !== null ? { per_page: perPage } : {}),
    };
  }

  /** Batas ukuran + ekstensi import kontrak (`max:10240` KB; `.xlsx/.xls/.csv`)
   *  — cek klien murah sebelum unggah; `accept` input hanya petunjuk UI,
   *  BUKAN kontrol (server tetap otoritas format sebenarnya). */
  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
  const ALLOWED_IMPORT_EXT = [".xlsx", ".xls", ".csv"];
  const [importInvalid, setImportInvalid] = useState<string | null>(null);

  /** Import file terpilih — sukses → panel hasil + list refresh page aktif. */
  async function submitImport(file: File) {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_IMPORT_EXT.includes(ext)) {
      setImportInvalid("Format file harus .xlsx, .xls, atau .csv.");
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setImportInvalid("Ukuran file melebihi 10 MB.");
      return;
    }
    setImportInvalid(null);
    try {
      await dispatch(importUsersThunk(file)).unwrap();
      dispatch(fetchUsers(activeQuery()));
    } catch {
      // error sudah diset reducer — pesan server tampil apa adanya.
    }
  }

  /** Hapus user setelah confirm; sukses → list refresh page aktif. */
  async function submitDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await dispatch(deleteUserThunk(deleteTarget.id)).unwrap();
      dispatch(fetchUsers(activeQuery()));
      setDeleteTarget(null);
    } catch {
      // error diset reducer; dialog tetap terbuka, pesan server tampil.
    } finally {
      setDeleting(false);
    }
  }

  const loading = status === "loading";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Manajemen User</h1>
          <p className="text-sm text-muted-foreground">
            Daftar user, import spreadsheet, dan hapus akun.
          </p>
        </div>
        <UserPlus aria-hidden="true" className="size-5 text-muted-foreground" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canCreate && (
          <Button onClick={() => navigate("/admin/users/new")}>Buat User</Button>
        )}
        {canImport && (
          <FileInput
            id="admin-import-file"
            aria-label="Pilih file import"
            accept=".xlsx,.xls,.csv"
            placeholder="Pilih file import (xlsx/xls/csv)"
            onFileChange={(f) => {
              if (f) void submitImport(f);
            }}
          />
        )}
      </div>

      {importResult && (
        <div
          data-testid="import-result"
          className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
        >
          <p className="font-medium">
            Hasil import: {importResult.imported} diimpor, {importResult.skipped} dilewati.
          </p>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-muted-foreground">
              {importResult.errors.map((err, i) => (
                <li key={`${i}-${err}`}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {importInvalid && (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="import-invalid"
        >
          {importInvalid}
        </p>
      )}


      {error && (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="users-error"
        >
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Daftar User</CardTitle>
          <CardDescription>Total {meta?.total ?? 0} user</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && items.length === 0 ? (
            <div className="space-y-2" data-testid="users-loading">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <p>Belum ada user.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Nama</th>
                      <th className="py-2 pr-4 font-medium">NIP</th>
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Tim</th>
                      <th className="py-2 pr-4 font-medium">Role</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      {canDelete ? <th className="py-2 font-medium">Aksi</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((u) => (
                      <tr
                        key={u.id}
                        data-testid={`user-row-${u.id}`}
                        className="border-b border-border/60"
                      >
                        <td className="py-2 pr-4 font-medium">
                          <Link
                            to={`/admin/users/${u.id}/edit`}
                            className="underline-offset-2 hover:underline"
                          >
                            {u.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">{u.nip}</td>
                        <td className="py-2 pr-4">{u.email}</td>
                        <td className="py-2 pr-4">{u.team?.name ?? "-"}</td>
                        <td className="py-2 pr-4">{u.roles.join(", ")}</td>
                        <td className="py-2 pr-4">{u.is_active ? "Aktif" : "Nonaktif"}</td>
                        {canDelete ? (
                          <td className="py-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              data-testid={`delete-user-${u.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(u);
                              }}
                            >
                              Hapus
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Pagination
                  meta={meta}
                  onPageChange={(p) => dispatch(fetchUsers({ page: p, ...(perPage !== null ? { per_page: perPage } : {}) }))}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          {error ? (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
              data-testid="delete-error"
            >
              {error}
            </p>
          ) : null}
          <DialogHeader>
            <DialogTitle>Hapus user</DialogTitle>
            <DialogDescription>
              User "{deleteTarget?.name ?? ""}" akan dihapus permanen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void submitDelete()}
            >
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}