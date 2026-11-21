/**
 * `activities-editor` — editor kegiatan harian (tambah/ubah/hapus/reorder).
 *
 * Controlled: `activities` + `onChange(next[])` — orang tua (halaman detail /
 * form create) yang mempersisten ke API; editor hanya menyusun baris. Aksi
 * tampil HANYA saat `canEdit` — helper `canEditReport(status)` di halaman
 * menghitung draft|rejected (spec §Code Style: aksi disembunyikan, bukan
 * disabled).
 *
 * Satu kegiatan = tiga jenis input: waktu pelaksanaan (awal + akhir),
 * deskripsi kegiatan, dan link bukti kerja (URL, ditampilkan clickable).
 * Formulir tampil sebagai SATU BARIS horizontal responsif
 * (Waktu awal | Waktu akhir | Kegiatan | Link | aksi) — wrap ke baris baru
 * saat sempit; tiap input berlabel terlihat (bukan hanya aria-label).
 */
import * as React from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeInput } from "@/components/ui/time-input";
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

interface ActivityDraft {
  activity: string;
  start_time: string;
  end_time: string;
  link: string;
}

const EMPTY_DRAFT: ActivityDraft = { activity: "", start_time: "", end_time: "", link: "" };

/** Tampilkan jam ramah user: terima `HH:mm` (kontrak) atau timestamp ISO
 *  warisan (respons lama), render `HH:mm`; teks lain dibiarkan apa adanya. */
export function formatDisplayTime(value: string): string {
  const m = /^(\d{2}:\d{2})/.exec(value);
  if (m) return m[1]!;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Hanya URL http(s) yang dirender sebagai tautan; teks lain dibiarkan polos. */
function isClickableLink(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function ActivitiesEditor({ activities, canEdit, onChange }: ActivitiesEditorProps) {
  const [editingId, setEditingId] = React.useState<number | "new" | null>(null);
  const [draft, setDraft] = React.useState<ActivityDraft>(EMPTY_DRAFT);

  const rows = sortForDisplay(activities);

  function submitNew() {
    if (!draft.activity.trim()) return;
    const link = draft.link.trim();
    onChange([
      ...rows,
      {
        activity: draft.activity.trim(),
        start_time: draft.start_time || null,
        end_time: draft.end_time || null,
        sort_order: rows.length + 1,
        links: link ? [{ url: link }] : [],
      },
    ]);
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  }

  function startEdit(row: WfhReportActivity) {
    setEditingId(row.id ?? null);
    setDraft({
      activity: row.activity,
      start_time: row.start_time ? formatDisplayTime(row.start_time) : "",
      end_time: row.end_time ? formatDisplayTime(row.end_time) : "",
      link: row.links?.[0]?.url ?? "",
    });
  }

  function submitEdit(target: WfhReportActivity) {
    if (!draft.activity.trim()) return;
    const link = draft.link.trim()
      ? { id: target.links?.[0]?.id ?? undefined, url: draft.link.trim() }
      : null;
    onChange(
      rows.map((r) =>
        r === target
          ? {
              ...r,
              activity: draft.activity.trim(),
              start_time: draft.start_time || null,
              end_time: draft.end_time || null,
              links: link
                ? [...(target.links ?? []).filter((_, i) => i > 0), link]
                : [],
            }
          : r,
      ),
    );
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  }

  function startNew() {
    setDraft(EMPTY_DRAFT);
    setEditingId("new");
  }

  function activityForm(
    onSubmit: (e: React.FormEvent) => void,
    submitLabel: string,
    onCancel?: () => void,
  ) {
    return (
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <Field orientation="vertical" className="w-44 min-w-40">
          <FieldLabel htmlFor="activity-start-time">Waktu awal</FieldLabel>
          <TimeInput
            id="activity-start-time"
            aria-label="Waktu pelaksanaan awal"
            value={draft.start_time}
            onChange={(value) => setDraft({ ...draft, start_time: value })}
            className="w-full"
          />
        </Field>
        <Field orientation="vertical" className="w-44 min-w-40">
          <FieldLabel htmlFor="activity-end-time">Waktu akhir</FieldLabel>
          <TimeInput
            id="activity-end-time"
            aria-label="Waktu pelaksanaan akhir"
            value={draft.end_time}
            onChange={(value) => setDraft({ ...draft, end_time: value })}
            className="w-full"
          />
        </Field>
        <Field orientation="vertical" className="min-w-64 flex-1">
          <FieldLabel htmlFor="activity-description">Kegiatan</FieldLabel>
          <Input
            id="activity-description"
            value={draft.activity}
            onChange={(e) => setDraft({ ...draft, activity: e.target.value })}
            autoFocus
          />
        </Field>
        <Field orientation="vertical" className="min-w-56 flex-[2]">
          <FieldLabel htmlFor="activity-link">Link</FieldLabel>
          <Input
            id="activity-link"
            type="url"
            placeholder="https://google.com"
            value={draft.link}
            onChange={(e) => setDraft({ ...draft, link: e.target.value })}
          />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            {submitLabel}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Batal
            </Button>
          ) : null}
        </div>
      </form>
    );
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
                activityForm(
                  (e) => {
                    e.preventDefault();
                    submitEdit(row);
                  },
                  "Simpan perubahan",
                )
              ) : (
                <>
                  <p className="text-sm font-medium">{row.activity}</p>
                  {row.start_time || row.end_time ? (
                    <p className="text-xs text-muted-foreground">
                      {formatDisplayTime(row.start_time ?? "—")} – {formatDisplayTime(row.end_time ?? "—")}
                    </p>
                  ) : null}
                  {row.links?.map((link, li) =>
                    isClickableLink(link.url) ? (
                      <a
                        key={link.id ?? `link-${li}`}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline"
                      >
                        {link.url}
                      </a>
                    ) : (
                      <p key={link.id ?? `link-${li}`} className="text-xs text-muted-foreground">
                        {link.url}
                      </p>
                    ),
                  )}
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
          <div className="rounded-lg border border-dashed p-3">
            {activityForm(
              (e) => {
                e.preventDefault();
                submitNew();
              },
              "Simpan",
              () => {
                setDraft(EMPTY_DRAFT);
                setEditingId(null);
              },
            )}
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={startNew}>
            <Plus aria-hidden="true" className="size-4" />
            Tambah kegiatan
          </Button>
        )
      ) : null}
    </div>
  );
}
