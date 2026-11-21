/**
 * Unit test ProfilePage (frontend-phase1 Phase 4) — menutup gap ship review:
 * module API profile sudah teruji, tapi komponen halaman (save → PUT,
 * upload → FormData + preview, error per-field 422, fallback preview) tidak
 * punya test. Kontrak yang dijaga:
 * - Save mengirim phone/position/rank; field kosong dikirim sebagai `null`;
 *   sukses → `setUser` menyegarkan user di sidebar/header.
 * - Upload signature memakai `uploadSignature(FormData)` dan preview diambil
 *   lewat `fetchSignatureObjectUrl` (ber-otorisasi), bukan `<img src>` polos.
 * - Preview gagal diambil → kembali ke placeholder "Belum ada tanda tangan".
 * - 422 menampilkan error per-field via FieldError; input file dikosongkan
 *   setelah upload agar file sama bisa dipilih ulang.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import type { AuthUser } from "@/api/types";

vi.mock("@/api/profile", () => ({
  updateProfile: vi.fn(),
  uploadSignature: vi.fn(),
  fetchSignatureObjectUrl: vi.fn(),
}));

import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import * as profileApi from "@/api/profile";
import { ApiError } from "@/api/client";
import { ProfilePage } from "@/pages/profile/ProfilePage";
import { makeStore } from "@/store";
import { setToken, setUser } from "@/store/authSlice";

const mockedUpdate = profileApi.updateProfile as unknown as Mock;
const mockedUpload = profileApi.uploadSignature as unknown as Mock;
const mockedFetchUrl = profileApi.fetchSignatureObjectUrl as unknown as Mock;

// jsdom tidak menyediakan URL.createObjectURL/revokeObjectURL — dua-duanya
// dipakai ProfilePage untuk preview tanda tangan (fetchSignatureObjectUrl dan
// lifecycle cleanup).
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:stub");
  URL.revokeObjectURL = vi.fn();
});
afterAll(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

const user: AuthUser = {
  id: 1,
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
  permissions: ["wfh.report.create"],
};

function renderProfile() {
  const store = makeStore();
  store.dispatch(setToken("tok-profile"));
  store.dispatch(setUser(user));

  render(
    <Provider store={store}>
      {/* Toaster asli: toast dirender ke document.body (portal sonner). */}
      <Toaster position="top-right" richColors />
      <MemoryRouter initialEntries={["/profile"]}>
        <ProfilePage />
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockedFetchUrl.mockResolvedValue("blob:preview-1");
  // Sonner menyimpan toast di store modul-level; bersihkan antar test agar
  // asersi "tanpa toast" tidak melihat toast dari test sebelumnya.
  toast.dismiss();
});

/** Input file tersembunyi milik `FileInput` (data-testid ada di tombol). */
function signatureInput(): HTMLInputElement {
  return document.getElementById("profile-signature") as HTMLInputElement;
}

describe("ProfilePage — save profil", () => {
  it("mengirim PUT /profile dengan field terisi; sukses menyegarkan user", async () => {
    mockedUpdate.mockResolvedValueOnce({ ...user, position: "Analis Sistem" });
    const store = renderProfile();

    await userEvent.clear(screen.getByLabelText(/jabatan/i));
    await userEvent.type(screen.getByLabelText(/jabatan/i), "Analis Sistem");
    await userEvent.click(screen.getByTestId("profile-save"));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "081234567890",
        position: "Analis Sistem",
        rank: "Pengatur Muda",
      }),
    );
    // setUser menyegarkan state store → header/sidebar membaca posisi baru.
    expect(store.getState().auth.user?.position).toBe("Analis Sistem");
  });

  it("mengirim field kosong sebagai null (bukan string kosong)", async () => {
    mockedUpdate.mockResolvedValueOnce({ ...user, phone: null, position: null, rank: null });
    renderProfile();

    await userEvent.clear(screen.getByLabelText(/telepon/i));
    await userEvent.clear(screen.getByLabelText(/jabatan/i));
    await userEvent.clear(screen.getByLabelText(/pangkat/i));
    await userEvent.click(screen.getByTestId("profile-save"));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null, position: null, rank: null }),
    );
  });

  it("menampilkan error 422 per-field tanpa menimpa user", async () => {
    mockedUpdate.mockRejectedValueOnce(
      new ApiError("validation", "Gagal validasi.", {
        status: 422,
        errors: { phone: ["Format telepon tidak valid."] },
      }),
    );
    renderProfile();

    await userEvent.clear(screen.getByLabelText(/telepon/i));
    await userEvent.type(screen.getByLabelText(/telepon/i), "abc");
    await userEvent.click(screen.getByTestId("profile-save"));

    await waitFor(() =>
      expect(screen.getByText(/format telepon tidak valid/i)).toBeTruthy(),
    );
  });
});

describe("ProfilePage — upload tanda tangan", () => {
  it("upload memakai FormData lalu preview lewat fetch ber-otorisasi", async () => {
    mockedUpload.mockResolvedValueOnce({
      signature_url: "/api/signatures/1",
    });
    mockedFetchUrl.mockResolvedValueOnce("blob:new-signature");

    renderProfile();

    const file = new File(["png-bytes"], "ttd.png", { type: "image/png" });
    await userEvent.upload(signatureInput(), file);

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(1));
    expect(mockedUpload.mock.calls[0]![0]).toBeInstanceOf(FormData);
    await waitFor(() => expect(mockedFetchUrl).toHaveBeenCalledWith("/api/signatures/1"));
    await waitFor(() => expect(screen.getByAltText(/pratinjau tanda tangan/i)).toBeTruthy());
  });

  it("preview fetch gagal → placeholder dashed, bukan crash", async () => {
    mockedUpload.mockResolvedValueOnce({
      signature_url: "/api/signatures/1",
    });
    mockedFetchUrl.mockRejectedValueOnce(new Error("network"));

    renderProfile();

    const file = new File(["png-bytes"], "ttd.png", { type: "image/png" });
    await userEvent.upload(signatureInput(), file);

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/belum ada tanda tangan/i)).toBeTruthy();
  });

  it("upload 422 menampilkan error field signature dan mereset input", async () => {
    mockedUpload.mockRejectedValueOnce(
      new ApiError("validation", "Gagal validasi.", {
        status: 422,
        errors: { signature: ["File harus PNG/JPG maksimal 2MB."] },
      }),
    );

    renderProfile();

    const file = new File(["bad"], "ttd.png", { type: "image/png" });
    await userEvent.upload(signatureInput(), file);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /file harus png\/jpg maksimal 2mb/i,
      ),
    );
    // Input direset agar file yang sama bisa dipilih ulang (uji kelanjutan).
    expect(signatureInput().value).toBe("");
  });
});

describe("ProfilePage — pre-check tanda tangan (T9a)", () => {
  it("file > 2MB ditolak sebelum upload (0 panggilan API) + pesan inline", async () => {
    renderProfile();

    const big = new File(
      [new ArrayBuffer(3 * 1024 * 1024)],
      "ttd.png",
      { type: "image/png" },
    );
    await userEvent.upload(signatureInput(), big);

    expect(mockedUpload).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/ukuran tanda tangan maksimal 2mb/i),
    ).toBeTruthy();
  });

  it("tipe salah (.gif) ditolak sebelum upload dengan pesan format label", async () => {
    renderProfile();

    const gif = new File([new ArrayBuffer(8)], "ttd.gif", {
      type: "image/gif",
    });
    // applyAccept: false → uji gate handler; `accept` di DOM hanya petunjuk
    // dialog OS dan tidak menjamin (drag-drop / dialog "semua file").
    await userEvent.upload(signatureInput(), gif, { applyAccept: false });

    expect(mockedUpload).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/format tanda tangan harus jpg, jpeg, atau png/i),
    ).toBeTruthy();
    // Pesan memakai label manusia, bukan kunci field internal.
    expect((await screen.findByRole("alert")).textContent).not.toMatch(
      /\bsignature\b/,
    );
  });

  it("pesan pre-check bukan kunci field internal (signature) mentah", async () => {
    renderProfile();

    const gif = new File([new ArrayBuffer(8)], "ttd.gif", {
      type: "image/gif",
    });
    await userEvent.upload(signatureInput(), gif, { applyAccept: false });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/\bsignature\b/);
  });
});

describe("ProfilePage — rehidrasi", () => {
  it("memuat user null sebagai spinner, bukan form kosong", () => {
    // Buat store tanpa token/user: user masih null sampai rehidrasi selesai.
    const store = makeStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/profile"]}>
          <ProfilePage />
        </MemoryRouter>
      </Provider>,
    );

    expect(screen.getByText(/memuat profil/i)).toBeTruthy();
  });
});

describe("ProfilePage — spinner pending + toast (T7b)", () => {
  it("save sukses → toast sukses; elemen sukses inline role=status DIHAPUS", async () => {
    mockedUpdate.mockResolvedValueOnce({ ...user, message: "Profil berhasil diperbarui." });
    renderProfile();

    await userEvent.click(screen.getByTestId("profile-save"));

    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Profil berhasil diperbarui.");
    });
    expect(within(screen.getByTestId("profile-save").closest("form")!).queryByRole("status")).toBeNull();
  });

  it("save gagal non-validation → toast error pesan server", async () => {
    mockedUpdate.mockRejectedValueOnce(new ApiError("http", "Sesi berakhir.", { status: 401 }));
    renderProfile();

    await userEvent.click(screen.getByTestId("profile-save"));

    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Sesi berakhir, silakan masuk kembali.");
    });
  });

  it("save gagal 422 per-field → field error inline, TANPA toast", async () => {
    mockedUpdate.mockRejectedValueOnce(
      new ApiError("validation", "Gagal validasi.", {
        status: 422,
        errors: { phone: ["Format telepon tidak valid."] },
      }),
    );
    renderProfile();

    await userEvent.click(screen.getByTestId("profile-save"));

    await waitFor(() => expect(screen.getByText(/format telepon tidak valid/i)).toBeTruthy());
    expect(document.querySelector("[data-sonner-toast]")).toBeNull();
  });

  it("tombol Simpan profil aria-busy selama updateProfile in-flight", async () => {
    mockedUpdate.mockImplementation(() => new Promise(() => {}));
    renderProfile();

    const save = screen.getByTestId("profile-save");
    await userEvent.click(save);

    await waitFor(() => expect(save.getAttribute("aria-busy")).toBe("true"));
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(save.querySelector('[data-slot="spinner"]')).toBeTruthy();
  });

  it("upload sukses → toast sukses; spinner manual 'Mengunggah…' DIHAPUS", async () => {
    mockedUpload.mockResolvedValueOnce({
      signature_url: "/api/signatures/1",
      message: "Tanda tangan berhasil diunggah.",
    });
    mockedFetchUrl.mockResolvedValueOnce("blob:new-signature");
    renderProfile();

    const file = new File(["png-bytes"], "ttd.png", { type: "image/png" });
    await userEvent.upload(signatureInput(), file);

    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Tanda tangan berhasil diunggah.");
    });
    expect(screen.queryByText(/mengunggah…/i)).toBeNull();
  });

  it("upload gagal non-validation → toast error pesan server", async () => {
    mockedUpload.mockRejectedValueOnce(
      new ApiError("http", "Ukuran file maksimal 2MB.", { status: 422 }),
    );
    renderProfile();

    const file = new File(["png-bytes"], "ttd.png", { type: "image/png" });
    await userEvent.upload(signatureInput(), file);

    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Ukuran file maksimal 2MB.");
    });
  });
});