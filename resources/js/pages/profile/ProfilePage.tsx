/**
 * ProfilePage — lihat/edit profil + upload tanda tangan (frontend-phase1 Phase 4).
 *
 * - GET /profile sudah tercakup oleh `fetchMe` saat shell mount; halaman ini
 *   menampilkan `user` dari Redux dan mengirim PUT /profile untuk field
 *   phone/position/rank. Sukses → `setUser` agar sidebar/header ikut segar.
 * - Upload signature memakai `FormData` (multipart) via `uploadSignature`;
 *   preview `signature_url` diperbarui setelah sukses, dan state user disinkron.
 * - Error 422 dari backend ditampilkan per-field (ApiError.errors).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Loader2 } from "lucide-react";

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
import { ApiError } from "@/api/client";
import { uploadSignature, updateProfile, fetchSignatureObjectUrl } from "@/api/profile";
import { setUser, selectUser } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export function ProfilePage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);

  const [phone, setPhone] = useState(user?.phone ?? "");
  const [position, setPosition] = useState(user?.position ?? "");
  const [rank, setRank] = useState(user?.rank ?? "");

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  // Preview berupa object URL dari bytes yang diambil lewat client
  // ber-otorisasi (bearer). `<img src="/api/...">` polos tidak membawa token
  // dan selalu 401 — lihat `fetchSignatureObjectUrl`.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Object URL preview disimpan di ref agar lifecycle-nya terpusat: setiap
  // URL baru me-revoke URL sebelumnya, dan cleanup unmount me-revoke URL
  // terakhir — tanpa race antara promise `.then` dan re-render berikutnya
  // (ship review: kebocoran object URL pada upload berulang/efek lama).
  const previewUrlRef = useRef<string | null>(null);

  const setAndTrackPreviewUrl = useCallback((next: string | null) => {
    if (previewUrlRef.current && previewUrlRef.current !== next) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = next;
    setPreviewUrl(next);
  }, []);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );
  // Sinkronkan form saat user terisi/berubah (mis. setelah rehidrasi).
  useEffect(() => {
    if (!user) return;
    setPhone(user.phone ?? "");
    setPosition(user.position ?? "");
    setRank(user.rank ?? "");

    if (user.signature_url) {
      // Promise lama yang menyelesaikan setelah URL yang lebih baru sudah
      // diset tidak boleh menimpa; URL tertinggal akan di-revoke oleh
      // setAndTrackPreviewUrl saat URL berikutnya masuk, dan cleanup unmount
      // me-revoke yang tersisa.
      fetchSignatureObjectUrl(user.signature_url)
        .then(setAndTrackPreviewUrl)
        .catch(() => setAndTrackPreviewUrl(null));
    } else {
      setAndTrackPreviewUrl(null);
    }
  }, [user?.id, setAndTrackPreviewUrl]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !user) return;

    setSaving(true);
    setFieldErrors({});
    setMessage(null);

    try {
      const result = await updateProfile({
        phone: phone.trim() === "" ? null : phone.trim(),
        position: position.trim() === "" ? null : position.trim(),
        rank: rank.trim() === "" ? null : rank.trim(),
      });
      dispatch(setUser(result));
      setMessage("Profil berhasil diperbarui.");
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors ?? {});
        if (!err.errors || Object.keys(err.errors).length === 0) {
          setMessage(err.message);
        }
      } else {
        setMessage("Gagal menyimpan profil.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setFieldErrors({});
    setMessage(null);

    const form = new FormData();
    form.append("signature", file);

    try {
      const result = await uploadSignature(form);
      setAndTrackPreviewUrl(await fetchSignatureObjectUrl(result.signature_url));
      dispatch(
        setUser({
          ...user,
          signature_path: result.signature_path,
          signature_url: result.signature_url,
        }),
      );
      setMessage("Tanda tangan berhasil diunggah.");
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors ?? {});
        if (!err.errors || Object.keys(err.errors).length === 0) {
          setMessage(err.message);
        }
      } else {
        setMessage("Gagal mengunggah tanda tangan.");
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        <span>Memuat profil…</span>
      </div>
    );
  }

  const signatureErrors = fieldErrors.signature;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profil Saya</h1>
        <p className="text-sm text-muted-foreground">
          Lihat dan perbarui data profil serta tanda tangan Anda.
        </p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Data diri</CardTitle>
          <CardDescription>
            Nama, NIP, dan email dikelola oleh admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Nama</span>
              <span className="font-medium">{user.name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">NIP</span>
              <span className="font-medium">{user.nip}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user.email}</span>
            </div>
            {user.team ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Tim</span>
                <span className="font-medium">{user.team.name}</span>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSave} noValidate>
            <div className="flex flex-col gap-4">
              {message ? (
                <div role="status" className="text-sm text-muted-foreground">
                  {message}
                </div>
              ) : null}

              <Field>
                <FieldLabel htmlFor="profile-phone">Telepon</FieldLabel>
                <Input
                  id="profile-phone"
                  name="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={saving}
                  maxLength={20}
                />
                <FieldError errors={fieldErrors.phone?.map((m) => ({ message: m }))} />
              </Field>

              <Field>
                <FieldLabel htmlFor="profile-position">Jabatan</FieldLabel>
                <Input
                  id="profile-position"
                  name="position"
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  disabled={saving}
                  maxLength={255}
                />
                <FieldError errors={fieldErrors.position?.map((m) => ({ message: m }))} />
              </Field>

              <Field>
                <FieldLabel htmlFor="profile-rank">Pangkat/Golongan</FieldLabel>
                <Input
                  id="profile-rank"
                  name="rank"
                  type="text"
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                  disabled={saving}
                  maxLength={255}
                />
                <FieldError errors={fieldErrors.rank?.map((m) => ({ message: m }))} />
              </Field>

              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={saving}
                data-testid="profile-save"
              >
                {saving ? (
                  <>
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  "Simpan profil"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Tanda tangan</CardTitle>
          <CardDescription>
            PNG/JPG/JPEG, maksimal 2MB dan 2000×2000px. Dipakai pada ekspor PDF.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Pratinjau tanda tangan"
                className="h-24 w-auto rounded border bg-white object-contain p-2"
              />
            ) : (
              <div className="flex h-24 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
                Belum ada tanda tangan
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="profile-signature">Unggah tanda tangan</FieldLabel>
              <Input
                ref={fileInputRef}
                id="profile-signature"
                name="signature"
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleFileChange}
                disabled={uploading}
                data-testid="signature-input"
              />
              <FieldError errors={signatureErrors?.map((m) => ({ message: m }))} />
            </Field>

            {uploading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Mengunggah…
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}