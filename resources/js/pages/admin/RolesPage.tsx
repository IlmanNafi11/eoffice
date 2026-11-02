/**
 * RolesPage — Peran & Permission (modul admin, plan Task 6).
 *
 * Alur (spec SPEC-admin.md + plan Task 6):
 * - mount → `fetchRoles` (cache sekali per sesi di slice); bila pemegang
 *   `permission.manage` juga `fetchPermissions` — kolom grid dari cache
 *   `listPermissions`; FALLBACK: tanpa `permission.manage`, kolom derived
 *   distinct union dari `listRoles` (REQuery #4, UI tak memanggil
 *   `listPermissions` bila tak berhak — server 403);
 * - checkbox state lokal per role; tombol "Simpan" per role (disabled tanpa
 *   perubahan) → `syncRolePermissionsThunk` sync penuh persis checklist;
 *   role tak berubah tidak pernah dikirim; sukses memperbarui baris cache
 *   roles (di slice);
 * - pesan 422 lockout ("Role 'admin' tidak boleh kehilangan permission
 *   kritis: …") dirender apa adanya dan tak lenyap saat refetch
 *   (a602c46 ditegakkan di slice — `current.error`);
 * - dialog konfirmasi bila uncheck permission kritis (`user.manage`,
 *   `role.manage`, `permission.manage`) pada role `admin` — UI tak pernah
 *   menyusun payload yang mengosongkan permission kritis tanpa sadar;
 * - gate halaman `role.manage` → tombol "Simpan" hilang bila dipangkas
 *   (permission sintetik, bukan role name).
 */
import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchPermissions,
  fetchRoles,
  selectAdminCurrentUser,
  selectAdminPermissions,
  selectAdminRoles,
  syncRolePermissionsThunk,
} from "@/store/adminSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { can } from "@/lib/permissions";
import { selectUser } from "@/store/authSlice";
import type { AdminRole } from "@/api/types";

/** Permission kritis (server `RoleController` lockout list) — kontrak. */
const CRITICAL_PERMISSIONS = ["user.manage", "role.manage", "permission.manage"];
/** Role terproteksi (server `Roles::PROTECTED`) — hanya `admin`. */
const PROTECTED_ROLES: readonly string[] = ["admin"];

/** Local checkbox state per role — null = belum berubah dari data asli. */
type Draft = Record<number, string[] | null>;

/** Derived fallback: union distinct terurut dari permissions semua role. */
function derivedPermissions(roles: AdminRole[]): string[] {
  return [...new Set(roles.flatMap((r) => r.permissions))].sort();
}

export function RolesPage() {
  const dispatch = useAppDispatch();

  const user = useAppSelector(selectUser);
  const roles = useAppSelector(selectAdminRoles);
  const serverPermissions = useAppSelector(selectAdminPermissions);
  const fetchError = useAppSelector((s) => s.admin.roles.error);
  const syncError = useAppSelector(selectAdminCurrentUser).error;

  const canManageRoles = can(user, "role.manage");
  const canListPermissions = can(user, "permission.manage");

  const [drafts, setDrafts] = useState<Draft>({});
  const [confirmUnchecked, setConfirmUnchecked] = useState<{
    roleId: number;
    permission: string;
  } | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    dispatch(fetchRoles());
  }, [dispatch]);

  useEffect(() => {
    if (canListPermissions) dispatch(fetchPermissions());
  }, [dispatch, canListPermissions]);

  /**
   * Sumber kolom: cache `listPermissions` bila pemegang
   * `permission.manage`; fallback derived dari `listRoles` (REQuery #4).
   */
  const columns = useMemo(() => {
    if (canListPermissions && serverPermissions) {
      return serverPermissions.map((p) => p.name);
    }
    if (roles) return derivedPermissions(roles);
    return [];
  }, [canListPermissions, serverPermissions, roles]);

  /** Checklist efektif role: draft bila ada perubahan, else data asli. */
  function effectivePermissions(role: AdminRole): string[] {
    return drafts[role.id] ?? role.permissions;
  }

  function isRoleDirty(role: AdminRole): boolean {
    return drafts[role.id] !== undefined;
  }

  function toggle(role: AdminRole, permission: string) {
    if (savingId !== null) return;

    const current = effectivePermissions(role);
    const willUncheck = current.includes(permission);
    if (
      willUncheck &&
      PROTECTED_ROLES.includes(role.name) &&
      CRITICAL_PERMISSIONS.includes(permission)
    ) {
      setConfirmUnchecked({ roleId: role.id, permission });
      return;
    }

    const next = willUncheck
      ? current.filter((p) => p !== permission)
      : [...current, permission].sort();
    setDrafts((prev) => ({ ...prev, [role.id]: next }));
  }

  function confirmCriticalUncheck() {
    if (!confirmUnchecked) return;
    const { roleId, permission } = confirmUnchecked;
    const role = roles?.find((r) => r.id === roleId);
    if (role) {
      const next = effectivePermissions(role).filter((p) => p !== permission);
      setDrafts((prev) => ({ ...prev, [roleId]: next }));
    }
    setConfirmUnchecked(null);
  }

  /** Simpan satu role — sync penuh persis checklist (REQuery #4). */
  async function saveRole(role: AdminRole) {
    if (!isRoleDirty(role) || savingId !== null) return;
    setSavingId(role.id);
    try {
      await dispatch(
        syncRolePermissionsThunk({
          roleId: role.id,
          permissions: effectivePermissions(role),
        }),
      ).unwrap();
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[role.id];
        return next;
      });
    } catch {
      // error diset reducer (current.error) — pesan server tampil apa adanya.
    } finally {
      setSavingId(null);
    }
  }

  const loading = roles === null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Peran &amp; Permission</h1>
        <p className="text-sm text-muted-foreground">
          Atur permission setiap role. Perubahan disimpan per role (sync penuh).
        </p>
      </div>

      {fetchError ?? syncError ? (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="roles-error"
        >
          {fetchError ?? syncError}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-2" data-testid="roles-loading">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {(roles ?? []).map((role) => {
            const current = effectivePermissions(role);
            return (
              <div
                key={role.id}
                data-testid={`role-row-${role.id}`}
                className="rounded-lg border border-border"
              >
                <div className="border-b border-border px-4 py-3">
                  <div className="font-medium">{role.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {current.length} permission aktif
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 px-4 py-3">
                  {columns.map((perm) => (
                    <label key={perm} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        aria-label={perm}
                        checked={current.includes(perm)}
                        onCheckedChange={() => toggle(role, perm)}
                      />
                      {perm}
                    </label>
                  ))}
                </div>
                {canManageRoles ? (
                  <div className="px-4 py-3">
                    <Button
                      size="sm"
                      disabled={!isRoleDirty(role) || savingId !== null}
                      onClick={() => void saveRole(role)}
                    >
                      <Save aria-hidden="true" className="size-4" />
                      Simpan
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={confirmUnchecked !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmUnchecked(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lepas permission kritis?</DialogTitle>
            <DialogDescription>
              Permission "{confirmUnchecked?.permission ?? ""}" kritis untuk
              role admin — melepasnya tanpa pengganti bisa mengunci akses
              administrasi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmUnchecked(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmCriticalUncheck}
            >
              Lanjutkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}