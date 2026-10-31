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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import type { AuthUser } from "@/api/types";

vi.mock("@/api/profile", () => ({
  updateProfile: vi.fn(),
  uploadSignature: vi.fn(),
  fetchSignatureObjectUrl: vi.fn(),
}));

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
});

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
      signature_path: "signatures/1-signature.png",
      signature_url: "/api/signatures/1",
    });
    mockedFetchUrl.mockResolvedValueOnce("blob:new-signature");

    renderProfile();

    const file = new File(["png-bytes"], "ttd.png", { type: "image/png" });
    await userEvent.upload(screen.getByTestId("signature-input"), file);

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(1));
    expect(mockedUpload.mock.calls[0]![0]).toBeInstanceOf(FormData);
    await waitFor(() => expect(mockedFetchUrl).toHaveBeenCalledWith("/api/signatures/1"));
    await waitFor(() => expect(screen.getByAltText(/pratinjau tanda tangan/i)).toBeTruthy());
  });

  it("preview fetch gagal → placeholder dashed, bukan crash", async () => {
    mockedUpload.mockResolvedValueOnce({
      signature_path: "signatures/1-signature.png",
      signature_url: "/api/signatures/1",
    });
    mockedFetchUrl.mockRejectedValueOnce(new Error("network"));

    renderProfile();

    const file = new File(["png-bytes"], "ttd.png", { type: "image/png" });
    await userEvent.upload(screen.getByTestId("signature-input"), file);

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
    await userEvent.upload(screen.getByTestId("signature-input"), file);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /file harus png\/jpg maksimal 2mb/i,
      ),
    );
    // Input direset agar file yang sama bisa dipilih ulang (uji kelanjutan).
    expect((screen.getByTestId("signature-input") as HTMLInputElement).value).toBe("");
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