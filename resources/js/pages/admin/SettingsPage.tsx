/**
 * SettingsPage — Pengaturan (modul admin, plan Task 6 ux-fixes).
 *
 * Alur (spec `SPEC-ux-settings.md` + plan Task 6):
 * - mount → `fetchSettings` (cache sekali per sesi di slice);
 * - tiap baris membaca `settingMeta(key)` → label Indonesia + kontrol per
 *   kind: day-checkbox (7 hari ISO), session-checkbox (3 sesi fixed),
 *   `TimeInput` (HH:mm, non-native), password (masked + dialog konfirmasi),
 *   text fallback (key tak dikenal = label key, tetap tampil);
 * - `Simpan` per key mengirim nilai ter-decode (array tetap array, jam
 *   string `HH:mm`) via `updateSettingThunk`;
 * - pesan 404 ("Setting '…' tidak ditemukan.") dirender apa adanya dan tak
 *   lenyap saat refetch (a602c46 ditegakkan di slice — `current.error`);
 * - gate halaman `setting.manage` → kontrol disabled + tombol "Simpan"
 *   hilang bila dipangkas (permission sintetik, bukan role name).
 */
import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeInput } from "@/components/ui/time-input";
import {
  fetchSettings,
  selectAdminCurrentUser,
  selectAdminSettings,
  updateSettingThunk,
} from "@/store/adminSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { can } from "@/lib/permissions";
import {
  SETTING_META,
  WFH_DAYS,
  WFH_SESSIONS,
  settingMeta,
  type SettingMeta,
} from "@/lib/settings-meta";
import { toUiError } from "@/lib/ui-errors";
import { selectUser } from "@/store/authSlice";

/** Nilai yang boleh dikirim ke `PUT /admin/settings/{key}`. */
type SettingSaveValue = string | number[] | string[];

/** Draft lokal typed per kind kontrol. */
type Draft =
  | { kind: "text"; value: string }
  | { kind: "password"; value: string }
  | { kind: "time"; value: string }
  | { kind: "day-checkbox"; value: number[] }
  | { kind: "session-checkbox"; value: string[] };

/** Display teks untuk fallback: objek/array di-JSON-kan agar terbaca. */
function displayText(value: unknown): string {
  return typeof value === "object" && value !== null
    ? JSON.stringify(value)
    : String(value);
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number")
    : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Draft awal dari nilai server + kind kontrol. */
function initialDraft(meta: SettingMeta, value: unknown): Draft {
  switch (meta.control.kind) {
    case "day-checkbox":
      return { kind: "day-checkbox", value: asNumberArray(value) };
    case "session-checkbox":
      return { kind: "session-checkbox", value: asStringArray(value) };
    case "time":
      return { kind: "time", value: typeof value === "string" ? value : "" };
    case "password":
      return { kind: "password", value: value == null ? "" : String(value) };
    default:
      return { kind: "text", value: value == null ? "" : displayText(value) };
  }
}

interface SettingRowProps {
  settingKey: string;
  value: unknown;
  canManage: boolean;
  /** Aksi simpan untuk key ini sedang in-flight (spinner + disabled). */
  pending: boolean;
  onSave: (key: string, value: SettingSaveValue) => void;
}

function SettingRow({ settingKey, value, canManage, pending, onSave }: SettingRowProps) {
  const meta = settingMeta(settingKey);
  const [draft, setDraft] = useState(() => initialDraft(meta, value));
  const [dirty, setDirty] = useState(false);
  const [reveal, setReveal] = useState(false);

  // Sinkron draft dengan nilai baru dari cache slice — setelah simpan sukses
  // (fulfilled memperbarui `value`) draft bersih kembali: tombol Simpan
  // disabled, toast sukses tidak terpicu ulang (settings-layout S3).
  useEffect(() => {
    setDraft(initialDraft(meta, value));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const editable = canManage;
  const inputId = `setting-input-${settingKey}`;
  // Key berprefix `password_default_*` dimask: nilai tak terekspos di layar
  // (tetap terbaca via network — redaksi penuh tanggung jawab backend).
  const masked = draft.kind === "password";

  const update = (next: Draft) => {
    setDraft(next);
    setDirty(true);
  };

  return (
    <div
      data-testid={`setting-row-${settingKey}`}
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={inputId} className="font-medium">
          {meta.label}
        </Label>
        {meta.description ? (
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        ) : null}
      </div>

      {draft.kind === "day-checkbox" ? (
        <div
          role="group"
          aria-label={meta.label}
          data-testid={`setting-days-${settingKey}`}
          className="flex flex-wrap gap-3"
        >
          {WFH_DAYS.map((day) => (
            <label key={day.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                data-testid={`setting-day-${day.value}`}
                aria-label={day.label}
                disabled={!editable}
                checked={draft.value.includes(day.value)}
                onCheckedChange={() =>
                  update({
                    kind: "day-checkbox",
                    value: draft.value.includes(day.value)
                      ? draft.value.filter((v) => v !== day.value)
                      : [...draft.value, day.value].sort((a, b) => a - b),
                  })
                }
              />
              {day.label}
            </label>
          ))}
        </div>
      ) : draft.kind === "session-checkbox" ? (
        <div
          role="group"
          aria-label={meta.label}
          data-testid={`setting-sessions-${settingKey}`}
          className="flex flex-wrap gap-3"
        >
          {WFH_SESSIONS.map((session) => (
            <label key={session} className="flex items-center gap-2 text-sm">
              <Checkbox
                data-testid={`setting-session-${session}`}
                aria-label={session}
                disabled={!editable}
                checked={draft.value.includes(session)}
                onCheckedChange={() =>
                  update({
                    kind: "session-checkbox",
                    value: draft.value.includes(session)
                      ? draft.value.filter((v) => v !== session)
                      : [...draft.value, session],
                  })
                }
              />
              {session}
            </label>
          ))}
        </div>
      ) : draft.kind === "time" ? (
        <TimeInput
          data-testid={inputId}
          value={draft.value}
          disabled={!editable}
          onChange={(next) => update({ kind: "time", value: next })}
        />
      ) : (
        <div className="flex items-center gap-2">
          <Input
            id={inputId}
            data-testid={inputId}
            type={masked && !reveal ? "password" : "text"}
            value={draft.value}
            disabled={!editable}
            onChange={(e) => update({ kind: draft.kind, value: e.target.value })}
          />
          {masked ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={reveal ? "Sembunyikan nilai" : "Tampilkan nilai"}
              onClick={() => setReveal((v) => !v)}
            >
              {reveal ? "Sembunyikan" : "Tampilkan"}
            </Button>
          ) : null}
        </div>
      )}

      {editable ? (
        <div>
          <Button
            type="button"
            size="sm"
            pending={pending}
            disabled={!dirty}
            onClick={() => onSave(settingKey, draft.value)}
          >
            <Save aria-hidden="true" className="size-4" />
            Simpan
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  const dispatch = useAppDispatch();

  const user = useAppSelector(selectUser);
  const settings = useAppSelector(selectAdminSettings);
  const fetchError = useAppSelector((s) => s.admin.settings.error);
  const syncError = useAppSelector(selectAdminCurrentUser).error;

  const canManage = can(user, "setting.manage");

  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<{
    key: string;
    value: SettingSaveValue;
  } | null>(null);
  /** Key yang sedang disimpan — sumber prop `pending` tombol Simpan. */
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // Guard double-submit: ref sinkron menolak dua klik sebelum re-render
  // sempat men-disable tombol (state `savingKey` saja terlambat).
  const savingRef = useRef(false);

  useEffect(() => {
    dispatch(fetchSettings());
  }, [dispatch]);

  async function doSave(key: string, value: SettingSaveValue) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSavingKey(key);
    try {
      const res = await dispatch(updateSettingThunk({ key, value })).unwrap();
      toast.success(res.message);
    } catch (err) {
      // `unwrap()` melempar payload `rejectWithValue` slice — sudah hasil
      // `toUiError` (string). Non-string tetap lewat seam untuk keamanan.
      // Banner inline tetap dirender (current.error dari reducer).
      toast.error(typeof err === "string" && err ? err : toUiError(err).message);
    } finally {
      savingRef.current = false;
      setSavingKey(null);
    }
  }

  function requestSave(key: string, value: SettingSaveValue) {
    if (settingMeta(key).control.kind === "password") {
      setPendingSave({ key, value });
      setConfirmKey(key);
      return;
    }
    void doSave(key, value);
  }

  function confirmAndSave() {
    if (pendingSave) {
      void doSave(pendingSave.key, pendingSave.value);
    }
    setPendingSave(null);
    setConfirmKey(null);
  }

  const loading = settings === null;
  // Urutan render mengikuti SETTING_META (password admin sebelum user);
  // key tak dikenal tetap tampil, di belakang key yang dikenal.
  const keys = settings
    ? [
        ...Object.keys(SETTING_META).filter((k) => k in settings),
        ...Object.keys(settings).filter((k) => !(k in SETTING_META)),
      ]
    : [];
  // Jumlah ganjil: card tepat sebelum pasangan terakhir membentang 2 kolom,
  // sehingga pasangan terakhir (password admin & user) auto-place bersebelahan
  // di baris terakhir (I3).
  const lastOdd = keys.length > 0 && keys.length % 2 === 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">
          Ubah nilai setting aplikasi lewat kontrol yang sesuai jenis nilainya.
        </p>
      </div>

      {fetchError ?? syncError ? (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="settings-error"
        >
          {fetchError ?? syncError}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-2" data-testid="settings-loading">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Tidak ada setting untuk ditampilkan.
        </p>
      ) : (
        <div data-testid="settings-grid" className="grid gap-4 md:grid-cols-2">
          {keys.map((key, i) => (
            <div
              key={key}
              className={
                lastOdd && i === keys.length - 3 ? "md:col-span-2" : undefined
              }
            >
              <SettingRow
                settingKey={key}
                value={settings![key]}
                canManage={canManage}
                pending={savingKey === key}
                onSave={requestSave}
              />
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={confirmKey !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmKey(null);
            setPendingSave(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah password default?</DialogTitle>
            <DialogDescription>
              Key "{confirmKey ?? ""}" menentukan password default akun baru.
              Ubah hanya jika Anda paham dampaknya pada onboarding pengguna.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmKey(null);
                setPendingSave(null);
              }}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmAndSave}
            >
              Lanjutkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
