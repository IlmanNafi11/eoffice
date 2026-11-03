/**
 * Tombol hapus kecil (ikon X) di sisi kanan trigger adapter form
 * (DateInput/MonthInput/TimeInput). Pattern sibling — BUKAN kontrol nested di
 * dalam <Button> trigger (ARIA-in-ARIA, ship review #12) — setara dengan
 * clear button Combobox/FileInput.
 */
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ClearButtonProps {
  /** Fitur clear diaktifkan pada pemakaian komponen (default true). */
  clearable: boolean;
  /** Ada nilai yang bisa dihapus. */
  visible: boolean;
  disabled?: boolean;
  /** Label aksesibilitas, mis. "hapus tanggal". */
  label: string;
  /** Tooltip, mis. "Hapus tanggal". */
  title: string;
  onClear: () => void;
}

function ClearButton({
  clearable,
  visible,
  disabled,
  label,
  title,
  onClear,
}: ClearButtonProps) {
  if (!clearable || !visible || disabled) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClear}
      className="shrink-0 text-muted-foreground"
    >
      <X className="size-3.5" />
    </Button>
  );
}

export { ClearButton };
export type { ClearButtonProps };
