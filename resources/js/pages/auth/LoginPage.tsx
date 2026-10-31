/**
 * LoginPage — halaman autentikasi (frontend-phase1 Phase 3, Slice 1).
 *
 * Alur (spec §Success Criteria 2, plan task "LoginPage"):
 * - submit → dispatch thunk `login` (authSlice) → token & user masuk store;
 *   token dipersist ke localStorage oleh slice/modul API, jadi refresh tetap
 *   terautentikasi.
 * - sukses → `navigate("/")`. `ProtectedRoute` yang memilah tujuan akhir:
 *   user dengan `must_change_password` dipaksa ke `/change-password`
 *   (spec §Resolved Questions 3). Halaman ini tidak perlu tahu flag itu.
 * - gagal → `auth.error` (pesan envelope: 401 kredensial salah, 403 akun
 *   nonaktif, 429 throttle) ditampilkan apa adanya; reducer `login.pending`
 *   sudah membersihkan error lama saat submit berikutnya.
 * - link ke `/forgot-password` (alur Slice 3).
 *
 * Login tidak punya respons 422 di kontrak (openapi.yaml: 200/401/403/429),
 * jadi tidak ada tampilan error per-field di sini.
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
import { login } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const status = useAppSelector((s) => s.auth.status);
  const error = useAppSelector((s) => s.auth.error);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submitting = status === "loading";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const result = await dispatch(login({ email, password }));
    if (login.fulfilled.match(result)) {
      navigate("/", { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Masuk eOffice</CardTitle>
          <CardDescription>Gunakan email dan password kantor Anda.</CardDescription>
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
                <FieldLabel htmlFor="login-email">Email</FieldLabel>
                <Input
                  id="login-email"
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
                <FieldLabel htmlFor="login-password">Password</FieldLabel>
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
                data-testid="login-submit"
              >
                {submitting ? (
                  <>
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Memproses…
                  </>
                ) : (
                  "Masuk"
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                <Link to="/forgot-password" className="underline underline-offset-4">
                  Lupa password?
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
