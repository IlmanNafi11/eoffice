/**
 * `Combobox` (Task 5, D5): Popover animate + Command (cmdk) — generik,
 * single-select, searchable, nullable. Consumer tunggal awal: picker
 * evaluator (daftar user satu bidang bisa panjang; cari by nama/NIP).
 *
 * Kontrak: `value: string | null` (nullable), `onValueChange(value | null)`.
 * Trigger = Button ber-label menampilkan label item terpilih/placeholder;
 * daftar opsi hidup di dalam popover (portal).
 */
import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  value: string;
  label: string;
  /** Teks kecil pelengkap di baris item (mis. NIP). */
  hint?: string;
}

interface ComboboxProps
  extends Omit<React.ComponentProps<typeof Button>, "value" | "onChange"> {
  items: ComboboxItem[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  /** Placeholder kolom pencarian. */
  searchPlaceholder?: string;
  /** Pesan saat filter tanpa hasil. */
  emptyMessage?: string;
  /** Tampilkan tombol reset saat ada nilai (default true). */
  clearable?: boolean;
}

function Combobox({
  items,
  value,
  onValueChange,
  placeholder = "Pilih…",
  searchPlaceholder = "Cari…",
  emptyMessage = "Tidak ada hasil",
  clearable = true,
  disabled,
  className,
  ...props
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = items.find((item) => item.value === value) ?? null;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between gap-1.5 font-normal",
              !selected && "text-muted-foreground",
            )}
            {...props}
          >
            <span className="truncate">
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={`${item.label} ${item.hint ?? ""}`}
                    onSelect={() => {
                      onValueChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        item.value === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {item.hint ? (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {item.hint}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {clearable && selected && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="hapus pilihan"
          title="Hapus pilihan"
          disabled={disabled}
          onClick={() => onValueChange(null)}
          className="shrink-0 text-muted-foreground"
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

export { Combobox };
export type { ComboboxProps };