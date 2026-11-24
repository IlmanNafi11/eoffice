/**
 * Unit test ChangePackageFormPage (modul change-package — Phase 3 Task 5).
 * Kontrak yang dijaga (plan Task 5 + spec):
 * - create `/changes/new` → "Simpan Draft" POST `PackageDraftInput`
 *   (implementation opsional — diisi semua prop nullable, `cost_amount` tidak
 *   dikirim bila `cost_needed` false); submit → create draft dulu lalu POST
 *   `PackageSubmitInput` lengkap ke `/submit` (server persist + transisi);
 * - edit `/changes/:packageId/edit` → prefill dari `showPackage` (relasi
 *   `change_types` di-load), "Simpan Draft" PUT, "Submit" POST full-payload;
 * - validasi klien Submit: deskripsi/alasan/`needed_by_date` + 7 field
 *   implementation wajib + urutan tanggal (`release_date ≥ execution_date`) +
 *   `cost_amount` bila `cost_needed`; draft hanya memvalidasi deskripsi+alasan;
 * - `field_id` terkunci dari `user.team.field.id` (create) / data (edit) —
 *   read-only, tanpa select bidang;
 * - TANPA picker evaluator: evaluator otomatis inisiator (backend); payload
 *   draft & submit TIDAK membawa `evaluator_id`;
 * - pesan server 422 (amenang `current.error`) tampil dengan role alert dan
 *   tak lenyap selama form tetap termuat;
 * - tombol digate: create = `change.initiation.create` + tim/bidang terisi;
 *   edit = status `draft` + inisiator + permission update/submit (user
 *   sintetik, bukan role).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent, pickDate, pickSelect } from "@/test/portal";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ChangePackage, ChangeType } from "@/api/types";

vi.mock("@/api/change-package", () => ({
  listPackages: vi.fn(),
  showPackage: vi.fn(),
  createPackage: vi.fn(),
  updatePackage: vi.fn(),
  deletePackage: vi.fn(),
  submitPackage: vi.fn(),
  approvePackage: vi.fn(),
  rejectPackage: vi.fn(),
  uploadPackageAttachments: vi.fn(),
  deletePackageAttachment: vi.fn(),
  exportImplementationPdf: vi.fn(),
  listChangeTypes: vi.fn(),
}));


import { ApiError } from "@/api/client";
import * as changePackageApi from "@/api/change-package";
import { Toaster } from "@/components/ui/sonner";
import { ChangePackageFormPage } from "@/pages/changes/ChangePackageFormPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedShow = changePackageApi.showPackage as unknown as Mock;
const mockedCreate = changePackageApi.createPackage as unknown as Mock;
const mockedUpdate = changePackageApi.updatePackage as unknown as Mock;
const mockedSubmit = changePackageApi.submitPackage as unknown as Mock;
const mockedChangeTypes = changePackageApi.listChangeTypes as unknown as Mock;
const mockedUpload = changePackageApi.uploadPackageAttachments as unknown as Mock;
const mockedDeleteAttachment = changePackageApi.deletePackageAttachment as unknown as Mock;
const changeTypes: ChangeType[] = [
  { id: 1, name: "Hardware" },
  { id: 2, name: "Network" },
];

/** Staf pembuat paket: create/update/submit + tim dengan bidang. */
const staf = {
  id: 8,
  name: "Budi Santoso",
  nip: "199001012023011001",
  email: "budi@kominfo.go.id",
  phone: "081234567890",
  position: "Staf Pelaksana",
  rank: "Pengatur Muda",
  signature_url: null,
  must_change_password: false,
  is_active: true,
  roles: ["staf"],
  permissions: [
    "change.initiation.view",
    "change.initiation.create",
    "change.initiation.update",
    "change.initiation.submit",
    "change.implementation.update",
  ],
  team: { id: 5, name: "Tim Aplikasi", field: { id: 3, name: "Bidang Aplikasi" } },
};

/** Paket draft milik staf (id 8) — bentuk respons show (relasi di-load). */
const editPkg: ChangePackage = {
  initiation: {
    id: 12,
    field_id: 3,
    initiator_id: 8,
    doc_number: "001/9/1.1/114/2025",
    needed_by_date: "2025-12-31",
    description: "Migrasi server aplikasi e-Office ke cloud Kominfo",
    reason: "Server on-premise sudah tidak memadai.",
    status: "draft",
    field: { id: 3, name: "Bidang Aplikasi" },
    initiator: { id: 8, name: "Budi Santoso", nip: "199001012023011001" },
  },
  implementation: {
    id: 9,
    change_initiation_id: 12,
    priority: "normal",
    impact: "Minor",
    execution_date: "2025-12-01",
    test_plan: "Uji migrasi di staging",
    release_date: "2025-12-15",
    implementation_result: "Migrasi selesai",
    production_impact: "Downtime 1 jam",
    required_effort: "3 orang-hari",
    resources: "2 teknisi",
    cost_needed: true,
    cost_amount: "15000000.00",
    status: "draft",
    change_types: [{ id: 2, name: "Network" }],
  },
};

/** Varian editPkg dengan satu lampiran implementasi tersimpan. */
const editPkgWithAttachment: ChangePackage = {
  initiation: editPkg.initiation,
  implementation: {
    ...editPkg.implementation!,
    attachments: [{ id: 21, url: "/changes/12/attachments/21", sort_order: 1 }],
  },
};

const submittedPkg: ChangePackage = {
  initiation: { ...editPkg.initiation, status: "pending" },
  implementation: { ...editPkg.implementation!, status: "submitted" },
};
/** Render form pada route create atau edit, dengan user khusus (default staf). */
function renderForm(route: string, overrides?: Partial<typeof staf>) {
  const store = makeStore();
  store.dispatch(setUser({ ...staf, ...overrides }));

  render(
    <Provider store={store}>
      {/* Toaster asli: toast dirender ke document.body (portal sonner). */}
      <Toaster position="top-right" richColors />
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/changes/new" element={<ChangePackageFormPage />} />
          <Route path="/changes/:packageId/edit" element={<ChangePackageFormPage />} />
          <Route path="/changes/:packageId" element={<div>changes-detail-stub</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

/** Isi seluruh field wajib submit + opsional biaya. */
async function fillForSubmit(opts?: { withCost?: boolean }) {
  await userEvent.type(screen.getByLabelText("Deskripsi"), "Migrasi server");
  await userEvent.type(screen.getByLabelText("Alasan"), "Server tua");
  await pickDate(screen.getByLabelText("Tanggal dibutuhkan"), "2025-12-31");
  await pickSelect("Prioritas", "Normal");
  await pickSelect("Dampak", "Minor");
  await userEvent.click(screen.getByRole("checkbox", { name: "Network" }));
  await userEvent.type(screen.getByLabelText("Rencana pengujian"), "Uji migrasi di staging");
  await pickDate(screen.getByLabelText("Tanggal eksekusi"), "2025-12-01");
  await pickDate(screen.getByLabelText("Tanggal rilis"), "2025-12-15");
  await userEvent.type(screen.getByLabelText("Tanggapan Perubahan"), "Migrasi selesai");
  await userEvent.type(screen.getByLabelText("Dampak produksi"), "Downtime 1 jam");
  await userEvent.type(screen.getByLabelText("Upaya/Tindakan"), "3 orang-hari");
  await userEvent.type(screen.getByLabelText("Sumber daya"), "2 teknisi");
  if (opts?.withCost !== false) {
    await userEvent.click(screen.getByLabelText("Perlu biaya?"));
    await userEvent.type(screen.getByLabelText("Jumlah biaya"), "15000000.00");
  }
}

/** Isi hanya bagian inisiasi (untuk uji draft & validasi submit parsial). */
async function fillInitiation(overrides?: {
  neededBy?: boolean;
  description?: string;
  reason?: string;
}) {
  await userEvent.type(
    screen.getByLabelText("Deskripsi"),
    overrides?.description ?? "Migrasi server",
  );
  await userEvent.type(screen.getByLabelText("Alasan"), overrides?.reason ?? "Server tua");
  if (overrides?.neededBy !== false) {
    await pickDate(screen.getByLabelText("Tanggal dibutuhkan"), "2025-12-31");
  }
}

const draftImplementation = {
  priority: null,
  impact: null,
  change_type_ids: null,
  test_plan: null,
  execution_date: null,
  release_date: null,
  implementation_result: null,
  production_impact: null,
  required_effort: null,
  resources: null,
  cost_needed: false,
  // `cost_amount` sengaja TIDAK dikirim bila cost_needed false.
};

const fullSubmitInput = {
  initiation: {
    field_id: 3,
    needed_by_date: "2025-12-31",
    description: "Migrasi server",
    reason: "Server tua",
  },
  implementation: {
    priority: "normal",
    impact: "Minor",
    change_type_ids: [2],
    test_plan: "Uji migrasi di staging",
    execution_date: "2025-12-01",
    release_date: "2025-12-15",
    implementation_result: "Migrasi selesai",
    production_impact: "Downtime 1 jam",
    required_effort: "3 orang-hari",
    resources: "2 teknisi",
    cost_needed: true,
    cost_amount: "15000000.00",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedChangeTypes.mockResolvedValue(changeTypes);
  mockedShow.mockResolvedValue(editPkg);
  mockedCreate.mockResolvedValue(editPkg);
  mockedUpdate.mockResolvedValue(editPkg);
  mockedSubmit.mockResolvedValue(submittedPkg);
  mockedDeleteAttachment.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(
    () => `blob:stub-${Math.random().toString(36).slice(2)}`,
  );
  URL.revokeObjectURL = vi.fn();
});

describe("ChangePackageFormPage — create mode (/changes/new)", () => {
  it("render bidang read-only, checkbox change types, TANPA picker evaluator", async () => {
    renderForm("/changes/new");

    // Bidang read-only dari user.team.field — teks tampil, tidak ada select.
    expect(await screen.findByText("Bidang Aplikasi")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: /bidang/i })).toBeNull();

    // Change types dari cache `/change-types` → checkbox.
    expect(await screen.findByRole("checkbox", { name: "Hardware" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Network" })).toBeTruthy();

    // Evaluator otomatis inisiator: tidak ada field evaluator di form.
    expect(screen.queryByLabelText(/evaluator/i)).toBeNull();
  });

  it("kartu Lampiran tersedia sejak awal: FileInput dirender, upload tertunda saat create", async () => {
    renderForm("/changes/new");

    // Input unggah tersedia SEBELUM draft ada (regresi: dulu baru muncul
    // setelah status draf).
    const input = await screen.findByLabelText(/unggah lampiran/i);
    expect(input).toBeTruthy();

    // Mode create: file dipilih → masuk antrean, BELUM ada panggilan upload.
    const file = new File(["png-bytes"], "hasil-uji.png", { type: "image/png" });
    await userEvent.upload(input as HTMLInputElement, file);
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(await screen.findByText(/1 berkas menunggu/i)).toBeTruthy();
  });

  it("Simpan Draft di create: antrean lampiran terunggah ke paket baru sebelum navigasi", async () => {
    renderForm("/changes/new");
    await fillInitiation();

    const file = new File(["png-bytes"], "hasil-uji.png", { type: "image/png" });
    await userEvent.upload(
      screen.getByLabelText(/unggah lampiran/i) as HTMLInputElement,
      file,
    );
    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));

    // Draft id 12 (mockedCreate) → upload ke 12, lalu show untuk daftar baru.
    await waitFor(() => {
      expect(mockedUpload).toHaveBeenCalledWith(12, [file]);
    });
    await waitFor(() => {
      expect(mockedShow).toHaveBeenCalledWith(12);
    });
  });

  /** ship#18: "Simpan Draft" + antrean gagal-unggah → draft TETAP tersimpan
   * (tanpa navigasi) dan pesan upload tampil di kartu Lampiran. Jalur Submit
   * sudah dikunci test di atas; tanpa test ini menghapus `return` di
   * handleSaveDraft membuat berkas antrean hilang diam-diam saat navigasi. */
  it("Simpan Draft di create: upload antrean gagal → draft tersimpan, TIDAK navigasi, pesan tampil", async () => {
    renderForm("/changes/new");
    await fillInitiation();

    const file = new File(["png-bytes"], "hasil-uji.png", { type: "image/png" });
    await userEvent.upload(
      screen.getByLabelText(/unggah lampiran/i) as HTMLInputElement,
      file,
    );
    mockedUpload.mockRejectedValueOnce(
      new ApiError("http", "Maksimal 10 lampiran.", { status: 422 }),
    );

    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));

    await waitFor(() => {
      expect(mockedUpload).toHaveBeenCalledWith(12, [file]);
    });
    // Draft tercipta (server), tapi form tetap terpasang: berkas antrean
    // masih dipegang state, jadi user bisa submit ulang.
    expect(mockedCreate).toHaveBeenCalled();
    expect(screen.queryByText("changes-detail-stub")).toBeNull();
    expect(
      (await screen.findAllByText("Maksimal 10 lampiran.")).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByText(/1 berkas menunggu/i)).toBeTruthy();
  });

  /** ship#18: retry setelah flush gagal TIDAK membuat draft kedua — paket
   * pertama dipakai ulang (createdIdRef), antrean menempel ke situ. */
  it("retry Simpan Draft setelah flush gagal → paket SAMA, create TIDAK dipanggil dua kali", async () => {
    renderForm("/changes/new");
    await fillInitiation();

    const file = new File(["png-bytes"], "hasil-uji.png", { type: "image/png" });
    await userEvent.upload(
      screen.getByLabelText(/unggah lampiran/i) as HTMLInputElement,
      file,
    );
    mockedUpload.mockRejectedValueOnce(
      new ApiError("http", "Maksimal 10 lampiran.", { status: 422 }),
    );

    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));
    await waitFor(() => {
      expect(mockedUpload).toHaveBeenCalledTimes(1);
    });

    // Retry: unggah berhasil kali ini.
    mockedUpload.mockResolvedValueOnce({ files: [], message: "" });
    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));

    await waitFor(() => {
      expect(mockedUpload).toHaveBeenCalledTimes(2);
    });
    // Draft id 12 dipakai ulang untuk batch kedua — bukan paket baru.
    expect(mockedUpload).toHaveBeenLastCalledWith(12, [file]);
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("changes-detail-stub")).toBeTruthy();
  });

  /** ship#18: pilih berkas saat Simpan Draft in-flight di edit mode →
   * diabaikan (shared-flag race: POST yang mendarat di tengah mutasi). */
  it("pilih berkas saat Simpan Draft in-flight (edit) → TIDAK ada panggilan upload", async () => {
    mockedShow.mockResolvedValue(editPkg);
    let resolveUpdate: (v?: unknown) => void = () => {};
    mockedUpdate.mockImplementation(
      () => new Promise((res) => { resolveUpdate = res as (v?: unknown) => void; }),
    );
    renderForm("/changes/12/edit");

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Deskripsi") as HTMLInputElement).value,
      ).toBe("Migrasi server aplikasi e-Office ke cloud Kominfo");
    });
    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));
    const input = screen.getByLabelText(/unggah lampiran/i) as HTMLInputElement;
    expect(input.disabled).toBe(true);

    const file = new File(["png-bytes"], "bukti.png", { type: "image/png" });
    await userEvent.upload(input, file);
    expect(mockedUpload).not.toHaveBeenCalled();

    resolveUpdate(editPkg);
    expect(await screen.findByText("changes-detail-stub")).toBeTruthy();
  });

  it("Simpan Draft di create TANPA lampiran tertunda: tidak ada panggilan upload", async () => {
    renderForm("/changes/new");
    await fillInitiation();

    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalled();
    });
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it("file > 10MB ditolak pre-check di form (0 panggilan upload)", async () => {
    renderForm("/changes/new");

    const big = new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], "gede.png", {
      type: "image/png",
    });
    await userEvent.upload(
      screen.getByLabelText(/unggah lampiran/i) as HTMLInputElement,
      big,
    );

    expect(mockedUpload).not.toHaveBeenCalled();
    expect(await screen.findByText(/maksimal 10MB/i)).toBeTruthy();
  });

  it("batas 10 lampiran berlaku lintas batch pilihan, bukan per batch", async () => {
    renderForm("/changes/new");

    const input = screen.getByLabelText(/unggah lampiran/i) as HTMLInputElement;
    const batch = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) =>
        new File(["png-bytes"], `${prefix}-${i}.png`, { type: "image/png" }),
      );

    await userEvent.upload(input, batch("a", 8));
    expect(await screen.findByText(/8 berkas menunggu/i)).toBeTruthy();

    // Batch kedua lolos batas per-batch (3 < 10) tetapi melampaui TOTAL.
    await userEvent.upload(input, batch("b", 3));

    expect(await screen.findByText(/maksimal 10 lampiran/i)).toBeTruthy();
    expect(screen.getByText(/8 berkas menunggu/i)).toBeTruthy();
  });

  it("dua berkas terpilih → dua thumbnail SEBELUM draft disimpan; hapus satu → tinggal satu", async () => {
    renderForm("/changes/new");

    const first = new File(["png-bytes"], "bukti-a.png", { type: "image/png" });
    const second = new File(["png-bytes"], "bukti-b.png", { type: "image/png" });
    await userEvent.upload(
      screen.getByLabelText(/unggah lampiran/i) as HTMLInputElement,
      [first, second],
    );

    // Pratinjau lokal (objectURL) tersedia tanpa menunggu draft tersimpan.
    expect(await screen.findByAltText("bukti-a.png")).toBeTruthy();
    expect(screen.getByAltText("bukti-b.png")).toBeTruthy();
    expect(screen.getByText("2 berkas menunggu — terunggah otomatis setelah draft disimpan.")).toBeTruthy();
    expect(mockedUpload).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Hapus bukti-a.png" }));

    expect(screen.queryByAltText("bukti-a.png")).toBeNull();
    expect(screen.getByAltText("bukti-b.png")).toBeTruthy();
    expect(screen.getByText(/1 berkas menunggu/i)).toBeTruthy();
  });


  it('"Simpan Draft" → POST draft payload nested persis skema, lalu navigasi detail', async () => {
    renderForm("/changes/new");
    await fillInitiation();

    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({
        initiation: {
          field_id: 3,
          needed_by_date: "2025-12-31",
          description: "Migrasi server",
          reason: "Server tua",
        },
        implementation: draftImplementation,
      });
    });
    expect(await screen.findByText("changes-detail-stub")).toBeTruthy();
  });

  it("field Tanggal dibutuhkan full-width, bukan anak grid 2 kolom", async () => {
    renderForm("/changes/new");

    const dateField = screen.getByLabelText("Tanggal dibutuhkan");

    expect(dateField.closest('[class*="grid-cols-2"]')).toBeNull();
  });

  it('label "Tanggapan Perubahan" tetap mengirim field implementation_result', async () => {
    renderForm("/changes/new");
    await fillInitiation();
    await pickDate(screen.getByLabelText("Tanggal rilis"), "2025-12-15");
    await userEvent.type(
      screen.getByLabelText("Tanggapan Perubahan"),
      "Migrasi selesai",
    );

    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          implementation: expect.objectContaining({
            implementation_result: "Migrasi selesai",
          }),
        }),
      );
    });
  });


  it("M2 regresi: prioritas/dampak draft bisa dikosongkan kembali lewat opsi —", async () => {
    renderForm("/changes/new");
    await fillInitiation();

    // Pilih, lalu reset ke opsi "—" → draft payload kembali null (bukan basi).
    await pickSelect("Prioritas", "Normal");
    await pickSelect("Dampak", "Minor");
    await pickSelect("Prioritas", "—");
    await pickSelect("Dampak", "—");

    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({
        initiation: expect.objectContaining({ description: "Migrasi server" }),
        implementation: draftImplementation,
      });
    });
  });

  it("draft tanpa deskripsi → validasi klien, createPackage TIDAK dipanggil", async () => {
    renderForm("/changes/new");
    await userEvent.type(screen.getByLabelText("Alasan"), "Server tua");

    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));

    expect(screen.getByTestId("change-package-form-validation")).toBeTruthy();
    expect(mockedCreate).not.toHaveBeenCalled();
  });
  it("pemegang submit TANPA tim/bidang (admin) → tanpa tombol Submit (REQuery #2, ship#7)", async () => {
    renderForm("/changes/new", {
      roles: ["admin"],
      permissions: ["change.initiation.view", "change.initiation.submit"],
      team: undefined,
    });

    // Tombol Submit pasti 422 (field_id kosong) — tidak boleh dirender; admin
    // juga tanpa "Simpan Draft" (tanpa create tanpa tim).
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /simpan draft/i })).toBeNull();
  });
});

describe("ChangePackageFormPage — validasi klien Submit", () => {
  it("submit kurang field implementation → pesan wajib, create/submit TAK dipanggil", async () => {
    renderForm("/changes/new");
    await fillInitiation();

    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    const validation = screen.getByTestId("change-package-form-validation");
    expect(validation.textContent).toMatch(/prioritas/i);
    expect(validation.textContent).toMatch(/jenis perubahan/i);
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  it("tanggal rilis < tanggal eksekusi → pesan urutan tanggal, tak ada request", async () => {
    renderForm("/changes/new");
    await fillForSubmit();
    await pickDate(screen.getByLabelText("Tanggal eksekusi"), "2025-12-15");
    await pickDate(screen.getByLabelText("Tanggal rilis"), "2025-12-01");

    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(screen.getByTestId("change-package-form-validation").textContent).toMatch(
      /tanggal rilis/i,
    );
    expect(mockedSubmit).not.toHaveBeenCalled();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("cost_needed dicentang tanpa jumlah → pesan biaya; terisi → validasi lolos", async () => {
    renderForm("/changes/new");
    await fillForSubmit({ withCost: false });
    await userEvent.click(screen.getByLabelText("Perlu biaya?"));

    // Belum ada jumlah → validasi submit menolak.
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(screen.getByTestId("change-package-form-validation").textContent).toMatch(
      /jumlah biaya/i,
    );
    expect(mockedSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Jumlah biaya"), "15000000.00");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(mockedSubmit).toHaveBeenCalled();
    });
  });

  it("validasi submit memakai label 'Tanggapan Perubahan', bukan 'Hasil implementasi'", async () => {
    renderForm("/changes/new");
    await fillInitiation();

    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    const validation = screen.getByTestId("change-package-form-validation");
    expect(validation.textContent).toMatch(/tanggapan perubahan wajib/i);
    expect(validation.textContent).not.toMatch(/hasil implementasi/i);
  });
});

describe("ChangePackageFormPage — Submit (create mode)", () => {
  it("submit lengkap → create draft dulu, lalu POST submit full-payload, navigasi detail", async () => {
    renderForm("/changes/new");
    await fillForSubmit();

    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    // 1. Draft dibuat dulu (perlu id paket untuk POST /submit).
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({
        initiation: fullSubmitInput.initiation,
        implementation: fullSubmitInput.implementation,
      });
    });
    // 2. Submit full-payload ke paket hasil create.
    await waitFor(() => {
      expect(mockedSubmit).toHaveBeenCalledWith(12, fullSubmitInput);
    });
    expect(await screen.findByText("changes-detail-stub")).toBeTruthy();
  });

  it("Submit di create: antrean lampiran terunggah ke paket baru sebelum submit", async () => {
    renderForm("/changes/new");
    await fillForSubmit();

    const file = new File(["png-bytes"], "hasil-uji.png", { type: "image/png" });
    await userEvent.upload(
      screen.getByLabelText(/unggah lampiran/i) as HTMLInputElement,
      file,
    );

    await userEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    // Draft id 12 → lampiran harus menempel pada paket yang sama sebelum
    // POST /submit, bukan hilang bersama state form setelah navigasi.
    await waitFor(() => {
      expect(mockedUpload).toHaveBeenCalledWith(12, [file]);
    });
    const uploadOrder = mockedUpload.mock.invocationCallOrder[0] as number;
    const submitOrder = mockedSubmit.mock.invocationCallOrder[0] as number;
    expect(uploadOrder).toBeLessThan(submitOrder);
  });

  /** ship#18: unggah antrean gagal → JANGAN POST /submit. Lanjut submit akan
   * mengunci paket tanpa bukti, lalu navigasi membuang state form (file
   * antrean) — lampiran hilang diam-diam. */
  it("Submit di create: upload antrean gagal → TIDAK submit, TIDAK navigasi", async () => {
    renderForm("/changes/new");
    await fillForSubmit();

    const file = new File(["png-bytes"], "bukti.png", { type: "image/png" });
    await userEvent.upload(
      screen.getByLabelText(/unggah lampiran/i) as HTMLInputElement,
      file,
    );
    mockedUpload.mockRejectedValueOnce(
      new ApiError("http", "Maksimal 10 lampiran.", { status: 422 }),
    );

    await userEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(mockedUpload).toHaveBeenCalled();
    });
    // Form tetap terpasang (tanpa navigasi) dan pesan upload tampil di kartu.
    expect(screen.queryByText("changes-detail-stub")).toBeNull();
    expect(
      (await screen.findAllByText("Maksimal 10 lampiran.")).length,
    ).toBeGreaterThan(0);
    expect(mockedSubmit).not.toHaveBeenCalled();
  });
});

describe("ChangePackageFormPage — edit mode (/changes/:packageId/edit)", () => {
  it("edit draft → hapus lampiran existing memanggil DELETE lalu menyegarkan daftar", async () => {
    mockedShow.mockResolvedValue(editPkgWithAttachment);
    renderForm("/changes/12/edit");

    // Form tidak merender doc_number: tunggu prefill Deskripsi dari show.
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Deskripsi") as HTMLInputElement).value,
      ).toBe("Migrasi server aplikasi e-Office ke cloud Kominfo");
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Hapus Lampiran #21" }),
    );

    await waitFor(() => {
      expect(mockedDeleteAttachment).toHaveBeenCalledWith(12, 21);
    });
    await waitFor(() => {
      expect(mockedShow).toHaveBeenCalledTimes(2);
    });
  });

  /** ship#17: double-click pada "Hapus Lampiran" saat DELETE masih in-flight
   * harus menembak SATU kali — DELETE kedua akan 404 dan menimpa pesan sukses
   * dengan error palsu di kartu Lampiran. */
  it("klik ganda saat DELETE in-flight → hanya SATU panggilan delete", async () => {
    mockedShow.mockResolvedValue(editPkgWithAttachment);
    let resolveFirst: (v?: unknown) => void = () => {};
    mockedDeleteAttachment.mockImplementation(
      () => new Promise((res) => { resolveFirst = res as (v?: unknown) => void; }),
    );
    renderForm("/changes/12/edit");

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Deskripsi") as HTMLInputElement).value,
      ).toBe("Migrasi server aplikasi e-Office ke cloud Kominfo");
    });
    const btn = await screen.findByRole("button", { name: "Hapus Lampiran #21" });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(mockedDeleteAttachment).toHaveBeenCalledTimes(1);

    resolveFirst();
    await waitFor(() => {
      expect(mockedShow).toHaveBeenCalledTimes(2);
    });
  });

  /** ship#18: DELETE ditolak server (403 non-inisiator / 422 non-draft) —
   * pesan tampil di kartu Lampiran dan tombol hapus aktif lagi (tidak
   * terkunci `uploading=true` permanen). */
  it("DELETE gagal → pesan alert di kartu Lampiran + tombol hapus aktif lagi", async () => {
    mockedShow.mockResolvedValue(editPkgWithAttachment);
    mockedDeleteAttachment.mockRejectedValueOnce(
      new ApiError("http", "Hanya inisiator yang dapat menghapus lampiran.", { status: 403 }),
    );
    renderForm("/changes/12/edit");

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Deskripsi") as HTMLInputElement).value,
      ).toBe("Migrasi server aplikasi e-Office ke cloud Kominfo");
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Hapus Lampiran #21" }),
    );

    expect(
      await screen.findByText("Hanya inisiator yang dapat menghapus lampiran."),
    ).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Hapus Lampiran #21" });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    // Gagal → daftar TIDAK disegarkan (tetap menampilkan lampiran).
    expect(mockedShow).toHaveBeenCalledTimes(1);
  });

  /** ship#18: DELETE tidak boleh berlari dengan simpan/submit in-flight —
   * bisa menghapus baris yang baru diunggah, atau refetch menghidupkan lagi
   * baris yang terhapus. Saat `busy`, klik hapus diabaikan. */
  it("klik hapus saat Simpan Draft in-flight → TIDAK ada panggilan delete", async () => {
    mockedShow.mockResolvedValue(editPkgWithAttachment);
    let resolveUpdate: (v?: unknown) => void = () => {};
    mockedUpdate.mockImplementation(
      () => new Promise((res) => { resolveUpdate = res as (v?: unknown) => void; }),
    );
    renderForm("/changes/12/edit");

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Deskripsi") as HTMLInputElement).value,
      ).toBe("Migrasi server aplikasi e-Office ke cloud Kominfo");
    });
    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Hapus Lampiran #21" }),
    );
    expect(mockedDeleteAttachment).not.toHaveBeenCalled();

    resolveUpdate(editPkg);
    expect(await screen.findByText("changes-detail-stub")).toBeTruthy();
  });

  it("mount mem-fetch showPackage dan prefill seluruh field dari data", async () => {
    renderForm("/changes/12/edit");


    await waitFor(() => {
      expect(mockedShow).toHaveBeenCalledWith(12);
    });
    expect(
      (screen.getByLabelText("Deskripsi") as HTMLInputElement).value,
    ).toBe("Migrasi server aplikasi e-Office ke cloud Kominfo");
    expect(screen.getByLabelText("Tanggal dibutuhkan").textContent).toContain(
      "31 Desember 2025",
    );
    expect(screen.getByLabelText("Prioritas").textContent).toContain("Normal");
    expect(screen.getByLabelText("Dampak").textContent).toContain("Minor");
    expect(
      screen.getByRole("checkbox", { name: "Network" }).getAttribute("data-state"),
    ).toBe("checked");
    expect(
      screen.getByRole("checkbox", { name: "Hardware" }).getAttribute("data-state"),
    ).toBe("unchecked");
    // Checkbox kit = tombol Radix; state via data-state.
    expect(
      screen.getByRole("checkbox", { name: "Perlu biaya?" }).getAttribute("data-state"),
    ).toBe("checked");
    expect((screen.getByLabelText("Jumlah biaya") as HTMLInputElement).value).toBe(
      "15000000.00",
    );
    expect(screen.getByLabelText("Tanggal eksekusi").textContent).toContain(
      "1 Desember 2025",
    );
    // Tidak ada field evaluator di form edit (evaluator otomatis inisiator).
    expect(screen.queryByLabelText(/evaluator/i)).toBeNull();
  });

  it('"Simpan Draft" → PUT updatePackage(12, draft input); navigasi detail', async () => {
    renderForm("/changes/12/edit");
    await waitFor(() => {
      expect(mockedShow).toHaveBeenCalled();
    });

    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith(12, {
        initiation: {
          field_id: 3,
          needed_by_date: "2025-12-31",
          description: "Migrasi server aplikasi e-Office ke cloud Kominfo",
          reason: "Server on-premise sudah tidak memadai.",
        },
        implementation: fullSubmitInput.implementation,
      });
    });
    expect(await screen.findByText("changes-detail-stub")).toBeTruthy();
  });

  it('"Submit" → POST submitPackage(12, full payload) TANPA PUT; navigasi detail', async () => {
    renderForm("/changes/12/edit");
    await waitFor(() => {
      expect(mockedShow).toHaveBeenCalled();
    });

    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(mockedSubmit).toHaveBeenCalledWith(12, {
        initiation: {
          field_id: 3,
          needed_by_date: "2025-12-31",
          description: "Migrasi server aplikasi e-Office ke cloud Kominfo",
          reason: "Server on-premise sudah tidak memadai.",
        },
        implementation: fullSubmitInput.implementation,
      });
    });
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(await screen.findByText("changes-detail-stub")).toBeTruthy();
  });

  it("submit ditolak server 422 → pesan error tampil dengan role alert", async () => {
    mockedSubmit.mockRejectedValue(new ApiError("http", "Paket sudah diproses.", { status: 422 }));
    renderForm("/changes/12/edit");
    await waitFor(() => {
      expect(mockedShow).toHaveBeenCalled();
    });

    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByTestId("change-package-form-error").textContent).toContain(
        "Paket sudah diproses.",
      );
    });
  });
});

describe("ChangePackageFormPage — gate tombol (permission sintetik × status × ownership)", () => {
  it("edit paket non-draft (pending) → tombol Simpan Draft & Submit tak dirender", async () => {
    mockedShow.mockResolvedValue({
      ...editPkg,
      initiation: { ...editPkg.initiation, status: "pending" },
    });
    renderForm("/changes/12/edit");

    await waitFor(() => {
      expect((screen.getByLabelText("Deskripsi") as HTMLInputElement).value).not.toBe("");
    });
    expect(screen.queryByRole("button", { name: /simpan draft/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
  });

  it("pemegang update+submit tapi bukan inisiator → tombol tak dirender", async () => {
    renderForm("/changes/12/edit", {
      id: 9,
      name: "Siti Aminah",
      nip: "198001012023011002",
      email: "siti@kominfo.go.id",
    });

    await waitFor(() => {
      expect((screen.getByLabelText("Deskripsi") as HTMLInputElement).value).not.toBe("");
    });
    expect(screen.queryByRole("button", { name: /simpan draft/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
  });

  it("create mode tanpa permission create → tombol tak dirender", () => {
    renderForm("/changes/new", {
      permissions: ["change.initiation.view"],
  	});

    expect(screen.queryByRole("button", { name: /simpan draft/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
  });
});

describe("ChangePackageFormPage — spinner pending + toast (T7a)", () => {
  it("Simpan Draft sukses → toast sukses teks server + navigasi detail", async () => {
    mockedCreate.mockResolvedValueOnce({ ...editPkg, message: "Draft paket dibuat." });
    renderForm("/changes/new");
    await waitFor(() => expect(mockedChangeTypes).toHaveBeenCalled());

    await fillInitiation();
    await userEvent.click(screen.getByRole("button", { name: /simpan draft/i }));

    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Draft paket dibuat.");
    });
    expect(await screen.findByText("changes-detail-stub")).toBeTruthy();
  });

  it("Submit gagal → toast pesan server + banner inline tetap", async () => {
    mockedSubmit.mockRejectedValueOnce(
      new ApiError("http", "Paket sudah diproses.", { status: 422 }),
    );
    renderForm("/changes/12/edit");
    await waitFor(() => expect(mockedShow).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Paket sudah diproses.");
    });
    expect(screen.getByTestId("change-package-form-error").textContent).toContain(
      "Paket sudah diproses.",
    );
  });

  it("Submit in-flight → tombol Submit & Simpan Draft aria-busy (mock never-resolves)", async () => {
    mockedSubmit.mockImplementation(() => new Promise(() => {}));
    renderForm("/changes/12/edit");
    await waitFor(() => expect(mockedShow).toHaveBeenCalled());

    const submit = screen.getByRole("button", { name: /submit/i });
    const draft = screen.getByRole("button", { name: /simpan draft/i });
    await userEvent.click(submit);

    await waitFor(() => {
      expect(submit.getAttribute("aria-busy")).toBe("true");
    });
    expect(draft.getAttribute("aria-busy")).toBe("true");
    expect((draft as HTMLButtonElement).disabled).toBe(true);
  });

  it("Simpan Draft gagal → kedua tombol aktif kembali (regresi finally, ship #13)", async () => {
    // Tanpa `finally { setBusy(false) }`, busy tersangkut true dan kedua
    // tombol nonaktif permanen sampai reload — bug yang dikunci test ini.
    mockedCreate.mockRejectedValueOnce(
      new ApiError("http", "Deskripsi wajib diisi.", { status: 422 }),
    );
    renderForm("/changes/new");
    await waitFor(() => expect(mockedChangeTypes).toHaveBeenCalled());

    await fillInitiation();
    const draft = screen.getByRole("button", { name: /simpan draft/i });
    await userEvent.click(draft);

    await waitFor(() => expect(draft.getAttribute("aria-busy")).not.toBe("true"));
    expect((draft as HTMLButtonElement).disabled).toBe(false);
  });

  it("klik kedua saat in-flight → hanya SATU dispatch submit (double-submit guard)", async () => {
    // disabled di-assert test lain; di sini klik-nyata kedua saat in-flight
    // harus diabaikan handler (busy guard) — bukan cuma atribut.
    mockedUpdate.mockResolvedValue({ ...editPkg, message: "Draft disimpan." });
    mockedSubmit.mockImplementation(() => new Promise(() => {}));
    renderForm("/changes/12/edit");
    await waitFor(() => expect(mockedShow).toHaveBeenCalled());

    const submit = screen.getByRole("button", { name: /submit/i });
    await userEvent.click(submit);
    await waitFor(() => expect(submit.getAttribute("aria-busy")).toBe("true"));
    await userEvent.click(submit);

    expect(mockedSubmit).toHaveBeenCalledTimes(1);
  });
});
