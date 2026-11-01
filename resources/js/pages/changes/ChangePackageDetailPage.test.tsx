/**
 * Unit test ChangePackageDetailPage (modul change-package — Phase 3 Task 6).
 *
 * Mengunci kontrak halaman detail:
 * - mount → `fetchPackage(id)` (show, relasi change_types/attachments di-load)
 *   lalu dua kartu Inisiasi/Implementasi + lampiran dirender;
 * - matriks tombol × (permission sintetik × status × ownership): Edit/Submit/
 *   Hapus/Unggah Lampiran hanya inisiator + draft; Setujui/Tolak hanya pemegang
 *   approve/reject + pending + BUKAN inisiator (user sintetik inisiator yang
 *   juga pemegang approve → tombol tersembunyi, bukan role — Resolved #4 tanpa
 *   dialog alasan);
 * - PDF via `PdfDownloadButton` (`getBlob` + `getError` → 422 tanda tangan),
 *   digate `export_pdf` + status (`approved` / impl `completed`);
 * - unduh lampiran via blob dari `attachment.url` (route `attachments.download`,
 *   ber-bearer) — BUKAN link `/storage`;
 * - regresi `a602c46`: refetch pasca-mutasi gagal TAK melenyapkan pesan error
 *   (`fetchPackage.pending` tidak membersihkan `current.error`).
 *
 * User sintetik (pola form page) — bukan nama role seeder.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { ChangePackage, ChangeImplementationStatus } from "@/api/types";

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
import { httpClient } from "@/api/client";
import { ChangePackageDetailPage } from "@/pages/changes/ChangePackageDetailPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedShow = changePackageApi.showPackage as unknown as Mock;
const mockedDelete = changePackageApi.deletePackage as unknown as Mock;
const mockedSubmit = changePackageApi.submitPackage as unknown as Mock;
const mockedApprove = changePackageApi.approvePackage as unknown as Mock;
const mockedReject = changePackageApi.rejectPackage as unknown as Mock;
const mockedUpload = changePackageApi.uploadPackageAttachments as unknown as Mock;
const mockedInitiationPdf = changePackageApi.exportInitiationPdf as unknown as Mock;
const mockedImplementationPdf = changePackageApi.exportImplementationPdf as unknown as Mock;

/** Staf inisiator: view + update/delete/submit + upload (implementation.update). */
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
    "change.initiation.delete",
    "change.initiation.submit",
    "change.implementation.update",
  ],
  team: { id: 5, name: "Tim Aplikasi", field: { id: 3, name: "Bidang Aplikasi" } },
};

/** Kepala tim (beda orang): view + delete + approve/reject + export_pdf. */
const kepalaTim = {
  ...staf,
  id: 4,
  name: "Siti Aminah",
  nip: "198001012023011002",
  email: "siti@kominfo.go.id",
  roles: ["kepala_tim"],
  permissions: [
    "change.initiation.view",
    "change.initiation.delete",
    "change.initiation.approve",
    "change.initiation.reject",
    "change.initiation.export_pdf",
    "change.implementation.view",
    "change.implementation.export_pdf",
  ],
};

/** Kepala bidang (beda orang): view + export_pdf — tanpa approve/reject/update. */
const kepalaBidang = {
  ...staf,
  id: 2,
  name: "Dr. Agus Wijaya",
  nip: "197501012005011003",
  email: "agus@kominfo.go.id",
  roles: ["kepala_bidang"],
  permissions: [
    "change.initiation.view",
    "change.initiation.delete",
    "change.initiation.export_pdf",
    "change.implementation.view",
    "change.implementation.export_pdf",
  ],
};

/** Paket draft milik staf (id 8) — bentuk respons show (relasi di-load). */
const draftPkg: ChangePackage = {
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
    attachments: [{ id: 15, url: "/changes/12/attachments/15", sort_order: 1 }],
  },
};

function pkgWithStatus(
  status: ChangePackage["initiation"]["status"],
  implStatus: ChangeImplementationStatus,
): ChangePackage {
  return {
    initiation: { ...draftPkg.initiation, status },
    implementation: { ...draftPkg.implementation!, status: implStatus },
  };
}

const pendingPkg = () => pkgWithStatus("pending", "submitted");
const approvedPkg = () => pkgWithStatus("approved", "submitted");
const completedPkg = () => pkgWithStatus("approved", "completed");

/** Render detail untuk paket id 12 dengan user khusus (default staf). */
function renderDetail(user: typeof staf = staf, pkg: ChangePackage = draftPkg) {
  mockedShow.mockResolvedValue(pkg);
  const store = makeStore();
  store.dispatch(setUser(user));

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/changes/12"]}>
        <Routes>
          <Route path="/changes/:packageId" element={<ChangePackageDetailPage />} />
          <Route path="/changes" element={<div>changes-list-stub</div>} />
          <Route path="/changes/:packageId/edit" element={<div>changes-form-stub</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => `blob:stub-${Math.random().toString(36).slice(2)}`);
  URL.revokeObjectURL = vi.fn();
  mockedDelete.mockResolvedValue("Paket perubahan dihapus.");
  mockedSubmit.mockResolvedValue(pendingPkg());
  mockedApprove.mockResolvedValue(approvedPkg());
  mockedReject.mockResolvedValue(pkgWithStatus("rejected", "submitted"));
  mockedUpload.mockResolvedValue([
    { id: 16, url: "/changes/12/attachments/16", sort_order: 2 },
  ]);
  mockedInitiationPdf.mockResolvedValue(
    new Blob(["%PDF-1.7 init"], { type: "application/pdf" }),
  );
  mockedImplementationPdf.mockResolvedValue(
    new Blob(["%PDF-1.7 impl"], { type: "application/pdf" }),
  );
});

describe("ChangePackageDetailPage — render dua kartu + lampiran", () => {
  it("mount mem-fetch showPackage lalu render kartu Inisiasi & Implementasi + lampiran", async () => {
    renderDetail();

    await waitFor(() => {
      expect(mockedShow).toHaveBeenCalledWith(12);
    });

    // Kartu Inisiasi: doc number, deskripsi, alasan, inisiator.
    expect(await screen.findByText("001/9/1.1/114/2025")).toBeTruthy();
    expect(
      screen.getByText("Migrasi server aplikasi e-Office ke cloud Kominfo"),
    ).toBeTruthy();
    expect(screen.getByText("Server on-premise sudah tidak memadai.")).toBeTruthy();
    expect(screen.getByTestId("wfh-status-badge")).toBeTruthy();

    // Kartu Implementasi + jenis perubahan + lampiran.
    expect(screen.getByText("Network")).toBeTruthy();
    expect(screen.getByText("Uji migrasi di staging")).toBeTruthy();
    // Lampiran dirender sebagai baris bernama, bukan link /storage telanjang.
    expect(screen.getByTestId("change-package-attachment-15")).toBeTruthy();
  });
});

describe("ChangePackageDetailPage — matriks tombol (permission × status × ownership)", () => {
  /** Sel draft + inisiator: empat aksi draft tampil; setujui/tolak/PDF tidak. */
  it("inisiator + draft → Edit, Submit, Unggah Lampiran, Hapus; tanpa Setujui/Tolak/PDF", async () => {
    renderDetail(staf);
    await screen.findByText("001/9/1.1/114/2025");

    expect(screen.getByRole("link", { name: /ubah draft/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /ajukan submit/i })).toBeTruthy();
    expect(screen.getByLabelText(/unggah lampiran/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /hapus/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /setujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tolak/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /pdf/i })).toBeNull();
  });

  it("kepala bidang (view tanpa update/submit + draft inisiator lain) → tanpa tombol aksi draft", async () => {
    renderDetail(kepalaBidang);
    await screen.findByText("001/9/1.1/114/2025");

    expect(screen.queryByRole("link", { name: /ubah draft/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /ajukan submit/i })).toBeNull();
    expect(screen.queryByLabelText(/unggah lampiran/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /hapus/i })).toBeNull();
    // Draft belum approved → tombol PDF tidak dirender (mencegah 422 pasti).
    expect(screen.queryByRole("button", { name: /pdf/i })).toBeNull();
  });

  it("inisiator + pending → semua tombol draft tersembunyi (bukan draft lagi)", async () => {
    renderDetail(staf, pendingPkg());
    await screen.findByText("001/9/1.1/114/2025");

    expect(screen.queryByRole("link", { name: /ubah draft/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /ajukan submit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /hapus/i })).toBeNull();
    expect(screen.queryByLabelText(/unggah lampiran/i)).toBeNull();
  });

  it("kepala tim (approve/reject + pending + bukan inisiator) → Setujui/Tolak tampil", async () => {
    renderDetail(kepalaTim, pendingPkg());
    await screen.findByText("001/9/1.1/114/2025");

    expect(screen.getByRole("button", { name: /setujui/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /tolak/i })).toBeTruthy();
    // Resolved #4: tanpa dialog alasan — langsung dua tombol keputusan.
    expect(screen.getByRole("button", { name: /setujui/i }).textContent).not.toMatch(/alasan/i);
  });

  it("inisiator yang JUGA pemegang approve + pending → Setujui/Tolak TERSEMBUNYI", async () => {
    const inisiatorPemegangApprove = {
      ...staf,
      permissions: [
        ...staf.permissions,
        "change.initiation.approve",
        "change.initiation.reject",
      ],
    };
    renderDetail(inisiatorPemegangApprove, pendingPkg());
    await screen.findByText("001/9/1.1/114/2025");

    expect(screen.queryByRole("button", { name: /setujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tolak/i })).toBeNull();
  });

  it("kepala tim + draft → Setujui/Tolak tak tampil (harus pending)", async () => {
    renderDetail(kepalaTim);
    await screen.findByText("001/9/1.1/114/2025");

    expect(screen.queryByRole("button", { name: /setujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tolak/i })).toBeNull();
  });
});

describe("ChangePackageDetailPage — aksi mutasi", () => {
  it("Ajukan Submit → submitPackageThunk POST full PackageSubmitInput dari resource, lalu refetch", async () => {
    renderDetail(staf);
    await screen.findByText("001/9/1.1/114/2025");

    await userEvent.click(screen.getByRole("button", { name: /ajukan submit/i }));

    await waitFor(() => {
      expect(mockedSubmit).toHaveBeenCalledWith(12, {
        initiation: {
          field_id: 3,
          needed_by_date: "2025-12-31",
          description: "Migrasi server aplikasi e-Office ke cloud Kominfo",
          reason: "Server on-premise sudah tidak memadai.",
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
      });
    });
    await waitFor(() => {
      expect(mockedShow).toHaveBeenCalledTimes(2);
    });
  });

  it("Setujui → approvePackage TANPA body reason, lalu refetch detail", async () => {
    mockedApprove.mockResolvedValue(approvedPkg());
    renderDetail(kepalaTim, pendingPkg());
    await screen.findByText("001/9/1.1/114/2025");

    await userEvent.click(screen.getByRole("button", { name: /setujui/i }));

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith(12);
    });
    // Refetch pasca-sukses: showPackage dipanggil lagi (2×: mount + refetch).
    await waitFor(() => {
      expect(mockedShow).toHaveBeenCalledTimes(2);
    });
  });

  it("Tolak → rejectPackage tanpa dialog alasan; pesan server 422 tetap tampil", async () => {
    mockedReject.mockRejectedValueOnce(new Error("Inisiator tidak dapat menolak paketnya sendiri."));
    renderDetail(kepalaTim, pendingPkg());
    await screen.findByText("001/9/1.1/114/2025");

    await userEvent.click(screen.getByRole("button", { name: /tolak/i }));

    await waitFor(() => {
      expect(mockedReject).toHaveBeenCalledWith(12);
    });
    await waitFor(() => {
      expect(screen.getByTestId("change-package-detail-error").textContent).toContain(
        "Inisiator tidak dapat menolak paketnya sendiri.",
      );
    });
  });

  it("Hapus → confirm dialog → deletePackage → navigasi ke /changes", async () => {
    renderDetail(staf);
    await screen.findByText("001/9/1.1/114/2025");

    await userEvent.click(screen.getByRole("button", { name: /hapus/i }));
    // Dialog konfirmasi muncul dulu, deletePackage belum dipanggil.
    expect(mockedDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /ya, hapus/i }));

    await waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith(12);
    });
    expect(await screen.findByText("changes-list-stub")).toBeTruthy();
  });

  it("Unggah Lampiran (≤10 file) → uploadPackageAttachments multipart, lalu refetch", async () => {
    renderDetail(staf);
    await screen.findByText("001/9/1.1/114/2025");

    const file = new File(["pdf-bytes"], "bukti.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/unggah lampiran/i) as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(mockedUpload).toHaveBeenCalledWith(12, [file]);
    });
    await waitFor(() => {
      expect(mockedShow).toHaveBeenCalledTimes(2);
    });
  });
});

describe("ChangePackageDetailPage — PDF + lampiran (blob, bearer)", () => {
  it("PDF inisiasi: approved + change.initiation.export_pdf → tombol tampil; klik → exportInitiationPdf", async () => {
    renderDetail(kepalaBidang, approvedPkg());
    await screen.findByText("001/9/1.1/114/2025");

    const button = screen.getByRole("button", { name: /pdf inisiasi/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(mockedInitiationPdf).toHaveBeenCalledWith(12);
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("PDF implementasi hanya bila impl `completed` + export_pdf", async () => {
    // approved + impl submitted → tombol implementasi belum tampil.
    renderDetail(kepalaBidang, approvedPkg());
    await screen.findByText("001/9/1.1/114/2025");
    expect(screen.queryByRole("button", { name: /pdf implementasi/i })).toBeNull();

    // approved + impl completed → tombol muncul.
    renderDetail(kepalaBidang, completedPkg());
    expect(await screen.findByRole("button", { name: /pdf implementasi/i })).toBeTruthy();
  });

  it("PDF 422 tanda tangan tersaji via getError", async () => {
    mockedInitiationPdf.mockRejectedValueOnce(
      new Error("Budi belum mengatur tanda tangan."),
    );
    renderDetail(kepalaBidang, approvedPkg());
    await screen.findByText("001/9/1.1/114/2025");

    await userEvent.click(screen.getByRole("button", { name: /pdf inisiasi/i }));

    await waitFor(() => {
      expect(screen.getByText("Budi belum mengatur tanda tangan.")).toBeTruthy();
    });
  });

  it("unduh lampiran via httpClient ber-bearer dari attachment.url (bukan /storage)", async () => {
    const requests: Array<{ url?: string; headers: Record<string, unknown> }> = [];
    httpClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      requests.push({
        url: config.url,
        headers: { ...config.headers } as Record<string, unknown>,
      });
      return Promise.resolve({
        status: 200,
        data: new Blob(["bytes"], { type: "application/octet-stream" }),
        headers: {},
        config,
      } as AxiosResponse);
    };
    window.localStorage.setItem("auth_token", "tok-att");

    renderDetail(staf);
    await screen.findByText("001/9/1.1/114/2025");

    await userEvent.click(screen.getByRole("button", { name: /unduh/i }));

    await waitFor(() => {
      expect(requests[0]?.url).toBe("/changes/12/attachments/15");
    });
    expect(requests[0]?.headers["Authorization"]).toBe("Bearer tok-att");
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});

describe("ChangePackageDetailPage — regresi error pasca-refetch (a602c46)", () => {
  it("mutasi gagal → pesan error tampil dan TIDAK lenyap (tak ada refetch otomatis)", async () => {
    // Tolak ditolak server 422:
    mockedReject.mockRejectedValueOnce(
      new Error("Inisiator tidak dapat menolak paketnya sendiri."),
    );
    renderDetail(kepalaTim, pendingPkg());
    await screen.findByText("001/9/1.1/114/2025");

    await userEvent.click(screen.getByRole("button", { name: /tolak/i }));
    await waitFor(() => {
      expect(screen.getByTestId("change-package-detail-error").textContent).toContain(
        "Inisiator tidak dapat menolak paketnya sendiri.",
      );
    });

    // Halaman TIDAK refetch otomatis pasca gagal — showPackage hanya 1× (mount),
    // jadi pesan error tak terhapus oleh fetch pendamping.
    expect(mockedShow).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("change-package-detail-error").textContent).toContain(
      "Inisiator tidak dapat menolak paketnya sendiri.",
    );
  });
});