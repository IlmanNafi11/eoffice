/**
 * UserFormPage — buat/edit user (modul admin, plan Task 5).
 *
 * Satu file untuk `/admin/users/new` (create) dan `/admin/users/:userId/edit`
 * (edit; prefill via `getUserById` lewat slice `fetchUser`). Mode dari param
 * rute.
 *
 * Alur (plan Task 5 + spec):
 * - NIP/nama/email wajib + format email (validasi klien); 422 duplikat
 *   nip/email dirender per field (`ApiError.errors`, pola profile);
 * - tim dropdown dari `listTeams` (pinjaman — semua tim, tanpa `field_id`);
 * - role checkbox 4 nama kontrak (`admin`, `kepala_bidang`, `kepala_tim`,
 *   `staf`);
 * - password hanya di create; kosong = default server (hint tersaji);
 * - direct permissions multi-select dari cache `listPermissions` (Resolved #3);
 *   prefill gabungan role+direct + hint (Open Question #1);
 * - toggle `is_active` edit-saja;
 * - gate: create → `user.create`, edit → `user.update` (permission sintetik,
 *   bukan role); tombol "Simpan" hilang bila dipangkas.
 *
 * Edit mengirim hanya field yang BERUBAH + `permissions` penuh bila disentuh
 * (sync penuh — REQuery #4). Create tanpa password meng-OMIT field password.
 */
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchPermissions,
  fetchUser,
  selectAdminCurrentUser,
  selectAdminCurrentUserData,
  selectAdminPermissions,
} from "@/store/adminSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/authSlice";
import { ApiError } from "@/api/client";
import { createUser, updateUser } from "@/api/admin";
import { listTeams } from "@/api/wfh-team";
import { can } from "@/lib/permissions";
import type {
  AdminRoleName,
  StoreUserInput,
  TeamResource,
  UpdateUserInput,
} from "@/api/types";

/** Nama role kontrak (`StoreUserRequest.roles` enum openapi). */
const ROLE_NAMES: AdminRoleName[] = ["admin", "kepala_bidang", "kepala_tim", "staf"];

interface FormState {
  name: string;
  nip: string;
  email: string;
  teamId: string;
  rank: string;
  position: string;
  phone: string;
  password: string;
}

const emptyForm: FormState = {
  name: "",
  nip: "",
  email: "",
  teamId: "",
  rank: "",
  position: "",
  phone: "",
  password: "",
};

/** Validasi format email sederhana — klien hanya mengunci required + format. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function UserFormPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const id = Number.parseInt(userId ?? "", 10);
  const isEdit = Number.isFinite(id);

  const user = useAppSelector(selectUser);
  const current = useAppSelector(selectAdminCurrentUser);
  const currentData = useAppSelector(selectAdminCurrentUserData);
  const permissions = useAppSelector(selectAdminPermissions);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [roles, setRoles] = useState<AdminRoleName[]>([]);
  const [permissionNames, setPermissionNames] = useState<string[]>([]);
  const [permissionsTouched, setPermissionsTouched] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [teams, setTeams] = useState<TeamResource[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [validation, setValidation] = useState<string[]>([]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canSave = isEdit ? can(user, "user.update") : can(user, "user.create");

  /** Edit: prefill via `getUserById` (sekali saat data masuk). */
  useEffect(() => {
    if (isEdit) dispatch(fetchUser(id));
  }, [dispatch, id, isEdit]);

  /** Referensi direct permissions (cache sekali per sesi di slice). */
  useEffect(() => {
    dispatch(fetchPermissions());
  }, [dispatch]);

  /** Dropdown tim (listTeams pinjaman) — dimuat sekali saat mount. */
  useEffect(() => {
    listTeams()
      .then((rows) => setTeams(rows))
      .catch(() => setTeams([]));
  }, []);

  const [prefilledFor, setPrefilledFor] = useState<number | null>(null);
  useEffect(() => {
    if (isEdit && currentData && currentData.id === id && prefilledFor !== id) {
      setForm({
        name: currentData.name,
        nip: currentData.nip,
        email: currentData.email,
        teamId: currentData.team?.id ? String(currentData.team.id) : "",
        rank: currentData.rank ?? "",
        position: currentData.position ?? "",
        phone: currentData.phone ?? "",
        password: "",
      });
      setRoles(currentData.roles as AdminRoleName[]);
      setPermissionNames([...currentData.permissions]);
      setPermissionsTouched(false);
      setIsActive(currentData.is_active);
      setPrefilledFor(id);
    }
  }, [isEdit, currentData, id, prefilledFor]);

  function toggleRole(role: AdminRoleName) {
    setRoles((prev) => {
      const next = prev.includes(role)
        ? prev.filter((r) => r !== role)
        : [...prev, role];
      // Urutan stabil mengikuti ROLE_NAMES agar payload deterministik.
      return ROLE_NAMES.filter((r) => next.includes(r));
    });
  }

  function togglePermission(name: string) {
    setPermissionsTouched(true);
    setPermissionNames((prev) => {
      const next = prev.includes(name)
        ? prev.filter((p) => p !== name)
        : [...prev, name];
      return (permissions ?? [])
        .map((p) => p.name)
        .filter((p) => next.includes(p));
    });
  }

  /** Validasi klien: required + format email. Roles[] boleh kosong (skema). */
  function validate(): string[] {
    const errors: string[] = [];
    if (form.name.trim() === "") errors.push("Nama wajib diisi.");
    if (form.nip.trim() === "") errors.push("NIP wajib diisi.");
    if (form.email.trim() === "") errors.push("Email wajib diisi.");
    else if (!EMAIL_RE.test(form.email.trim()))
      errors.push("Format email tidak valid.");
    return errors;
  }

  function buildCreateInput(): StoreUserInput {
    const input: StoreUserInput = {
      name: form.name.trim(),
      nip: form.nip.trim(),
      email: form.email.trim(),
      roles,
    };
    if (form.teamId !== "") input.team_id = Number(form.teamId);
    if (form.rank.trim() !== "") input.rank = form.rank.trim();
    if (form.position.trim() !== "") input.position = form.position.trim();
    if (form.phone.trim() !== "") input.phone = form.phone.trim();
    // Password kosong DI-OMIT (server injek default dari Settings per role).
    if (form.password !== "") input.password = form.password;
    if (permissionNames.length > 0) input.permissions = permissionNames;
    return input;
  }

  /** Bandingkan dua daftar role sebagai set (urutan agnostik). */
  function sameSet(a: string[], b: string[]): boolean {
    return [...a].sort().join("\u0000") === [...b].sort().join("\u0000");
  }

  function buildUpdateInput(): UpdateUserInput {
    const input: UpdateUserInput = {};
    const original = currentData;

    if (original) {
      if (form.name.trim() !== original.name) input.name = form.name.trim();
      if (form.nip.trim() !== original.nip) input.nip = form.nip.trim();
      if (form.email.trim() !== original.email) input.email = form.email.trim();

      const rank = form.rank.trim() === "" ? null : form.rank.trim();
      if (rank !== (original.rank ?? null)) input.rank = rank;
      const position = form.position.trim() === "" ? null : form.position.trim();
      if (position !== (original.position ?? null)) input.position = position;
      const phone = form.phone.trim() === "" ? null : form.phone.trim();
      if (phone !== (original.phone ?? null)) input.phone = phone;

      const teamId = form.teamId === "" ? null : Number(form.teamId);
      if (teamId !== (original.team?.id ?? null)) input.team_id = teamId;

      if (!sameSet(roles, original.roles)) input.roles = roles;
    } else {
      // Tanpa data original (defensif) — kirim field yang terisi.
      input.name = form.name.trim();
      input.nip = form.nip.trim();
      input.email = form.email.trim();
      const teamId = form.teamId === "" ? null : Number(form.teamId);
      input.team_id = teamId;
      input.roles = roles;
    }

    // Permissions HANYA dikirim bila disentuh (sync penuh — REQuery #4).
    if (permissionsTouched) input.permissions = permissionNames;

    if (isEdit && currentData && isActive !== currentData.is_active) {
      input.is_active = isActive;
    }

    return input;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const clientErrors = validate();
    if (clientErrors.length > 0) {
      setValidation(clientErrors);
      return;
    }

    setBusy(true);
    setValidation([]);
    setFieldErrors({});
    setMessage(null);

    try {
      if (isEdit) {
        await updateUser(id, buildUpdateInput());
      } else {
        await createUser(buildCreateInput());
      }
      navigate("/admin/users");
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors ?? {});
        if (!err.errors || Object.keys(err.errors).length === 0) {
          setMessage(err.message);
        }
      } else {
        setMessage("Gagal menyimpan user.");
      }
    } finally {
      setBusy(false);
    }
  }

  const loading = isEdit && current.status === "loading" && currentData === null;

  if (loading) {
    return (
      <div className="space-y-2" data-testid="user-form-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isEdit && current.error && !currentData) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-destructive" role="alert">
          {current.error}
        </p>
        <Button variant="outline" asChild className="w-fit">
          <Link to="/admin/users">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Kembali ke daftar
          </Link>
        </Button>
      </div>
    );
  }

  if (isEdit && !currentData) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon-sm" asChild>
          <Link to="/admin/users" aria-label="Kembali">
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold">
            {isEdit ? "Ubah User" : "Buat User"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Perbarui data akun. Field yang tidak diubah tidak dikirim."
              : "Isi formulir. Password kosong memakai default server (per role)."}
          </p>
        </div>
      </div>

      {message ? (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="user-form-error"
        >
          {message}
        </p>
      ) : null}

      {validation.length > 0 ? (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
          data-testid="user-form-validation"
        >
          {validation.map((msg) => (
            <p key={msg}>{msg}</p>
          ))}
        </div>
      ) : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Data Akun</CardTitle>
          <CardDescription>Identitas, afiliasi tim, dan peran.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field orientation="vertical">
                  <FieldLabel htmlFor="user-form-name">Nama</FieldLabel>
                  <Input
                    id="user-form-name"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    maxLength={255}
                  />
                  <FieldError errors={fieldErrors.name?.map((m) => ({ message: m }))} />
                </Field>
                <Field orientation="vertical">
                  <FieldLabel htmlFor="user-form-nip">NIP</FieldLabel>
                  <Input
                    id="user-form-nip"
                    value={form.nip}
                    onChange={(e) => set("nip", e.target.value)}
                    maxLength={50}
                  />
                  <FieldError errors={fieldErrors.nip?.map((m) => ({ message: m }))} />
                </Field>
              </div>
              <Field orientation="vertical">
                <FieldLabel htmlFor="user-form-email">Email</FieldLabel>
                <Input
                  id="user-form-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
                <FieldError errors={fieldErrors.email?.map((m) => ({ message: m }))} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field orientation="vertical">
                  <FieldLabel htmlFor="user-form-team">Tim</FieldLabel>
                  <select
                    id="user-form-team"
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                    value={form.teamId}
                    onChange={(e) => set("teamId", e.target.value)}
                  >
                    <option value="">Pilih tim…</option>
                    {(teams ?? []).map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <FieldError errors={fieldErrors.team_id?.map((m) => ({ message: m }))} />
                </Field>
                <Field orientation="vertical">
                  <FieldLabel htmlFor="user-form-rank">Pangkat</FieldLabel>
                  <Input
                    id="user-form-rank"
                    value={form.rank}
                    onChange={(e) => set("rank", e.target.value)}
                    maxLength={255}
                  />
                  <FieldError errors={fieldErrors.rank?.map((m) => ({ message: m }))} />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field orientation="vertical">
                  <FieldLabel htmlFor="user-form-position">Jabatan</FieldLabel>
                  <Input
                    id="user-form-position"
                    value={form.position}
                    onChange={(e) => set("position", e.target.value)}
                    maxLength={255}
                  />
                  <FieldError errors={fieldErrors.position?.map((m) => ({ message: m }))} />
                </Field>
                <Field orientation="vertical">
                  <FieldLabel htmlFor="user-form-phone">Telepon</FieldLabel>
                  <Input
                    id="user-form-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    maxLength={20}
                  />
                  <FieldError errors={fieldErrors.phone?.map((m) => ({ message: m }))} />
                </Field>
              </div>

              <Field orientation="vertical">
                <FieldLabel>Role</FieldLabel>
                <div className="flex flex-wrap gap-3">
                  {ROLE_NAMES.map((role) => (
                    <label key={role} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={roles.includes(role)}
                        onChange={() => toggleRole(role)}
                      />
                      {role}
                    </label>
                  ))}
                </div>
                <FieldError errors={fieldErrors.roles?.map((m) => ({ message: m }))} />
              </Field>

              {!isEdit ? (
                <Field orientation="vertical">
                  <FieldLabel htmlFor="user-form-password">Password</FieldLabel>
                  <Input
                    id="user-form-password"
                    type="password"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Kosongkan untuk memakai password default server (sesuai role).
                  </p>
                  <FieldError errors={fieldErrors.password?.map((m) => ({ message: m }))} />
                </Field>
              ) : null}

              <Field orientation="vertical">
                <FieldLabel>Direct permissions</FieldLabel>
                <div className="flex flex-wrap gap-3">
                  {(permissions ?? []).map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={permissionNames.includes(p.name)}
                        onChange={() => togglePermission(p.name)}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Prefill gabungan role dan direct permission — keduanya tidak
                  dibedakan pada kontrak UserResource.
                </p>
                <FieldError errors={fieldErrors.permissions?.map((m) => ({ message: m }))} />
              </Field>

              {isEdit ? (
                <Field orientation="vertical">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    Status aktif
                  </label>
                </Field>
              ) : null}

              {canSave ? (
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={busy}>
                    <Save aria-hidden="true" className="size-4" />
                    Simpan
                  </Button>
                </div>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}