/**
 * ChangePackageFormPage — form 2-bagian paket perubahan (modul change-package,
 * Phase 3 Task 5).
 *
 * Satu file untuk `/changes/new` (create draft) dan `/changes/:packageId/edit`
 * (isi dari `showPackage`); mode dari param rute.
 *
 * Alur (plan Task 5 + spec):
 * - Bagian Inisiasi: bidang read-only dari `user.team.field` (create) / data
 *   (edit) — tak ada select bidang; `needed_by_date`, deskripsi, alasan.
 *   TANPA picker evaluator: evaluator otomatis inisiator (backend, cutover
 *   Task 3); payload draft/submit tidak membawa `evaluator_id`.
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
import { toast } from "sonner";
import { toUiError } from "@/lib/ui-errors";
import { ATTACHMENT_RULE, validateUploads } from "@/lib/upload-validate";
import { ArrowLeft, FilePlus2, Save } from "lucide-react";

import { AttachmentList } from "@/components/changes/attachment-list";
import { PendingAttachmentList } from "@/components/changes/pending-attachment-list";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/ui/date-input";
import { FileInput } from "@/components/ui/file-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  uploadAttachmentsThunk,
  deleteAttachmentThunk,
  setCurrentPackage,
} from "@/store/changePackageSlice";
import * as changePackageApi from "@/api/change-package";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/authSlice";
import { can } from "@/lib/permissions";
import type {
  PackageAttachment,
  PackageImplementationDraftInput,
  PackageSubmitInput,
} from "@/api/types";

/** Batas kontrak `UploadChangePackageAttachmentsRequest` (max:10 file). */
const MAX_ATTACHMENTS = 10;

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

  // ── Lampiran (hasil pengujian) — tersedia sejak awal ────────────────
  // Server hanya menerima upload pada paket draft milik inisiator, jadi di
  // mode create FileInput menampung file dulu; begitu draft pertama tersimpan
  // (id lahir), berkas terpilih diunggah otomatis ke paket baru. Mode edit
  // draft mengunggah langsung.
  const [attachments, setAttachments] = useState<PackageAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /** Sinkron daftar lampiran + prefill dari data show (edit mode). */
  useEffect(() => {
    if (isEdit && pkg && pkg.initiation.id === id) {
      setAttachments(pkg.implementation?.attachments ?? []);
    }
  }, [isEdit, pkg, id]);

  /**
   * Unggah berkas ke paket yang SUDAH ada, lalu segarkan daftar lampiran.
   * Melempar error agar pemanggil (create: setelah draft lahir; edit:
   * langsung) bisa mensurfacing pesan tanpa menelan kegagalan.
   */
  async function uploadFiles(packageId: number, files: File[]) {
    setUploading(true);
    setUploadError(null);
    try {
      await dispatch(uploadAttachmentsThunk({ packageId, files })).unwrap();
      const fresh = await changePackageApi.showPackage(packageId);
      dispatch(setCurrentPackage(fresh));
      setAttachments(fresh.implementation?.attachments ?? []);
      setPendingFiles([]);
    } catch (err) {
      const message = toUiError(err).message;
      setUploadError(message);
      throw err;
    } finally {
      setUploading(false);
    }
  }

  /** Pilih berkas: edit draft → unggah langsung; create → antre sampai ada id. */
  function handleFilesChange(files: File[]) {
    if (files.length === 0) return;
    const invalid = validateUploads(files, ATTACHMENT_RULE);
    if (invalid !== null) {
      setUploadError(invalid);
      return;
    }
    // Batas 10 adalah TOTAL lampiran implementasi (server menghitung baris
    // yang sudah ada), bukan per batch pilihan — pre-check harus sama.
    const total = attachments.length + pendingFiles.length + files.length;
    if (total > MAX_ATTACHMENTS) {
      setUploadError(
        `Maksimal ${MAX_ATTACHMENTS} lampiran (${attachments.length + pendingFiles.length} sudah ada).`,
      );
      return;
    }
    setUploadError(null);
    if (isEdit) {
      void uploadFiles(id, files).catch(() => undefined);
    } else {
      setPendingFiles((prev) => [...prev, ...files]);
    }
  }

  /** Setelah draft create tersimpan: unggah antrean sebelum navigasi. */
  async function flushPendingUploads(packageId: number) {
    if (pendingFiles.length === 0) return;
    try {
      await uploadFiles(packageId, pendingFiles);
    } catch {
      // Paket tetap tersimpan; pesan sudah tampil di kartu Lampiran.
    }
  }

  /**
   * Hapus lampiran existing (edit draft) → DELETE ke server, lalu segarkan
   * daftar lampiran. Melempar error agar pesan tampil di kartu Lampiran.
   */
  async function removeExisting(attachmentId: number) {
    setUploading(true);
    setUploadError(null);
    try {
      await dispatch(
        deleteAttachmentThunk({ packageId: id, attachmentId }),
      ).unwrap();
      const fresh = await changePackageApi.showPackage(id);
      dispatch(setCurrentPackage(fresh));
      setAttachments(fresh.implementation?.attachments ?? []);
    } catch (err) {
      const message = toUiError(err).message;
      setUploadError(message);
      throw err;
    } finally {
      setUploading(false);
    }
  }

  /** Buang berkas dari antrean pending (belum ada di server). */
  function removePending(file: File) {
    setPendingFiles((prev) => prev.filter((f) => f !== file));
  }

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
      errors.push("Tanggapan Perubahan wajib diisi untuk submit.");
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
      if (!isEdit) await flushPendingUploads(result.initiation.id);
      toast.success(result.message);
      navigate(`/changes/${result.initiation.id}`);
    } catch (err) {
      // Pesan error sudah di slice (current.error) → banner tetap; toast
      // menambah notifikasi sesaat (payload slice string `messageOf`).
      toast.error(typeof err === "string" && err ? err : toUiError(err).message);
    } finally {
      // Reset busy pada SEMUA jalur: tanpa ini, gagal simpan draft membiarkan
      // "Simpan Draft" + "Submit" nonaktif permanen sampai reload halaman
      // (regresi ship-review #13; pola `handleSubmit` di bawah).
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
        // Lampiran yang diantre sebelum draft ada harus menempel pada paket
        // ini SEBELUM submit — setelah navigasi state form hilang.
        await flushPendingUploads(targetId);
      }
      const submitted = await dispatch(
        submitPackageThunk({ packageId: targetId, input: buildSubmitInput() }),
      ).unwrap();
      toast.success(submitted.message);
      navigate(`/changes/${targetId}`);
    } catch (err) {
      // Pesan error sudah di slice (current.error) → banner tetap; toast
      // menambah notifikasi sesaat (payload slice string `messageOf`).
      toast.error(typeof err === "string" && err ? err : toUiError(err).message);
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
              <DateInput
                id="change-package-needed-by"
                value={form.neededByDate}
                onChange={(v) => set("neededByDate", v)}
              />
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-description">Deskripsi</FieldLabel>
              <Textarea
                id="change-package-description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-reason">Alasan</FieldLabel>
              <Textarea
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field orientation="vertical">
                <FieldLabel htmlFor="change-package-priority">Prioritas</FieldLabel>
                <Select
                  value={form.priority === "" ? undefined : form.priority}
                  onValueChange={(v) =>
                    set("priority", (v ?? "") as FormState["priority"])
                  }
                >
                  <SelectTrigger
                    id="change-package-priority"
                    aria-label="Prioritas"
                    className="w-full"
                  >
                    <SelectValue placeholder="Pilih prioritas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="vertical">
                <FieldLabel htmlFor="change-package-impact">Dampak</FieldLabel>
                <Select
                  value={form.impact === "" ? undefined : form.impact}
                  onValueChange={(v) =>
                    set("impact", (v ?? "") as FormState["impact"])
                  }
                >
                  <SelectTrigger
                    id="change-package-impact"
                    aria-label="Dampak"
                    className="w-full"
                  >
                    <SelectValue placeholder="Pilih dampak" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    <SelectItem value="Minor">Minor</SelectItem>
                    <SelectItem value="Mayor">Mayor</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field orientation="vertical">
              <FieldLabel>Jenis perubahan</FieldLabel>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {changeTypes.items.map((type) => (
                  <label
                    key={type.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      aria-label={type.name}
                      checked={form.changeTypeIds.includes(type.id)}
                      onCheckedChange={() => toggleChangeType(type.id)}
                    />
                    {type.name}
                  </label>
                ))}
                {changeTypes.status !== "succeeded" ? (
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Jenis perubahan dimuat…
                  </p>
                ) : null}
              </div>
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-test-plan">
                Rencana pengujian
              </FieldLabel>
              <Textarea
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
                <DateInput
                  id="change-package-execution-date"
                  value={form.executionDate}
                  onChange={(v) => set("executionDate", v)}
                />
              </Field>
              <Field orientation="vertical">
                <FieldLabel htmlFor="change-package-release-date">
                  Tanggal rilis
                </FieldLabel>
                <DateInput
                  id="change-package-release-date"
                  value={form.releaseDate}
                  onChange={(v) => set("releaseDate", v)}
                />
              </Field>
            </div>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-implementation-result">
                Tanggapan Perubahan
              </FieldLabel>
              <Textarea
                id="change-package-implementation-result"
                value={form.implementationResult}
                onChange={(e) => set("implementationResult", e.target.value)}
              />
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-production-impact">
                Dampak produksi
              </FieldLabel>
              <Textarea
                id="change-package-production-impact"
                value={form.productionImpact}
                onChange={(e) => set("productionImpact", e.target.value)}
              />
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-required-effort">
                Upaya/Tindakan
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
                <Checkbox
                  aria-label="Perlu biaya?"
                  checked={form.costNeeded}
                  onCheckedChange={(v) => set("costNeeded", v === true)}
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

      <Card size="sm">
        <CardHeader>
          <CardTitle>Lampiran</CardTitle>
          <CardDescription>
            {attachments.length + pendingFiles.length} dari maksimal{" "}
            {MAX_ATTACHMENTS} berkas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-attachment-input" className="sr-only">
                Unggah Lampiran
              </FieldLabel>
              <FileInput
                id="change-package-attachment-input"
                data-testid="change-package-attachment-input"
                multiple
                className="w-72"
                disabled={uploading}
                placeholder="Pilih lampiran…"
                onFileChange={() => undefined}
                onFilesChange={handleFilesChange}
              />
              {uploadError ? (
                <p className="text-xs text-destructive" role="alert">
                  {uploadError}
                </p>
              ) : null}
              {pendingFiles.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {pendingFiles.length} berkas menunggu — terunggah otomatis
                  setelah draft disimpan.
                </p>
              ) : null}
            </Field>
            {attachments.length > 0 ? (
              <AttachmentList
                attachments={attachments}
                onRemove={
                  isEdit && canDraft
                    ? (attachment) => void removeExisting(attachment.id)
                    : undefined
                }
              />
            ) : null}
            {pendingFiles.length > 0 ? (
              <PendingAttachmentList
                files={pendingFiles}
                onRemove={removePending}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        {canDraft ? (
          <Button variant="outline" pending={busy} onClick={() => void handleSaveDraft()}>
            <Save aria-hidden="true" className="size-4" />
            Simpan Draft
          </Button>
        ) : null}
        {canDoSubmit ? (
          <Button pending={busy} onClick={() => void handleSubmit()}>
            <FilePlus2 aria-hidden="true" className="size-4" />
            Submit
          </Button>
        ) : null}
      </div>
    </div>
  );
}
