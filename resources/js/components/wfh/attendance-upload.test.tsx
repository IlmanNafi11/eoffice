/**
 * Unit test `attendance-upload` (frontend-phase2 — modul wfh-reports).
 * Kontrak yang dijaga (plan Task "Primitives shared", spec §Boundaries):
 * - upload foto per sesi via callback `onUpload({session, photo: File})`;
 * - preview foto = fetch ber-otorisasi: `fetchAttendanceObjectUrl` memakai
 *   httpClient (interceptor menempelkan bearer) — BUKAN `<img src>` telanjang
 *   (regresi 0d51f6f6);
 * - `Hapus` memanggil `onDelete(attendance.id)`;
 * - tanpa `canEdit` → tidak ada aksi edit (tombol/input disembunyikan).
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WfhAttendance, WfhSession } from "@/api/types";
import { httpClient } from "@/api/client";
import { fetchAttendanceObjectUrl, AttendanceUploadList } from "./attendance-upload";

function attendance(partial: Partial<WfhAttendance> & { session: WfhSession }): WfhAttendance {
  return partial;
}

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
afterAll(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:stub-${Math.random().toString(36).slice(2)}`);
  URL.revokeObjectURL = vi.fn();
  window.localStorage.clear();
});

describe("fetchAttendanceObjectUrl", () => {
  it("mengambil bytes lewat httpClient ber-bearer, bukan <img> polos", async () => {
    const requests: Array<{ method?: string; url?: string; headers: Record<string, unknown> }> = [];
    httpClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      requests.push({ method: config.method, url: config.url, headers: { ...config.headers } });
      return Promise.resolve({
        status: 200,
        data: new Blob(["jpg"], { type: "image/jpeg" }),
        headers: {},
        config,
      } as AxiosResponse);
    };
    window.localStorage.setItem("auth_token", "tok-photo");

    const url = await fetchAttendanceObjectUrl("/wfh/reports/23/attendances/45/photo");

    expect(url).toMatch(/^blob:/);
    expect(requests[0]?.headers["Authorization"]).toBe("Bearer tok-photo");
  });
});

describe("AttendanceUploadList", () => {
  it("sesi tanpa absensi → input upload; file terpilih memanggil onUpload dengan File", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(
      <AttendanceUploadList
        sessions={["pagi", "siang"]}
        attendances={[]}
        canEdit
        onUpload={onUpload}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/pagi/i)).toBeTruthy();
    expect(screen.getByText(/siang/i)).toBeTruthy();

    const file = new File(["jpg"], "pagi.jpg", { type: "image/jpeg" });
    const inputs = screen.getAllByLabelText(/unggah foto/i);
    await userEvent.upload(inputs[0]!, file);
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith({ session: "pagi", photo: file }));
  });

  it("sesi ber-absensi menampilkan preview via objectURL", async () => {
    const create = vi.mocked(URL.createObjectURL);
    render(
      <AttendanceUploadList
        sessions={["pagi"]}
        attendances={[attendance({ id: 45, session: "pagi", checked_in: true, photo_url: "/wfh/reports/23/attendances/45/photo" })]}
        canEdit
        onUpload={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(screen.getByAltText(/absensi sesi pagi/i)).toBeTruthy();
  });

  it("Hapus memanggil onDelete(attendance.id)", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <AttendanceUploadList
        sessions={["pagi"]}
        attendances={[attendance({ id: 45, session: "pagi", checked_in: true, photo_url: null })]}
        canEdit
        onUpload={vi.fn()}
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /hapus/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(45));
  });

  it("tanpa canEdit → tak ada tombol Hapus / input upload", () => {
    render(
      <AttendanceUploadList
        sessions={["pagi"]}
        attendances={[attendance({ id: 45, session: "pagi", checked_in: true, photo_url: null })]}
        canEdit={false}
        onUpload={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /hapus/i })).toBeNull();
    expect(screen.queryByLabelText(/unggah foto/i)).toBeNull();
  });

  it("upload gagal → spinner berhenti (uploading reset) dan callback reject tidak membekukan UI", async () => {
    const onUpload = vi.fn().mockRejectedValueOnce(new Error("Foto terlalu besar"));
    render(
      <AttendanceUploadList
        sessions={["pagi"]}
        attendances={[]}
        canEdit
        onUpload={onUpload}
        onDelete={vi.fn()}
      />,
    );

    const file = new File(["x"], "pagi.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText(/unggah foto/i), file);
    await waitFor(() => expect(onUpload).toHaveBeenCalled());

    // finally mengembalikan `uploading` → label "Unggah foto" kembali aktif.
    await waitFor(() => {
      expect(screen.getByText(/unggah foto/i)).toBeTruthy();
    });
  });

});