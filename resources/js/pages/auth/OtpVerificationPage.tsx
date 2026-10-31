/**
 * OtpVerificationPage — verifikasi OTP 6 digit → `reset_token` (Slice 3).
 *
 * Email dibawa via query string `?email=…` dari halaman forgot (fallback:
 * input kosong yang diedit user — mis. user membuka link langsung). OTP
 * benar → `reset_token` disimpan di sessionStorage (public flow: belum ada
 * session Redux; sessionStorage membatalkan token jika tab ditutup) lalu
 * navigasi ke `/reset-password?email=…`.
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
import { verifyOtp } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

/** Kunci sessionStorage tempat `reset_token` diteruskan ke halaman reset. */
export const RESET_TOKEN_KEY = "pwreset.token";

export function OtpVerificationPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const status = useAppSelector((s) => s.auth.status);
  const error = useAppSelector((s) => s.auth.error);

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const submitting = status === "loading";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const result = await dispatch(verifyOtp({ email, code }));
    if (verifyOtp.fulfilled.match(result)) {
      sessionStorage.setItem(RESET_TOKEN_KEY, result.payload.reset_token);
      navigate(`/reset-password?email=${encodeURIComponent(email)}`, { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Verifikasi OTP</CardTitle>
          <CardDescription>
            Masukkan kode 6 digit yang dikirim ke email Anda.
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
                <FieldLabel htmlFor="otp-email">Email</FieldLabel>
                <Input
                  id="otp-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="otp-code">Kode OTP</FieldLabel>
                <Input
                  id="otp-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
                data-testid="otp-submit"
              >
                {submitting ? (
                  <>
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Memverifikasi…
                  </>
                ) : (
                  "Verifikasi OTP"
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
