/**
 * `reset_token` (60-char) dibaca sekali dari sessionStorage lewat remove-on-read
 * (diterbitkan verifikasi OTP, TTL server 5 menit) dan disimpan ke state lokal
 * selama halaman hidup — kredensial reset tidak menetap di storage bila alur
 * ditinggalkan. Token hilang → kembali ke `/forgot-password`; sukses → `/login`.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

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
import { resetPassword } from "@/store/authSlice";
import { RESET_TOKEN_KEY } from "@/pages/auth/OtpVerificationPage";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export function ResetPasswordPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // reset_token dibaca sekali ke state lalu langsung dihapus dari
  // sessionStorage (remove-on-read): kredensial reset yang kuat tidak boleh
  // menetap di storage bila pengguna meninggalkan alur tanpa menyelesaikan.
  // Token tetap tersedia untuk retry di state ini sampai submit sukses.
  const status = useAppSelector((s) => s.auth.status);
  const error = useAppSelector((s) => s.auth.error);

  const [resetToken] = useState<string | null>(() => {
    const token = sessionStorage.getItem(RESET_TOKEN_KEY);
    sessionStorage.removeItem(RESET_TOKEN_KEY);
    return token;
  });
  const [email] = useState(() => searchParams.get("email") ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const submitting = status === "loading";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    // Token sudah dipindah dari sessionStorage ke state `resetToken` saat
    // mount; hilang berarti alur dibuka langsung tanpa verify-otp.
    if (!resetToken) {
      void navigate("/forgot-password", { replace: true });
      return;
    }

    const result = await dispatch(
      resetPassword({
        reset_token: resetToken,
        new_password: newPassword,
        new_password_confirmation: confirm,
      }),
    );
    if (resetPassword.fulfilled.match(result)) {
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Atur password baru</CardTitle>
          <CardDescription>
            Password minimal 8 karakter. {email ? `Email: ${email}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-4">
              {error ? (
                <div role="alert" className="text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <Field>
                <FieldLabel htmlFor="reset-new">Password baru</FieldLabel>
                <Input
                  id="reset-new"
                  name="new_password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="reset-confirm">Konfirmasi password</FieldLabel>
                <Input
                  id="reset-confirm"
                  name="new_password_confirmation"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
                data-testid="reset-submit"
              >
                {submitting ? (
                  <>
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  "Simpan password"
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="underline underline-offset-4">
                  Kembali ke login
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
