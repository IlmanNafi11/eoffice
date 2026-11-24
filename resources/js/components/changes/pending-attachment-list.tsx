/**
 * `pending-attachment-list` — pratinjau berkas terpilih SEBELUM paket
 * perubahan disimpan (mode create).
 *
 * Kontrak data: byte berkas masih lokal (`File`), jadi pratinjau memakai
 * objectURL lokal (`URL.createObjectURL`) — TANPA request jaringan. Lifecycle
 * objectURL terpusat: dibuat sekali per `File` (identitas referensi), di-revoke
 * saat berkas hilang dari daftar atau saat unmount (pola `attachment-list`).
 *
 * Alur:
 * - berkas gambar (`type` image/*) → thumbnail + klik membuka lightbox
 *   react-photo-view;
 * - non-gambar → ikon berkas (tanpa preview);
 * - tombol `Hapus Lampiran#N` memanggil `onRemove(file)` — pemilik state
 *   (halaman form) yang menghapus dari antrean.
 */
import { useEffect, useRef, useState } from "react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import { FileIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import "react-photo-view/dist/react-photo-view.css";

interface PendingAttachmentListProps {
  files: File[];
  /** Hapus berkas dari antrean — dipanggil dengan berkas persis. */
  onRemove: (file: File) => void;
  /** Flush unggah in-flight: tombol hapus nonaktif agar klik "Hapus" tidak
   * berlaku pada batch yang SUDAH di-capture (file tetap terkirim). */
  disabled?: boolean;
}

export function PendingAttachmentList({
  files,
  onRemove,
  disabled = false,
}: PendingAttachmentListProps) {
  // Map File → objectURL; satu sumber kebenaran lifecycle (revoke on change).
  const [previews, setPreviews] = useState<Map<File, string>>(() => new Map());

  useEffect(() => {
    setPreviews((prev) => {
      const next = new Map<File, string>();
      for (const file of files) {
        // Identitas referensi File stabil selama masih di antrean → URL dipakai
        // ulang (tidak membuat blob baru tiap rerender).
        next.set(file, prev.get(file) ?? URL.createObjectURL(file));
      }
      for (const [file, url] of prev) {
        if (!next.has(file)) URL.revokeObjectURL(url);
      }
      return next;
    });
  }, [files]);

  // Revoke semua objectURL saat unmount terakhir.
  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  useEffect(
    () => () => {
      for (const url of previewsRef.current.values()) {
        URL.revokeObjectURL(url);
      }
    },
    [],
  );

  return (
    <PhotoProvider>
      <ul className="flex flex-col gap-1">
        {files.map((file, index) => {
          const objectUrl = previews.get(file);
          return (
            <li
              // `file.name` BUKAN kunci unik: dua berkas dari folder berbeda
              // bisa bernama sama dalam satu antrean multi-select. Referensi
              // `File` stabil selama masih di antrean (identik dengan kunci
              // map preview); index mengunci posisi saat antrean berubah.
              key={`${file.name}-${index}`}
              data-testid={`pending-attachment-${file.name}`}
              className="flex items-center gap-3 text-sm"
            >
              {objectUrl && file.type.startsWith("image/") ? (
                <PhotoView src={objectUrl}>
                  <button
                    type="button"
                    aria-label={`Pratinjau ${file.name}`}
                    className="block cursor-zoom-in overflow-hidden rounded border bg-muted/40 transition-colors hover:border-ring"
                  >
                    <img
                      src={objectUrl}
                      alt={file.name}
                      className="h-20 w-28 object-contain"
                      loading="lazy"
                    />
                  </button>
                </PhotoView>
              ) : (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <FileIcon aria-hidden="true" className="size-4" />
                </span>
              )}
              <span>{file.name}</span>
              <Button
                variant="ghost"
                size="xs"
                disabled={disabled}
                onClick={() => onRemove(file)}
              >
                Hapus Lampiran#{index + 1}
              </Button>
            </li>
          );
        })}
      </ul>
    </PhotoProvider>
  );
}
