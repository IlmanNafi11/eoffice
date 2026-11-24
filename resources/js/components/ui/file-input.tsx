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
 *
 * `hideSelectionLabel` dipakai consumer yang merender daftar berkas sendiri:
 * tombol tetap menunjukkan aksi ("Tambah lampiran"), bukan nama berkas terakhir.
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
  /** Teks tombol saat belum ada file. */
  placeholder?: string;
  /**
   * Nama aksesibel untuk `<input type="file">` tersembunyi (sr-only). Default
   * memakai `placeholder`. Dipakai test & pembaca layar untuk menemukan input.
   */
  inputLabel?: string;
  /** Tampilkan tombol hapus saat ada file (default true). */
  clearable?: boolean;
  /**
   * Penempatan tombol hapus: `inline` (default) di samping tombol pilih;
   * `none` menyembunyikannya — consumer merender penghapusnya sendiri
   * (mis. tombol X di bar aksi grid) agar layout sempit tak meluber.
   */
  clearButton?: "inline" | "none";
  /**
   * Sembunyikan nama/jumlah file pada tombol — dipakai consumer multi-file
   * yang merender daftar berkasnya sendiri, agar tombol tetap mengundang
   * penambahan berkas berikutnya. Default false (nama tetap tampil).
   */
  hideSelectionLabel?: boolean;
}

function FileInput({
  file,
  onFileChange,
  multiple = false,
  onFilesChange,
  accept,
  placeholder = "Pilih file",
  inputLabel,
  clearable = true,
  clearButton = "inline",
  hideSelectionLabel = false,
  disabled,
  className,
  id,
  ...props
}: FileInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [selected, setSelected] = React.useState<File[]>([]);
  const shown = file !== undefined ? (file ? [file] : []) : selected;
  const label =
    hideSelectionLabel || shown.length === 0
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
        aria-label={inputLabel ?? placeholder}
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
          // `flex-1 min-w-0`, bukan `w-full`: tombol X adalah sibling di baris
          // yang sama, jadi `w-full` (100% parent) + X pasti meluber keluar
          // kartu saat nama file panjang di kolom sempit.
          "min-w-0 flex-1 justify-start gap-1.5 font-normal",
          shown.length === 0 && "text-muted-foreground",
        )}
        {...props}
      >
        <Paperclip className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </Button>
      {clearable && clearButton === "inline" && shown.length > 0 && !disabled ? (
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