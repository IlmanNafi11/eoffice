/**
 * `attachment-list` — daftar lampiran paket perubahan + preview gambar.
 *
 * Kontrak data: server hanya mengirim `{id, url, sort_order}` (AttachmentResource,
 * tanpa mime/nama asli). Tipe berkas dideteksi dari header `Content-Type`
 * respons unduhan — tetap lewat endpoint ber-otorisasi (bearer), bukan
 * `<img src>` telanjang (pola `fetchSignatureObjectUrl`/`attendance-upload`).
 *
 * Alur:
 * - bytes tiap lampiran difetch `httpClient` (interceptor menempel bearer) →
 *   objectURL; lifecycle objectURL terpusat di ref (revoke saat ganti/unmount);
 * - lampiran gambar → thumbnail proporsional (`object-contain`) + klik membuka
 *   lightbox react-photo-view (zoom/pan/swipe antar gambar);
 * - non-gambar → ikon berkas + label "Berkas";
 * - gagal fetch → placeholder "Gagal memuat pratinjau", bukan crash.
 */
import { useEffect, useRef, useState } from "react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import { FileIcon, ImageOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { httpClient } from "@/api/client";
import type { PackageAttachment } from "@/api/types";
import "react-photo-view/dist/react-photo-view.css";

interface AttachmentListProps {
  attachments: PackageAttachment[];
  /** Aksi unduh — dipisah agar halaman pemakai mengendalikan fetch + anchor. */
  onDownload?: (attachment: PackageAttachment) => void | Promise<void>;
  /**
   * Aksi hapus (draft-only) — TANPA prop → tidak ada tombol hapus
   * (halaman read-only seperti detail tetap aman).
   */
  onRemove?: (attachment: PackageAttachment) => void | Promise<void>;
  /** True saat mutasi lampiran sedang berjalan — tombol hapus mati. */
  removing?: boolean;
}

interface LoadedPreview {
  objectUrl: string;
  isImage: boolean;
}

/** Tipe konten yang layak dirender sebagai gambar. */
function isImageType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

export function AttachmentList({
  attachments,
  onDownload,
  onRemove,
  removing,
}: AttachmentListProps) {
  // map id → objectURL; satu sumber kebenaran lifecycle (revoke on change).
  const [previews, setPreviews] = useState<Map<number, LoadedPreview>>(
    () => new Map(),
  );
  const urlRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const currentIds = new Set(attachments.map((a) => a.id));

    async function load(attachment: PackageAttachment): Promise<void> {
      try {
        const res = await httpClient.get<Blob>(attachment.url, {
          responseType: "blob",
        });
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(res.data);
        urlRef.current.set(attachment.id, objectUrl);
        setPreviews((prev) => {
          const next = new Map(prev);
          next.set(attachment.id, {
            objectUrl,
            isImage: isImageType(res.data.type ?? ""),
          });
          return next;
        });
      } catch {
        if (!cancelled) {
          setPreviews((prev) => {
            const next = new Map(prev);
            next.delete(attachment.id);
            return next;
          });
        }
      }
    }

    // Buang entri lampiran yang tidak lagi ada di daftar.
    setPreviews((prev) => {
      const next = new Map(prev);
      for (const id of [...next.keys()]) {
        if (!currentIds.has(id)) {
          const stale = urlRef.current.get(id);
          if (stale) URL.revokeObjectURL(stale);
          urlRef.current.delete(id);
          next.delete(id);
        }
      }
      return next;
    });

    // Muat lampiran yang belum punya preview.
    for (const attachment of attachments) {
      if (!urlRef.current.has(attachment.id)) void load(attachment);
    }

    return () => {
      cancelled = true;
    };
  }, [attachments]);

  // Revoke semua objectURL saat unmount terakhir.
  useEffect(
    () => () => {
      for (const url of urlRef.current.values()) URL.revokeObjectURL(url);
      urlRef.current.clear();
    },
    [],
  );

  return (
    <PhotoProvider>
      <ul className="flex flex-col gap-1">
        {attachments.map((attachment) => {
          const preview = previews.get(attachment.id);
          return (
            <li
              key={attachment.id}
              data-testid={`attachment-item-${attachment.id}`}
              className="flex items-center gap-3 text-sm"
            >
              {preview?.isImage ? (
                <PhotoView src={preview.objectUrl}>
                  <button
                    type="button"
                    data-testid={`attachment-preview-${attachment.id}`}
                    aria-label={`Pratinjau Lampiran #${attachment.id}`}
                    className="block cursor-zoom-in overflow-hidden rounded border bg-muted/40 transition-colors hover:border-ring"
                  >
                    <img
                      src={preview.objectUrl}
                      alt={`Lampiran #${attachment.id}`}
                      className="h-20 w-28 object-contain"
                      loading="lazy"
                    />
                  </button>
                </PhotoView>
              ) : preview && !preview.isImage ? (
                <span
                  data-testid={`attachment-file-${attachment.id}`}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  <FileIcon aria-hidden="true" className="size-4" />
                  <span>Berkas</span>
                </span>
              ) : (
                <span
                  data-testid={`attachment-loading-${attachment.id}`}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  <ImageOff aria-hidden="true" className="size-4" />
                  <span>Gagal memuat pratinjau</span>
                </span>
              )}
              <span>Lampiran #{attachment.id}</span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void onDownload?.(attachment)}
              >
                Unduh
              </Button>
              {onRemove ? (
                <Button
                  variant="ghost"
                  size="xs"
                  // Double-click must not fire two DELETEs: the second would
                  // 404 and paint a spurious error over a success.
                  disabled={removing}
                  onClick={() => void onRemove?.(attachment)}
                >
                  Hapus Lampiran #{attachment.id}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </PhotoProvider>
  );
}