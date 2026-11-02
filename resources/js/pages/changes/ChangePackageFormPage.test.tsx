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
 * - TIDAK ada input evaluator (Resolved #1);
 * - pesan server 422 (amenang `current.error`) tampil dengan role alert dan
 *   tak lenyap selama form tetap termuat;
 * - tombol digate: create = `change.initiation.create` + tim/bidang terisi;
 *   edit = status `draft` + inisiator + permission update/submit (user
 *   sintetik, bukan role).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  exportInitiationPdf: vi.fn(),
  exportImplementationPdf: vi.fn(),
  listChangeTypes: vi.fn(),
}));

import * as changePackageApi from "@/api/change-package";
import { ChangePackageFormPage } from "@/pages/changes/ChangePackageFormPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedShow = changePackageApi.showPackage as unknown as Mock;
const mockedCreate = changePackageApi.createPackage as unknown as Mock;
const mockedUpdate = changePackageApi.updatePackage as unknown as Mock;
const mockedSubmit = changePackageApi.submitPackage as unknown as Mock;
const mockedChangeTypes = changePackageApi.listChangeTypes as unknown as Mock;

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
    test_plan: "Uji migrasi di staging",
    execution_date: "2025-12-01",
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
  fireEvent.change(screen.getByLabelText("Tanggal dibutuhkan"), {
    target: { value: "2025-12-31" },
  });
  await userEvent.selectOptions(screen.getByLabelText("Prioritas"), "normal");
  await userEvent.selectOptions(screen.getByLabelText("Dampak"), "Minor");
  await userEvent.click(screen.getByRole("checkbox", { name: "Network" }));
  await userEvent.type(screen.getByLabelText("Rencana pengujian"), "Uji migrasi di staging");
  fireEvent.change(screen.getByLabelText("Tanggal eksekusi"), {
    target: { value: "2025-12-01" },
  });
  fireEvent.change(screen.getByLabelText("Tanggal rilis"), {
    target: { value: "2025-12-15" },
  });
  await userEvent.type(screen.getByLabelText("Hasil implementasi"), "Migrasi selesai");
  await userEvent.type(screen.getByLabelText("Dampak produksi"), "Downtime 1 jam");
  await userEvent.type(screen.getByLabelText("Effort yang dibutuhkan"), "3 orang-hari");
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
    fireEvent.change(screen.getByLabelText("Tanggal dibutuhkan"), {
      target: { value: "2025-12-31" },
    });
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
});

describe("ChangePackageFormPage — create mode (/changes/new)", () => {
  it("render bidang read-only, checkbox change types, dan TANPA input evaluator/field select", async () => {
    renderForm("/changes/new");

    // Bidang read-only dari user.team.field — teks tampil, tidak ada select.
    expect(await screen.findByText("Bidang Aplikasi")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: /bidang/i })).toBeNull();

    // Change types dari cache `/change-types` → checkbox.
    expect(await screen.findByRole("checkbox", { name: "Hardware" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Network" })).toBeTruthy();

    // Resolved #1: tanpa input evaluator.
    expect(screen.queryByLabelText(/evaluator/i)).toBeNull();
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
    fireEvent.change(screen.getByLabelText("Tanggal eksekusi"), {
      target: { value: "2025-12-15" },
    });
    fireEvent.change(screen.getByLabelText("Tanggal rilis"), {
      target: { value: "2025-12-01" },
    });

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
});

describe("ChangePackageFormPage — edit mode (/changes/:packageId/edit)", () => {
  it("mount mem-fetch showPackage dan prefill seluruh field dari data", async () => {
    renderForm("/changes/12/edit");

    await waitFor(() => {
      expect(mockedShow).toHaveBeenCalledWith(12);
    });
    expect(
      (screen.getByLabelText("Deskripsi") as HTMLInputElement).value,
    ).toBe("Migrasi server aplikasi e-Office ke cloud Kominfo");
    expect(
      (screen.getByLabelText("Tanggal dibutuhkan") as HTMLInputElement).value,
    ).toBe("2025-12-31");
    expect((screen.getByLabelText("Prioritas") as HTMLSelectElement).value).toBe("normal");
    expect((screen.getByLabelText("Dampak") as HTMLSelectElement).value).toBe("Minor");
    expect(
      (screen.getByRole("checkbox", { name: "Network" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: "Hardware" }) as HTMLInputElement).checked,
    ).toBe(false);
    expect((screen.getByLabelText("Perlu biaya?") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Jumlah biaya") as HTMLInputElement).value).toBe(
      "15000000.00",
    );
    expect(
      (screen.getByLabelText("Tanggal eksekusi") as HTMLInputElement).value,
    ).toBe("2025-12-01");
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
    mockedSubmit.mockRejectedValue(new Error("Paket sudah diproses."));
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
