/**
 * Adapter `MonthInput` (Task 11, pola D3 seperti `DateInput`): state form
 * seluruh halaman adalah `string` `yyyy-MM` atau `""` — adapter ini
 * mempertahankan kontrak itu. menggantikan `<input type="month">` native.
 *
 * Komposisi: `Popover` animate + grid 12 bulan + navigasi tahun (tanpa
 * primitif animate-ui setara, sama seperti Calendar). Label trigger
 * terformat locale id ("September 2026"); clear-able lewat tombol ikon di
 * dalam trigger (stopPropagation agar popover tidak menutup duluan).
 */
import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**_yyyy-MM sesuai kontrak input native `type=month` yang digantikan. */
export type MonthString = string;

const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/**_Parse `yyyy-MM` aman (tanpa Date.UTC — hindari geser timezone). */
function parseMonth(value: MonthString): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1..12
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function formatMonth(value: MonthString): string {
  const parsed = parseMonth(value);
  if (!parsed) return "";
  return `${MONTH_NAMES_ID[parsed.month - 1]} ${parsed.year}`;
}

interface MonthInputProps
  extends Omit<React.ComponentProps<typeof Button>, "value" | "onChange"> {
  value: MonthString;
  onChange: (value: MonthString) => void;
  /** Tampilkan tombol hapus saat ada nilai (default true). */
  clearable?: boolean;
  /** Teks placeholder saat value kosong. */
  placeholder?: string;
}

function MonthInput({
  value,
  onChange,
  clearable = true,
  placeholder = "Pilih bulan",
  className,
  disabled,
  ...props
}: MonthInputProps) {
  const [open, setOpen] = React.useState(false);
  const parsed = parseMonth(value);
  const [navYear, setNavYear] = React.useState<number | null>(null);
  const shownYear = navYear ?? parsed?.year ?? new Date().getFullYear();
  const label = parsed ? formatMonth(value) : placeholder;

  const pick = (month1to12: number) => {
    onChange(`${shownYear}-${String(month1to12).padStart(2, "0")}`);
    setNavYear(null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setNavYear(null); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-45 justify-between gap-1.5 font-normal",
            !parsed && "text-muted-foreground",
            className,
          )}
          {...props}
        >
          <span>{label}</span>
          {clearable && parsed && !disabled ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="hapus bulan"
              title="Hapus bulan"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                setNavYear(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                  setNavYear(null);
                }
              }}
              className="rounded-sm p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="size-3.5 pointer-events-none" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="tahun sebelumnya"
            onClick={() => setNavYear(shownYear - 1)}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <span className="text-sm font-medium">{shownYear}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="tahun berikutnya"
            onClick={() => setNavYear(shownYear + 1)}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1" data-slot="month-input-grid">
          {MONTH_NAMES_ID.map((name, i) => {
            const active = parsed && parsed.year === shownYear && parsed.month === i + 1;
            return (
              <Button
                key={name}
                type="button"
                variant={active ? "default" : "ghost"}
                size="sm"
                onClick={() => pick(i + 1)}
              >
                {name}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { MonthInput, formatMonth, parseMonth };
export type { MonthInputProps };