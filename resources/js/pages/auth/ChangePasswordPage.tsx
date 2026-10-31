/**
 * ChangePasswordPage — ubah password manual (Slice 4).
 *
 * Terjangkau bahkan saat `must_change_password` aktif (route di luar guard
 * `/change-password`). Sukses → flag turun → redirect `/`.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
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
import { changePassword } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export function ChangePasswordPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const status = useAppSelector((s) => s.auth.status);
  const error = useAppSelector((s) => s.auth.error);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const submitting = status === "loading";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const result = await dispatch(
      changePassword({
        current_password: current,
        new_password: next,
        new_password_confirmation: confirm,
      }),
    );
    if (changePassword.fulfilled.match(result)) {
      navigate("/", { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Ubah password</CardTitle>
          <CardDescription>
            Masukkan password saat ini dan password baru.
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
                <FieldLabel htmlFor="cp-current">Password saat ini</FieldLabel>
                <Input
                  id="cp-current"
                  name="current_password"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="cp-new">Password baru</FieldLabel>
                <Input
                  id="cp-new"
                  name="new_password"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="cp-confirm">Konfirmasi password baru</FieldLabel>
                <Input
                  id="cp-confirm"
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
                data-testid="change-password-submit"
              >
                {submitting ? (
                  <>
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  "Ubah password"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
