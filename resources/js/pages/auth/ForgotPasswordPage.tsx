/**
 * ForgotPasswordPage — minta OTP ke email (Slice 3).
 *
 * Public (security:[]). Anti-enumeration: respons selalu sama, navigasi ke
 * `/verify-otp?email=…` begitu request sukses; error envelope (422/429)
 * ditampilkan dari `auth.error`.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { forgotPassword } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export function ForgotPasswordPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const status = useAppSelector((s) => s.auth.status);
  const error = useAppSelector((s) => s.auth.error);

  const [email, setEmail] = useState("");
  const submitting = status === "loading";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const result = await dispatch(forgotPassword({ email }));
    if (forgotPassword.fulfilled.match(result)) {
      navigate(`/verify-otp?email=${encodeURIComponent(email)}`, { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Lupa password</CardTitle>
          <CardDescription>
            Masukkan email akun Anda. Kami akan mengirim kode OTP 6 digit.
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
                <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
                <Input
                  id="forgot-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
                data-testid="forgot-submit"
              >
                {submitting ? (
                  <>
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Mengirim…
                  </>
                ) : (
                  "Kirim OTP"
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
