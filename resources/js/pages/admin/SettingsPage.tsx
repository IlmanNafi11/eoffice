/**
 * SettingsPage — Pengaturan (modul admin, plan Task 7).
 *
 * Alur (spec SPEC-admin.md + plan Task 7):
 * - mount → `fetchSettings` (cache sekali per sesi di slice);
 * - scalar (string | number | boolean) → input teks editable, display
 *   `String(value)`; structured (array/objek) → `JSON.stringify` READ-ONLY
 *   (Resolved #2) tanpa tombol simpan;
 * - tombol "Simpan" per key → `updateSettingThunk` body `{value}` string;
 *   sukses memperbarui map cache settings (di slice);
 * - pesan 404 ("Setting '…' tidak ditemukan.") dirender apa adanya dan tak
 *   lenyap saat refetch (a602c46 ditegakkan di slice — `current.error`);
 * - konfirmasi khusus key berawalan `password_default_*` sebelum mengirim;
 * - gate halaman `setting.manage` → input read-only + tombol "Simpan" hilang
 *   bila dipangkas (permission sintetik, bukan role name).
 */
import { useEffect, useState } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import {
  fetchSettings,
  selectAdminCurrentUser,
  selectAdminSettings,
  updateSettingThunk,
} from "@/store/adminSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { can } from "@/lib/permissions";
import { selectUser } from "@/store/authSlice";

/** Structured = array/objek (nilai ter-decode `Setting::prime`). */
function isStructured(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

/** Display: scalar → `String`, structured → `JSON.stringify` read-only. */
function toDisplay(value: unknown): string {
  return isStructured(value) ? JSON.stringify(value) : String(value);
}

interface SettingRowProps {
  settingKey: string;
  value: unknown;
  canManage: boolean;
  onSave: (key: string, value: string) => void;
}

function SettingRow({ settingKey, value, canManage, onSave }: SettingRowProps) {
  const structured = isStructured(value);
  const editable = canManage && !structured;
  const [draft, setDraft] = useState(() => toDisplay(value));
  const [dirty, setDirty] = useState(false);
  // Key berprefix `password_default_*` dimask: nilai tak terekspos di layar
  // (tetap terbaca via network — redaksi penuh tanggung jawab backend).
  const masked = settingKey.startsWith("password_default_");
  const [reveal, setReveal] = useState(false);

  return (
    <div
      data-testid={`setting-row-${settingKey}`}
      className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3"
    >
      <Label htmlFor={`setting-input-${settingKey}`} className="font-medium">
        {settingKey}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={`setting-input-${settingKey}`}
          data-testid={`setting-input-${settingKey}`}
          type={masked && !reveal ? "password" : "text"}
          value={draft}
          disabled={!editable}
          onChange={(e) => {
            setDraft(e.target.value);
            setDirty(true);
          }}
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
      {editable ? (
        <div>
          <Button
            type="button"
            size="sm"
            disabled={!dirty}
            onClick={() => onSave(settingKey, draft)}
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
    value: string;
  } | null>(null);

  useEffect(() => {
    dispatch(fetchSettings());
  }, [dispatch]);

  async function doSave(key: string, value: string) {
    try {
      await dispatch(updateSettingThunk({ key, value })).unwrap();
    } catch {
      // error diset reducer (current.error) — pesan server tampil apa adanya.
    }
  }

  function requestSave(key: string, value: string) {
    if (key.startsWith("password_default_")) {
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
  const entries = settings ? Object.entries(settings) : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">
          Ubah nilai setting aplikasi. Nilai JSON (array/objek) ditampilkan
          read-only.
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
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Tidak ada setting untuk ditampilkan.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map(([key, value]) => (
            <SettingRow
              key={key}
              settingKey={key}
              value={value}
              canManage={canManage}
              onSave={requestSave}
            />
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