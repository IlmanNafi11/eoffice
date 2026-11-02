/**
 * Adapter `DateInput` (Task 3, D3): state form seluruh halaman adalah `string`
 * `yyyy-MM-dd`/`""` — adapter ini mempertahankan kontrak itu. Calendar
 * (react-day-picker via base shadcn, tanpa primitif animate-ui setara)
 * dibungkus `Popover` animate; label trigger diformat date-fns locale id;
 * clear-able lewat tombol ikon di dalam trigger.
 */
import * as React from "react";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**_yyyy-MM-dd sesuai kontrak input native `type=date` yang digantikan. */
export type DateString = string;

function toDate(value: DateString): Date | undefined {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toDateString(date: Date): DateString {
  // Format manual (bukan toISOString) agar tidak tergeser timezone.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface DateInputProps
  extends Omit<React.ComponentProps<typeof Button>, "value" | "onChange"> {
  value: DateString;
  onChange: (value: DateString) => void;
  /** Tampilkan tombol hapus saat ada nilai (default true). */
  clearable?: boolean;
  /** Teks placeholder saat value kosong. */
  placeholder?: string;
}

function DateInput({
  value,
  onChange,
  clearable = true,
  placeholder = "Pilih tanggal",
  className,
  disabled,
  ...props
}: DateInputProps) {
  const [open, setOpen] = React.useState(false);
  const date = toDate(value);
  const label = date
    ? format(date, "d MMMM yyyy", { locale: id })
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-45 justify-between gap-1.5 font-normal",
            !date && "text-muted-foreground",
            className,
          )}
          {...props}
        >
          <span>{label}</span>
          {clearable && date && !disabled ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="hapus tanggal"
              title="Hapus tanggal"
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
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          onSelect={(selected) => {
            if (selected) {
              onChange(toDateString(selected));
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export { DateInput, toDateString, toDate };
export type { DateInputProps };