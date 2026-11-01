/**
 * `pdf-download` — unduh PDF ber-bearer via Blob → objectURL → anchor → revoke.
 * Sumber blob dipisah lewat `getBlob` (pemanggil menanamkan `exportWfhReportPdf`
 * atau endpoint lain); komponen tidak tahu path, tidak menyentuh interceptor JSON.
 * `getError?: (error: unknown) => string` opsional — pemanggil yang tahu bentuk
 * error domainnya (mis. ApiError 422/403 dari PDF tim) memetakan pesan server;
 * tanpa prop ini perilaku lama (pesan generik) tetap.
 */
import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

/**
 * Unduh `Blob` jadi objectURL → klik anchor → revoke. Dipisah dari komponen
 * agar test dapat memverifikasi siklus objectURL tanpa merender DOM.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function PdfDownloadButton({
  getBlob,
  filename,
  children,
  getError,
}: {
  getBlob: () => Promise<Blob>;
  filename: string;
  children: ReactNode;
  /** Opsional: petakan error domain → pesan siap tampil (default pesan generik). */
  getError?: (error: unknown) => string;
}) {
  const [downloading, setDownloading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setDownloading(true);
    setError(null);
    try {
      const blob = await getBlob();
      downloadBlob(blob, filename);
    } catch (e) {
      setError(getError ? getError(e) : "Gagal mengunduh PDF. Coba lagi.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" onClick={handleClick} disabled={downloading}>
        {downloading ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Download aria-hidden="true" className="size-4" />
        )}
        {children}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}