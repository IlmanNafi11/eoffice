/**
 * Unit test `attachment-list` — galeri lampiran dengan preview gambar.
 *
 * Kontrak yang dijaga:
 * - Setiap lampiran dirender sebagai item bernama + tombol "Unduh" yang
 *   memanggil `onDownload(attachment)`.
 * - Lampiran gambar (image/*): bytes diambil lewat `httpClient` ber-bearer
 *   (bukan `<img src>` telanjang), thumbnail proporsional (`object-contain`),
 *   klik membuka lightbox react-photo-view (`.PhotoView-Portal` muncul).
 * - Non-gambar (pdf): label "Berkas", tanpa elemen preview.
 * - Gagal fetch bytes → placeholder gagal muat, bukan crash.
 * - Unmount me-revoke semua object URL.
 * - Refetch terjadi bila daftar berubah, tidak diulang untuk daftar identik.
 *
 * jsdom tak punya createObjectURL → stub seperti pdf-download.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";

import { httpClient } from "@/api/client";
import { AttachmentList } from "@/components/changes/attachment-list";
import type { PackageAttachment } from "@/api/types";

type QueuedResponse = {
  data: BlobPart;
  contentType: string;
};

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

let queue: QueuedResponse[] = [];
let requests: Array<{ url?: string; auth?: unknown }> = [];

beforeEach(() => {
  queue = [];
  requests = [];
  URL.createObjectURL = vi.fn(
    () => `blob:stub-${Math.random().toString(36).slice(2)}`,
  );
  URL.revokeObjectURL = vi.fn();
  httpClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const headers = AxiosHeaders.from(config.headers);
    requests.push({ url: config.url, auth: headers.get("Authorization") });
    const next = queue.shift();
    return {
      status: 200,
      data: new Blob([next?.data ?? new Uint8Array()], {
        type: next?.contentType ?? "application/octet-stream",
      }),
      headers: {},
      config,
    } as AxiosResponse;
  };
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

const attachments: PackageAttachment[] = [
  { id: 15, url: "/changes/12/attachments/15", sort_order: 1 },
  { id: 16, url: "/changes/12/attachments/16", sort_order: 2 },
];

describe("AttachmentList — daftar + unduh", () => {
  it("merender tiap lampiran bernama + tombol unduh; klik memanggil onDownload", async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<AttachmentList attachments={attachments} onDownload={onDownload} />);

    const item15 = screen.getByTestId("attachment-item-15");
    expect(within(item15).getByText("Lampiran #15")).toBeTruthy();
    await user.click(within(item15).getByRole("button", { name: /unduh/i }));

    expect(onDownload).toHaveBeenCalledWith(attachments[0]);
  });
});

describe("AttachmentList — preview gambar ber-otorisasi", () => {
  it("lampiran gambar dirender sebagai tombol preview berisi img object-contain", async () => {
    queue.push({ data: new Uint8Array([0x89, 0x50]), contentType: "image/png" });

    render(<AttachmentList attachments={[attachments[0]!]} />);

    const item = await screen.findByTestId("attachment-item-15");
    const preview = within(item).getByTestId("attachment-preview-15");
    const img = preview.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.className).toContain("object-contain");
    // Bytes diambil lewat httpClient, src pakai objectURL — bukan endpoint URL.
    expect(img?.getAttribute("src")).toMatch(/^blob:stub-/);
    await waitFor(() => {
      expect(requests[0]?.url).toBe("/changes/12/attachments/15");
    });
  });

  it("klik thumbnail membuka lightbox react-photo-view", async () => {
    queue.push({ data: new Uint8Array([0x89, 0x50]), contentType: "image/png" });
    const user = userEvent.setup();

    render(<AttachmentList attachments={[attachments[0]!]} />);

    await user.click(await screen.findByTestId("attachment-preview-15"));
    await waitFor(() => {
      expect(document.querySelector(".PhotoView-Portal")).toBeTruthy();
    });
  });

  it("fetch bytes gagal → placeholder gagal muat, halaman tidak crash", async () => {
    httpClient.defaults.adapter = () =>
      Promise.reject(new Error("gagal jaringan"));

    render(<AttachmentList attachments={[attachments[0]!]} />);

    const item = await screen.findByTestId("attachment-item-15");
    await waitFor(() => {
      expect(within(item).getByText(/gagal memuat pratinjau/i)).toBeTruthy();
    });
  });
});

describe("AttachmentList — non-gambar & lifecycle", () => {
  it("lampiran non-gambar (pdf) tanpa preview gambar", async () => {
    queue.push({
      data: new Uint8Array([0x25, 0x50]),
      contentType: "application/pdf",
    });

    render(<AttachmentList attachments={[attachments[0]!]} />);

    const item = await screen.findByTestId("attachment-item-15");
    await waitFor(() => {
      expect(requests[0]?.url).toBe("/changes/12/attachments/15");
    });
    expect(within(item).queryByTestId("attachment-preview-15")).toBeNull();
    expect(within(item).getByText("Berkas")).toBeTruthy();
  });

  it("unmount me-revoke semua object URL yang pernah dibuat", async () => {
    queue.push({ data: new Uint8Array([0x89, 0x50]), contentType: "image/png" });

    const view = render(<AttachmentList attachments={[attachments[0]!]} />);
    await screen.findByTestId("attachment-preview-15");

    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("daftar identik pada rerender tidak memicu fetch ulang", async () => {
    queue.push({ data: new Uint8Array([0x89, 0x50]), contentType: "image/png" });

    const view = render(<AttachmentList attachments={[attachments[0]!]} />);
    await screen.findByTestId("attachment-preview-15");
    view.rerender(<AttachmentList attachments={[attachments[0]!]} />);

    await waitFor(() => {
      expect(requests.length).toBe(1);
    });
  });

});

describe("AttachmentList — hapus lampiran (onRemove opsional)", () => {
  it("dengan onRemove → tombol hapus per lampiran memanggil callback", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(undefined);

    render(
      <AttachmentList attachments={attachments} onRemove={onRemove} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Hapus Lampiran #15" }),
    );

    expect(onRemove).toHaveBeenCalledWith(attachments[0]);
  });

  it("tanpa prop onRemove → tidak ada tombol hapus (detail page aman)", () => {
    render(<AttachmentList attachments={attachments} />);

    expect(screen.queryByRole("button", { name: /hapus lampiran/i })).toBeNull();
  });
});
