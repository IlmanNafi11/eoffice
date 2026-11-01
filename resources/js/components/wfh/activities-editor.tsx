/**
 * `activities-editor` — editor kegiatan harian (tambah/ubah/hapus/reorder).
 *
 * Controlled: `activities` + `onChange(next[])` — orang tua (halaman detail /
 * form create) yang mempersisten ke API; editor hanya menyusun baris. Aksi
 * tampil HANYA saat `canEdit` — helper `canEditReport(status)` di halaman
 * menghitung draft|rejected (spec §Code Style: aksi disembunyikan, bukan
 * disabled).
 */
import * as React from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WfhReportActivity } from "@/api/types";

/** Urut sesuai `sort_order` (undefined di belakang), tanpa memutasi input. */
export function sortForDisplay(activities: WfhReportActivity[]): WfhReportActivity[] {
  return [...activities].sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity));
}

interface ActivitiesEditorProps {
  activities: WfhReportActivity[];
  canEdit: boolean;
  onChange: (next: WfhReportActivity[]) => void;
}

export function ActivitiesEditor({ activities, canEdit, onChange }: ActivitiesEditorProps) {
  const [editingId, setEditingId] = React.useState<number | "new" | null>(null);
  const [draft, setDraft] = React.useState("");

  const rows = sortForDisplay(activities);

  function submitNew() {
    if (!draft.trim()) return;
    onChange([
      ...rows,
      { activity: draft.trim(), sort_order: rows.length + 1 },
    ]);
    setDraft("");
    setEditingId(null);
  }

  function startEdit(row: WfhReportActivity) {
    setEditingId(row.id ?? null);
    setDraft(row.activity);
  }

  function submitEdit(target: WfhReportActivity) {
    if (!draft.trim()) return;
    onChange(
      rows.map((r) => (r === target ? { ...r, activity: draft.trim() } : r)),
    );
    setDraft("");
    setEditingId(null);
  }

  function remove(target: WfhReportActivity) {
    onChange(rows.filter((r) => r !== target));
  }

  function move(target: WfhReportActivity, dir: -1 | 1) {
    const idx = rows.indexOf(target);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= rows.length) return;
    const next = [...rows];
    [next[idx], next[swapWith]] = [next[swapWith]!, next[idx]!];
    onChange(next.map((r, i) => ({ ...r, sort_order: i + 1 })));
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={row.id ?? `new-${i}`} className="flex items-start gap-3 rounded-lg border p-3">
            <div className="flex-1">
              {editingId !== null && row === rows[i] && editingId === row.id ? (
                <form onSubmit={(e) => { e.preventDefault(); submitEdit(row); }} className="flex flex-col gap-2">
                  <Input
                    aria-label="Deskripsi kegiatan"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <Button type="submit" size="sm">
                    Simpan perubahan
                  </Button>
                </form>
              ) : (
                <>
                  <p className="text-sm font-medium">{row.activity}</p>
                  {row.start_time || row.end_time ? (
                    <p className="text-xs text-muted-foreground">
                      {row.start_time ?? "—"} – {row.end_time ?? "—"}
                    </p>
                  ) : null}
                  {row.links?.map((link, li) => (
                    <p
                      key={link.id ?? `link-${li}`}
                      className="text-xs text-primary underline"
                    >
                      {link.url}
                    </p>
                  ))}
                </>
              )}
            </div>
            {canEdit ? (
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Naikkan" disabled={i === 0} onClick={() => move(row, -1)}>
                  <ArrowUp aria-hidden="true" className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Turunkan" disabled={i === rows.length - 1} onClick={() => move(row, 1)}>
                  <ArrowDown aria-hidden="true" className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Ubah kegiatan" onClick={() => startEdit(row)}>
                  <Pencil aria-hidden="true" className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Hapus kegiatan" onClick={() => remove(row)}>
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      {canEdit ? (
        editingId === "new" ? (
          <form onSubmit={(e) => { e.preventDefault(); submitNew(); }} className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
            <Input
              aria-label="Deskripsi kegiatan"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm">Simpan</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setDraft(""); setEditingId(null); }}>
                Batal
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" onClick={() => { setDraft(""); setEditingId("new"); }}>
            <Plus aria-hidden="true" className="size-4" />
            Tambah kegiatan
          </Button>
        )
      ) : null}
    </div>
  );
}