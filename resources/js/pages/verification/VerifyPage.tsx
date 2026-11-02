/**
 * VerifyPage — halaman publik verifikasi dokumen QR (modul verification).
 *
 * Public (security:[]): di luar guard, tanpa AppShell/dispatch/slice — pola
 * `ForgotPasswordPage` card centered, tanpa input (Resolved #2: token hanya
 * dari URL). On-mount fetch sekali `verifyQrToken(token)`; pesan server
 * (404/429) dirender apa adunya dengan role="alert". Token salah bentuk
 * dicek klien (`^[a-f0-9]{64}$`) → pesan sama dengan server TANPA fetch
 * (UX saja — server tetap otoritas, controller validasi ulang).
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FileCheck2, FileWarning, Loader2 } from "lucide-react";

import { verifyQrToken } from "@/api/verification";
import type { QrVerification } from "@/api/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/** Pesan server (ApiError 404/429) — fallback pesan generik Indonesia. */
function verifyErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Gagal memverifikasi dokumen. Coba lagi.";
}

type VerifyState =
  | { phase: "loading" }
  | { phase: "result"; data: QrVerification }
  | { phase: "error"; message: string };

export function VerifyPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<VerifyState>({ phase: "loading" });

  useEffect(() => {
    if (!token || !TOKEN_PATTERN.test(token)) {
      setState({
        phase: "error",
        message: "Token verifikasi tidak valid.",
      });
      return;
    }

    let cancelled = false;
    verifyQrToken(token)
      .then((data) => {
        if (!cancelled) setState({ phase: "result", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ phase: "error", message: verifyErrorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm" data-testid="verify-card">
        <CardHeader>
          <CardTitle className="text-2xl">Verifikasi Dokumen</CardTitle>
          <CardDescription>
            Status verifikasi tanda tangan dokumen resmi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.phase === "loading" ? (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-5 animate-spin" />
              Memverifikasi…
            </div>
          ) : state.phase === "error" ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <FileWarning aria-hidden="true" className="size-8 text-destructive" />
              <p role="alert" className="text-sm text-destructive">
                {state.message}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <FileCheck2 aria-hidden="true" className="size-8 text-emerald-600" />
              <p className="text-sm font-medium" data-testid="verify-doc-type">
                {state.data.doc_type}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="verify-doc-number">
                {state.data.doc_number}
              </p>
              {state.data.report_date ? (
                <p className="text-sm text-muted-foreground" data-testid="verify-report-date">
                  {state.data.report_date}
                </p>
              ) : null}
              <span
                data-testid="verify-status"
                className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              >
                {state.data.status}
              </span>
              <p className="text-sm text-muted-foreground" data-testid="verify-message">
                {state.data.message}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
