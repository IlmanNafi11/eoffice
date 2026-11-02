/**
 * `FileInput` (Task 4, D4): Button animate + input file visually-hidden +
 * nama file. Kontrak `onFileChange(File | null)`; mode `multiple` memakai
 * `onFilesChange(File[])`. Call-site hanya ganti elemen: konten preview/upload
 * tetap milik consumer (kontrol ini tidak mengintervensi isi file — hanya
 * memilih, menampilkan nama, dan menyediakan aksi hapus).
 *
 * Display mengikuti dua mode: uncontrolled (komponen simpan File terpilih
 * sendiri) atau controlled lewat prop `file` (parent mengendalikan tampilan).
 * Input me-reset `value`-nya tiap change supaya memilih file yang sama
 * berulang kali tetap memicu callback.
 */
import * as React from "react";
import { Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileInputProps
  extends Omit<React.ComponentProps<typeof Button>, "onChange" | "value"> {
  /** File terpilih (controlled); abaikan untuk mode uncontrolled. */
  file?: File | null;
  /** Callback single-file (mode default). */
  onFileChange: (file: File | null) => void;
  /** Mode multi-file: pilih beberapa file sekaligus. */
  multiple?: boolean;
  /**
   * Callback multi-file — dipakai bila `multiple`. Dipanggil dengan daftar
   * kosong saat file dihapus, dan tidak dipanggil saat user membatalkan
   * dialog pemilihan file.
   */
  onFilesChange?: (files: File[]) => void;
  accept?: string;
  placeholder?: string;
  /** Tampilkan tombol hapus saat ada file (default true). */
  clearable?: boolean;
}

function FileInput({
  file,
  onFileChange,
  multiple = false,
  onFilesChange,
  accept,
  placeholder = "Pilih file",
  clearable = true,
  disabled,
  className,
  id,
  ...props
}: FileInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [selected, setSelected] = React.useState<File[]>([]);
  const shown = file !== undefined ? (file ? [file] : []) : selected;
  const label =
    shown.length === 0
      ? placeholder
      : shown.length === 1
        ? shown[0]!.name
        : `${shown.length} file dipilih`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Reset agar file sama bisa dipilih ulang.
    e.target.value = "";
    if (multiple) {
      setSelected(files);
      if (files.length > 0) onFilesChange?.(files);
      return;
    }
    const next = files[0] ?? null;
    setSelected(next === null ? [] : [next]);
    onFileChange(next);
  };

  const handleClear = () => {
    setSelected([]);
    if (multiple) onFilesChange?.([]);
    else onFileChange(null);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
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
          shown.length === 0 && "text-muted-foreground",
        )}
        {...props}
      >
        <Paperclip className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </Button>
      {clearable && shown.length > 0 && !disabled ? (
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