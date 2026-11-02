/**
 * `FileInput` (Task 4, D4): Button animate + input file visually-hidden +
 * nama file. Kontrak `onFileChange(File | null)`. Call-site hanya ganti
 * elemen: konten preview/upload tetap milik consumer (kontrol ini tidak
 * mengintervensi isi file — hanya memilih, menampilkan nama, dan menyediakan
 * aksi hapus).
 *
 * Display mengikuti dua mode: uncontrolled (komponen simpan File terpilih
 * sendiri) atau controlled lewat prop `file` (parent mengendalikan tampilan).
 * Input me-reset `value`-nya tiap change supaya memilih file yang sama
 * berulang kali tetap memicu `onFileChange`.
 */
import * as React from "react";
import { Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileInputProps
  extends Omit<React.ComponentProps<typeof Button>, "onChange" | "value"> {
  /** File terpilih (controlled); abaikan untuk mode uncontrolled. */
  file?: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
  placeholder?: string;
  /** Tampilkan tombol hapus saat ada file (default true). */
  clearable?: boolean;
}

function FileInput({
  file,
  onFileChange,
  accept,
  placeholder = "Pilih file",
  clearable = true,
  disabled,
  className,
  id,
  ...props
}: FileInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [selected, setSelected] = React.useState<File | null>(null);
  const shown = file !== undefined ? (file ?? null) : selected;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] ?? null;
    setSelected(next);
    onFileChange(next);
    // Reset agar file sama bisa dipilih ulang.
    e.target.value = "";
  };

  const handleClear = () => {
    setSelected(null);
    onFileChange(null);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "w-full justify-start gap-1.5 font-normal",
          !shown && "text-muted-foreground",
        )}
        {...props}
      >
        <Paperclip className="size-4 shrink-0" />
        <span className="truncate">{shown ? shown.name : placeholder}</span>
      </Button>
      {clearable && shown && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="hapus file"
          title="Hapus file"
          onClick={handleClear}
          className="shrink-0 text-muted-foreground"
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

export { FileInput };
export type { FileInputProps };