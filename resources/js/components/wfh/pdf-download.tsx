/**
 * `pdf-download` — unduh PDF ber-bearer via Blob → objectURL → anchor → revoke.
 * Sumber blob dipisah lewat `getBlob` (pemanggil menanamkan `exportWfhReportPdf`
 * atau endpoint lain); komponen tidak tahu path, tidak menyentuh interceptor JSON.
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
}: {
  getBlob: () => Promise<Blob>;
  filename: string;
  children: ReactNode;
}) {
  const [downloading, setDownloading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setDownloading(true);
    setError(null);
    try {
      const blob = await getBlob();
      downloadBlob(blob, filename);
    } catch {
      setError("Gagal mengunduh PDF. Coba lagi.");
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