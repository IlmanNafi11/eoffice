/**
 * `pagination` — kontrol halaman generic (current/last/total), bebas domain.
 * Menerima `PaginationMeta` (dari `Unwrapped.meta` list), tidak menanamkan
 * query WFH; halaman berikutnya didorong lewat `onPageChange`.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PaginationMeta } from "@/api/types";

export function Pagination({
  meta,
  onPageChange,
}: {
  meta: PaginationMeta | null;
  onPageChange: (page: number) => void;
}) {
  if (!meta) return null;

  const { current_page: current, last_page: last, total } = meta;
  const hasPrev = current > 1;
  const hasNext = current < last;

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Halaman {current} dari {last} · {total} data
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(current - 1)}
          disabled={!hasPrev}
          aria-label="Sebelumnya"
          className="inline-flex size-7 items-center justify-center rounded-lg border border-input text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(current + 1)}
          disabled={!hasNext}
          aria-label="Berikutnya"
          className="inline-flex size-7 items-center justify-center rounded-lg border border-input text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}