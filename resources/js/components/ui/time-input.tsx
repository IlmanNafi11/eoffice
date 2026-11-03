/**
 * Adapter `TimeInput` (pola D3 seperti `DateInput`/`MonthInput`): state form
 * seluruh halaman adalah `string` `HH:mm` 24-jam atau `""` — adapter ini
 * mempertahankan kontrak itu, menggantikan `<input type="time">` native.
 *
 * Komposisi: `Popover` animate + dua kolom jam (00..23) dan menit (langkah 5).
 * Label trigger menampilkan `HH:mm`; clear-able lewat tombol ikon di dalam
 * trigger (stopPropagation agar popover tidak menutup duluan).
 */
import * as React from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** `HH:mm` sesuai kontrak input native `type=time` yang digantikan. */
export type TimeString = string;

/** Parse `HH:mm` aman; mengembalikan null bila bukan jam valid 24-jam. */
export function parseTime(value: TimeString): { hour: number; minute: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function formatTime(value: TimeString): string {
  return parseTime(value) ? value : "";
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

interface TimeInputProps
  extends Omit<React.ComponentProps<typeof Button>, "value" | "onChange"> {
  value: TimeString;
  onChange: (value: TimeString) => void;
  /** Tampilkan tombol hapus saat ada nilai (default true). */
  clearable?: boolean;
  /** Teks placeholder saat value kosong. */
  placeholder?: string;
}

function TimeInput({
  value,
  onChange,
  clearable = true,
  placeholder = "Pilih jam",
  className,
  disabled,
  ...props
}: TimeInputProps) {
  const [open, setOpen] = React.useState(false);
  const parsed = parseTime(value);
  const label = parsed ? formatTime(value) : placeholder;

  // Jam yang baru dipilih (belum dikonfirmasi menit) — komponen mempertahankan
  // pilihan bertahap tanpa bergantung pada value prop (yang hanya berubah
  // setelah call-site menerima onChange).
  const [pendingHour, setPendingHour] = React.useState<number | null>(null);

  /** Pilih jam → ingat pilihan + preview; popover tetap terbuka. */
  const pickHour = (hour: number) => {
    setPendingHour(hour);
    onChange(`${String(hour).padStart(2, "0")}:${String(parsed?.minute ?? 0).padStart(2, "0")}`);
  };

  /** Pilih menit → lengkap memakai jam terpilih/tersimpan; popover ditutup. */
  const pickMinute = (minute: number) => {
    const hour = pendingHour ?? parsed?.hour ?? 0;
    onChange(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    setPendingHour(null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
              aria-label="hapus jam"
              title="Hapus jam"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
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
        <div className="flex gap-2">
          <div className="grid max-h-56 grid-cols-3 gap-1 overflow-auto" data-slot="time-input-hour">
            {HOURS.map((h) => {
              const hour = Number(h);
              const active = parsed?.hour === hour;
              return (
                <Button
                  key={h}
                  type="button"
                  variant={active ? "default" : "ghost"}
                  size="sm"
                  aria-label={`jam ${h}`}
                  onClick={() => pickHour(hour)}
                >
                  {h}
                </Button>
              );
            })}
          </div>
          <div className="grid max-h-56 grid-cols-2 gap-1 overflow-auto" data-slot="time-input-minute">
            {MINUTES.map((mn) => {
              const minute = Number(mn);
              const active = parsed?.minute === minute;
              return (
                <Button
                  key={mn}
                  type="button"
                  variant={active ? "default" : "ghost"}
                  size="sm"
                  aria-label={`menit ${mn}`}
                  onClick={() => pickMinute(minute)}
                >
                  {mn}
                </Button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { TimeInput, formatTime };
export type { TimeInputProps };