# Capability Map: WFH & Change Flow Closeout (eoffice)

> Phase 0, diajukan 2026-11-23 untuk persetujuan.
> Sumber intent: `docs/superpowers/specs/2026-11-23-wfh-change-flow-closeout-design.md` (approved 2026-11-23).
> Implementation plan: `docs/superpowers/plans/2026-11-23-wfh-change-flow-closeout.md` (tasks 1–6).
> Spec per modul di root repo dengan module id yang sama (`SPEC-<module-id>.md`).

| Module id | Responsibility | Depends on | Backend change |
|---|---|---|---|
| `wfh-no-revision` | WFH personal: hapus flow revisi — `rejected` terminal & immutable, jalur koreksi = laporan baru untuk tanggal sama, absensi laporan rejected dipindah ke laporan baru; partial unique index disempitkan ke `draft`; FE (detail page, slice, api) tidak lagi punya aksi revisi | — | Migration index + repository (`findDraftForUserDate`, `relinkRejectedAttendances`) + state machine/route/controller |
| `change-no-evaluator-input` | Paket perubahan: cabut input evaluator — kolom `evaluator_id`/`evaluator_signed_at` di-drop, aturan validasi same-field dihapus, PDF implementasi mencetak blok evaluator dari **inisiator** (nama, NIP, jabatan, bidang, tanda tangan); FE form tanpa picker, modul `api/users` dihapus, `Combobox` tetap | — | Migration drop kolom + rules/resource/PDF data/export guard |
| `contract-closeout` | Menutup kontrak & dokumen setelah dua modul: `openapi.yaml` tanpa op revise dan tanpa field evaluator, `SPEC-wfh-reports.md`/`SPEC-change-package.md` diperbarui, CHANGELOG; verifikasi suite penuh dan verifikasi laporan tim (tanpa perubahan kode) | `wfh-no-revision`, `change-no-evaluator-input` | Tidak ada |

**Build order:**

```
wfh-no-revision ─────┐
                     ├──→ contract-closeout
change-no-evaluator-input ──┘
```

Alasan: dua modul pertama menyentuh domain berbeda (Wfh vs ChangeManagement) tanpa file bersama, sehingga bisa dikerjakan berurutan apa pun; keduanya harus mendarat sebelum kontrak ditutup, karena `openapi.yaml` dan SPEC modul mendeskripsikan perilaku yang baru ada setelah kode berubah. `contract-closeout` bergantung pada keduanya dan tidak boleh menebak perilaku.

**Laporan tim (admin) — tidak ada modul:** flow `create → pending → approve/reject` tanpa revisi sudah sesuai aturan; tidak ada perubahan kode. Verifikasinya (suite `TeamReportTest` + tidak adanya tombol revisi) masuk acceptance criteria `contract-closeout` sebagai bukti, bukan modul.

**Non-goal lintas modul:**
- Mengubah approver atau matriks permission (`RolePermissionSeeder`, route middleware) — approver tetap kepala bidang (WFH) dan kepala tim (paket perubahan).
- Self-approval WFH personal oleh kepala bidang (keputusan Issue F) tetap dipertahankan.
- Menghapus endpoint backend `GET /users` (`listUsersForPicker`) — kontrak publik issue #1; hanya konsumen FE-nya yang dicabut.
- Restyle form paket perubahan di luar penghapusan blok picker.
- Seluruh temuan issue lain di luar tiga alur ini (daftarnya belum tersedia di repo).

**Keputusan yang mengikat (dari design doc §"Keputusan builder" #1–#10):** rejected WFH immutable termasuk hapus; pesan error "Hanya laporan draft yang dapat diubah/dihapus."; absensi **dipindah** bukan diduplikasi; kolom evaluator di-drop bukan diisi ulang; `evaluator_signed_at` tidak digantikan stempel apa pun; tidak ada UI "buat laporan" per baris (tombol global + dialog tanggal sudah menutup jalur); `Combobox` tetap sebagai primitive generik.
