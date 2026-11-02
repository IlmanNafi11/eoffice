/**
 * ChangePackageFormPage — form 2-bagian paket perubahan (modul change-package,
 * Phase 3 Task 5).
 *
 * Satu file untuk `/changes/new` (create draft) dan `/changes/:packageId/edit`
 * (isi dari `showPackage`); mode dari param rute.
 *
 * Alur (plan Task 5 + spec):
 * - Bagian Inisiasi: bidang read-only dari `user.team.field` (create) / data
 *   (`edit`, `initiation.field`); `needed_by_date` (date input), deskripsi,
 *   alasan. TIDAK ada select bidang (tak ada endpoint daftar bidang) dan TIDAK
 *   ada input evaluator (Resolved #1 — evaluator diset server, bukan UI).
 * - Bagian Implementasi: priority normal/emergency, impact Minor/Mayor,
 *   checkbox change types (dari `fetchChangeTypes`, cache slice), test plan,
 *   tanggal eksekusi ≤ tanggal rilis (validasi klien), implementation_result,
 *   dampak produksi, effort, resources, biaya (`cost_needed` toggle →
 *   `cost_amount` wajib, string desimal).
 * - "Simpan Draft": create → POST `PackageDraftInput` (implementation
 *   opsional; semua prop diisi dari state); edit → PUT sama bentuknya.
 * - "Submit": validasi klien required dulu (deskripsi, alasan, needed_by_date +
 *   7 field implementation + urutan tanggal + cost_amount bila cost_needed),
 *   lalu POST full-payload ke `/submit`. Create mode membuat draft dulu (butuh
 *   id paket). Submit TIDAK lewat PUT terpisah.
 * - Pesan server 422 dirender via `current.error` (role alert, testid) dan tak
 *   lenyap selama form termuat (`fetchPackage.pending` tidak membersihkan
 *   `error` — slice a602c46; halaman juga tidak menimpa dengan pesan klien).
 * - Tombol digate: create = `change.initiation.create` + `user.team.field`
 *   (REQuery #2); edit = status `draft` + inisiator + `change.initiation.update`
 *   / `change.initiation.submit` — user sintetik, bukan nama role.
 *
 * Konvensi modul: pesan UI Indonesia, typed hooks, gate UI = permission persis
 * seeder + kondisi data, `can()` dari `lib/permissions`.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FilePlus2, Save } from "lucide-react";

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
import {
  fetchChangeTypes,
  fetchPackage,
  createPackageThunk,
  selectChangePackageChangeTypes,
  selectChangePackageCurrentData,
  selectChangePackageCurrent,
  submitPackageThunk,
  updatePackageThunk,
} from "@/store/changePackageSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/authSlice";
import { can } from "@/lib/permissions";
import type {
  PackageImplementationDraftInput,
  PackageSubmitInput,
} from "@/api/types";

/** State teks form — semua string kosong; konversi payload di submit/draft. */
interface FormState {
  description: string;
  reason: string;
  neededByDate: string;
  priority: "" | "normal" | "emergency";
  impact: "" | "Minor" | "Mayor";
  changeTypeIds: number[];
  testPlan: string;
  executionDate: string;
  releaseDate: string;
  implementationResult: string;
  productionImpact: string;
  requiredEffort: string;
  resources: string;
  costNeeded: boolean;
  costAmount: string;
}

const emptyForm: FormState = {
  description: "",
  reason: "",
  neededByDate: "",
  priority: "",
  impact: "",
  changeTypeIds: [],
  testPlan: "",
  executionDate: "",
  releaseDate: "",
  implementationResult: "",
  productionImpact: "",
  requiredEffort: "",
  resources: "",
  costNeeded: false,
  costAmount: "",
};

export function ChangePackageFormPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { packageId } = useParams<{ packageId: string }>();
  const id = Number.parseInt(packageId ?? "", 10);
  const isEdit = Number.isFinite(id);

  const user = useAppSelector(selectUser);
  const current = useAppSelector(selectChangePackageCurrent);
  const pkg = useAppSelector(selectChangePackageCurrentData);
  const changeTypes = useAppSelector(selectChangePackageChangeTypes);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [validation, setValidation] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** Mode edit: fetch detail sekali saat mount (relasi di-load server). */
  useEffect(() => {
    if (isEdit) dispatch(fetchPackage(id));
  }, [dispatch, id, isEdit]);

  /** Referensi change types (cache sekali per sesi di slice). */
  useEffect(() => {
    dispatch(fetchChangeTypes());
  }, [dispatch]);

  /** Prefill dari data show (edit mode) — hanya sekali saat data masuk. */
  const [prefilledFor, setPrefilledFor] = useState<number | null>(null);
  useEffect(() => {
    if (isEdit && pkg && pkg.initiation.id === id && prefilledFor !== id) {
      const impl = pkg.implementation;
      setForm({
        description: pkg.initiation.description,
        reason: pkg.initiation.reason,
        neededByDate: pkg.initiation.needed_by_date ?? "",
        priority: (impl?.priority as FormState["priority"]) ?? "",
        impact: (impl?.impact as FormState["impact"]) ?? "",
        changeTypeIds: impl?.change_types?.map((t) => t.id) ?? [],
        testPlan: impl?.test_plan ?? "",
        executionDate: impl?.execution_date ?? "",
        releaseDate: impl?.release_date ?? "",
        implementationResult: impl?.implementation_result ?? "",
        productionImpact: impl?.production_impact ?? "",
        requiredEffort: impl?.required_effort ?? "",
        resources: impl?.resources ?? "",
        costNeeded: impl?.cost_needed ?? false,
        costAmount: impl?.cost_amount ?? "",
      });
      setPrefilledFor(id);
    }
  }, [isEdit, pkg, id, prefilledFor]);

  const loading = isEdit && current.status === "loading" && pkg === null;

  // ── Gate tombol (permission sintetik × ownership × status) ──────────

  /** Create: `change.initiation.create` + tim/bidang terisi (REQuery #2). */
  const fieldId = isEdit ? pkg?.initiation.field_id : user?.team?.field?.id;
  const canDraft = isEdit
    ? pkg?.initiation.status === "draft" &&
      pkg?.initiation.initiator_id === user?.id &&
      can(user, "change.initiation.update")
    : Boolean(user?.team?.field) && can(user, "change.initiation.create");
  const canDoSubmit = isEdit
    ? pkg?.initiation.status === "draft" &&
      pkg?.initiation.initiator_id === user?.id &&
      can(user, "change.initiation.submit")
    : Boolean(user?.team?.field) && can(user, "change.initiation.submit");

  /** Bangun payload implementation draft (semua prop nullable). */
  function implementationDraft(): PackageImplementationDraftInput {
    return {
      priority: form.priority === "" ? null : form.priority,
      impact: form.impact === "" ? null : form.impact,
      change_type_ids: form.changeTypeIds.length > 0 ? form.changeTypeIds : null,
      test_plan: form.testPlan === "" ? null : form.testPlan,
      execution_date: form.executionDate === "" ? null : form.executionDate,
      release_date: form.releaseDate === "" ? null : form.releaseDate,
      implementation_result: form.implementationResult === "" ? null : form.implementationResult,
      production_impact: form.productionImpact === "" ? null : form.productionImpact,
      required_effort: form.requiredEffort === "" ? null : form.requiredEffort,
      resources: form.resources === "" ? null : form.resources,
      cost_needed: form.costNeeded,
      // cost_needed false → `cost_amount` tidak dikirim (spec Code Style).
      ...(form.costNeeded && form.costAmount !== "" ? { cost_amount: form.costAmount } : {}),
    };
  }

  /** Bangun payload submit full (semua field required + nullable bila kosong). */
  function buildSubmitInput(): PackageSubmitInput {
    return {
      initiation: {
        field_id: fieldId as number,
        needed_by_date: form.neededByDate,
        description: form.description,
        reason: form.reason,
      },
      implementation: {
        priority: form.priority as "normal" | "emergency",
        impact: form.impact as "Minor" | "Mayor",
        change_type_ids: form.changeTypeIds,
        test_plan: form.testPlan,
        execution_date: form.executionDate,
        release_date: form.releaseDate,
        implementation_result: form.implementationResult,
        production_impact: form.productionImpact === "" ? null : form.productionImpact,
        required_effort: form.requiredEffort === "" ? null : form.requiredEffort,
        resources: form.resources === "" ? null : form.resources,
        cost_needed: form.costNeeded,
        cost_amount:
          form.costNeeded && form.costAmount !== "" ? form.costAmount : null,
      },
    };
  }

  /** Validasi klien: pertama draft (minim), lalu submit (full). */
  function validateForSubmit(): string[] {
    const errors: string[] = [];
    if (form.description.trim() === "") errors.push("Deskripsi wajib diisi.");
    if (form.reason.trim() === "") errors.push("Alasan wajib diisi.");
    if (form.neededByDate === "")
      errors.push("Tanggal dibutuhkan wajib diisi untuk submit.");
    if (form.priority === "") errors.push("Prioritas wajib dipilih.");
    if (form.impact === "") errors.push("Dampak wajib dipilih.");
    if (form.changeTypeIds.length === 0)
      errors.push("Minimal satu jenis perubahan wajib dipilih.");
    if (form.testPlan.trim() === "")
      errors.push("Rencana pengujian wajib diisi untuk submit.");
    if (form.executionDate === "")
      errors.push("Tanggal eksekusi wajib diisi untuk submit.");
    if (form.releaseDate === "")
      errors.push("Tanggal rilis wajib diisi untuk submit.");
    if (form.implementationResult.trim() === "")
      errors.push("Hasil implementasi wajib diisi untuk submit.");
    if (form.executionDate !== "" && form.releaseDate !== "" && form.releaseDate < form.executionDate)
      errors.push("Tanggal rilis harus setelah atau sama dengan tanggal eksekusi.");
    if (form.costNeeded && form.costAmount.trim() === "")
      errors.push("Jumlah biaya wajib diisi bila paket perlu biaya.");
    return errors;
  }

  /** Validasi draft: hanya inisiasi (deskripsi + alasan). */
  function validateForDraft(): string[] {
    const errors: string[] = [];
    if (form.description.trim() === "") errors.push("Deskripsi wajib diisi.");
    if (form.reason.trim() === "") errors.push("Alasan wajib diisi.");
    return errors;
  }

  /** "Simpan Draft": create → POST; edit → PUT. Sukses → detail paket. */
  async function handleSaveDraft() {
    if (busy) return;
    setValidation([]);
    const errors = validateForDraft();
    if (errors.length > 0) {
      setValidation(errors);
      return;
    }
    setBusy(true);
    try {
      const input = {
        initiation: {
          field_id: fieldId as number,
          needed_by_date: form.neededByDate === "" ? null : form.neededByDate,
          description: form.description,
          reason: form.reason,
        },
        implementation: implementationDraft(),
      };
      const result = isEdit
        ? await dispatch(updatePackageThunk({ packageId: id, input })).unwrap()
        : await dispatch(createPackageThunk(input)).unwrap();
      navigate(`/changes/${result.initiation.id}`);
    } catch {
      // Pesan error sudah di slice (current.error) → tampil di halaman.
    } finally {
      setBusy(false);
    }
  }

  /** "Submit": validasi full, create draft bila perlu, POST /submit. */
  async function handleSubmit() {
    if (busy) return;
    setValidation([]);
    const errors = validateForSubmit();
    if (errors.length > 0) {
      setValidation(errors);
      return;
    }
    setBusy(true);
    try {
      let targetId = id;
      if (!isEdit) {
        const created = await dispatch(
          createPackageThunk({
            initiation: {
              field_id: fieldId as number,
              needed_by_date: form.neededByDate,
              description: form.description,
              reason: form.reason,
            },
            implementation: implementationDraft(),
          }),
        ).unwrap();
        targetId = created.initiation.id;
      }
      await dispatch(
        submitPackageThunk({ packageId: targetId, input: buildSubmitInput() }),
      ).unwrap();
      navigate(`/changes/${targetId}`);
    } catch {
      // Pesan error sudah di slice (current.error) → tampil di halaman.
    } finally {
      setBusy(false);
    }
  }

  function toggleChangeType(typeId: number) {
    set(
      "changeTypeIds",
      form.changeTypeIds.includes(typeId)
        ? form.changeTypeIds.filter((t) => t !== typeId)
        : [...form.changeTypeIds, typeId],
    );
  }

  if (loading) {
    return (
      <div className="space-y-2" data-testid="change-package-form-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isEdit && current.error && !pkg) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-destructive" role="alert">
          {current.error}
        </p>
        <Button variant="outline" asChild className="w-fit">
          <Link to="/changes">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Kembali ke daftar
          </Link>
        </Button>
      </div>
    );
  }

  if (isEdit && !pkg) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon-sm" asChild>
          <Link
            to={isEdit ? `/changes/${id}` : "/changes"}
            aria-label="Kembali"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold">
            {isEdit ? "Ubah Paket Perubahan" : "Paket Perubahan Baru"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Perbarui draft paket perubahan sebelum disubmit."
              : "Isi formulir paket perubahan, lalu simpan draft atau submit."}
          </p>
        </div>
      </div>

      {current.error ? (
        <p
          className="text-sm text-destructive"
          role="alert"
          data-testid="change-package-form-error"
        >
          {current.error}
        </p>
      ) : null}

      {validation.length > 0 ? (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
          data-testid="change-package-form-validation"
        >
          {validation.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Inisiasi</CardTitle>
          <CardDescription>Identitas dan kebutuhan paket perubahan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-field">Bidang</FieldLabel>
              <p
                id="change-package-field"
                className="text-sm text-muted-foreground"
                data-testid="change-package-field-value"
              >
                {/* Create: dari user.team.field; edit: dari data paket. Tidak
                    ada select bidang — tak ada endpoint daftar bidang. */}
                {isEdit
                  ? (pkg?.initiation.field?.name ??
                    `Bidang #${pkg?.initiation.field_id}`)
                  : (user?.team?.field?.name ?? "-")}
              </p>
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-needed-by">
                Tanggal dibutuhkan
              </FieldLabel>
              <Input
                id="change-package-needed-by"
                type="date"
                value={form.neededByDate}
                onChange={(e) => set("neededByDate", e.target.value)}
              />
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-description">Deskripsi</FieldLabel>
              <Input
                id="change-package-description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-reason">Alasan</FieldLabel>
              <Input
                id="change-package-reason"
                value={form.reason}
                onChange={(e) => set("reason", e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Implementasi</CardTitle>
          <CardDescription>
            Rencana teknis — wajib lengkap saat submit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-priority">Prioritas</FieldLabel>
              <select
                id="change-package-priority"
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                value={form.priority}
                onChange={(e) =>
                  set("priority", e.target.value as FormState["priority"])
                }
              >
                <option value="">Pilih prioritas</option>
                <option value="normal">Normal</option>
                <option value="emergency">Emergency</option>
              </select>
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-impact">Dampak</FieldLabel>
              <select
                id="change-package-impact"
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                value={form.impact}
                onChange={(e) => set("impact", e.target.value as FormState["impact"])}
              >
                <option value="">Pilih dampak</option>
                <option value="Minor">Minor</option>
                <option value="Mayor">Mayor</option>
              </select>
            </Field>
            <Field orientation="vertical">
              <FieldLabel>Jenis perubahan</FieldLabel>
              <div className="flex flex-col gap-1">
                {changeTypes.items.map((type) => (
                  <label
                    key={type.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.changeTypeIds.includes(type.id)}
                      onChange={() => toggleChangeType(type.id)}
                    />
                    {type.name}
                  </label>
                ))}
                {changeTypes.status !== "succeeded" ? (
                  <p className="text-xs text-muted-foreground">
                    Jenis perubahan dimuat…
                  </p>
                ) : null}
              </div>
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-test-plan">
                Rencana pengujian
              </FieldLabel>
              <Input
                id="change-package-test-plan"
                value={form.testPlan}
                onChange={(e) => set("testPlan", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field orientation="vertical">
                <FieldLabel htmlFor="change-package-execution-date">
                  Tanggal eksekusi
                </FieldLabel>
                <Input
                  id="change-package-execution-date"
                  type="date"
                  value={form.executionDate}
                  onChange={(e) => set("executionDate", e.target.value)}
                />
              </Field>
              <Field orientation="vertical">
                <FieldLabel htmlFor="change-package-release-date">
                  Tanggal rilis
                </FieldLabel>
                <Input
                  id="change-package-release-date"
                  type="date"
                  value={form.releaseDate}
                  onChange={(e) => set("releaseDate", e.target.value)}
                />
              </Field>
            </div>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-implementation-result">
                Hasil implementasi
              </FieldLabel>
              <Input
                id="change-package-implementation-result"
                value={form.implementationResult}
                onChange={(e) => set("implementationResult", e.target.value)}
              />
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-production-impact">
                Dampak produksi
              </FieldLabel>
              <Input
                id="change-package-production-impact"
                value={form.productionImpact}
                onChange={(e) => set("productionImpact", e.target.value)}
              />
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-required-effort">
                Effort yang dibutuhkan
              </FieldLabel>
              <Input
                id="change-package-required-effort"
                value={form.requiredEffort}
                onChange={(e) => set("requiredEffort", e.target.value)}
              />
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-resources">Sumber daya</FieldLabel>
              <Input
                id="change-package-resources"
                value={form.resources}
                onChange={(e) => set("resources", e.target.value)}
              />
            </Field>
            <Field orientation="vertical">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.costNeeded}
                  onChange={(e) => set("costNeeded", e.target.checked)}
                />
                Perlu biaya?
              </label>
              {form.costNeeded ? (
                <Field orientation="vertical">
                  <FieldLabel htmlFor="change-package-cost-amount">
                    Jumlah biaya
                  </FieldLabel>
                  <Input
                    id="change-package-cost-amount"
                    type="text"
                    inputMode="decimal"
                    value={form.costAmount}
                    onChange={(e) => set("costAmount", e.target.value)}
                  />
                </Field>
              ) : null}
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        {canDraft ? (
          <Button variant="outline" disabled={busy} onClick={() => void handleSaveDraft()}>
            <Save aria-hidden="true" className="size-4" />
            Simpan Draft
          </Button>
        ) : null}
        {canDoSubmit ? (
          <Button disabled={busy} onClick={() => void handleSubmit()}>
            <FilePlus2 aria-hidden="true" className="size-4" />
            Submit
          </Button>
        ) : null}
      </div>
    </div>
  );
}
