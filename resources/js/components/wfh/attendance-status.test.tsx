/**
 * Unit test `attendance-status` — kolom ringkasan absensi per sesi aktif.
 * Kontrak: tiap sesi dari `sessions` dirender sebagai pill; sudah absen
 * (`checked_in`) → pill hijau + aria "sudah absen"; belum → pill muted +
 * "belum absen"; absensi di luar sesi aktif diabaikan; sesi kosong → tanda —.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WfhAttendance, WfhSession } from "@/api/types";
import { WfhAttendanceStatus } from "./attendance-status";

const sessions: WfhSession[] = ["pagi", "siang", "sore"];

function attendance(
  session: WfhSession,
  checkedIn: boolean,
): WfhAttendance {
  return { id: session === "pagi" ? 1 : 2, session, checked_in: checkedIn };
}

describe("WfhAttendanceStatus", () => {
  it("menampilkan pill per sesi aktif dengan status absen/belum", () => {
    render(
      <WfhAttendanceStatus
        sessions={sessions}
        attendances={[attendance("pagi", true), attendance("siang", true)]}
      />,
    );

    expect(screen.getByLabelText("Pagi sudah absen")).toBeTruthy();
    expect(screen.getByLabelText("Siang sudah absen")).toBeTruthy();
    expect(screen.getByLabelText("Sore belum absen")).toBeTruthy();
    expect(screen.getByTestId("wfh-attendance-status").getAttribute("aria-label")).toBe(
      "Absensi 2 dari 3 sesi",
    );
  });

  it("tanpa absensi sama sekali → semua pill belum absen", () => {
    render(<WfhAttendanceStatus sessions={sessions} attendances={[]} />);

    expect(screen.getByLabelText("Pagi belum absen")).toBeTruthy();
    expect(screen.getByLabelText("Siang belum absen")).toBeTruthy();
    expect(screen.getByLabelText("Sore belum absen")).toBeTruthy();
  });

  it("absensi di luar sesi aktif diabaikan", () => {
    render(
      <WfhAttendanceStatus
        sessions={["pagi"]}
        attendances={[attendance("sore", true)]}
      />,
    );

    expect(screen.getByLabelText("Pagi belum absen")).toBeTruthy();
    expect(screen.queryByLabelText(/Sore/)).toBeNull();
  });

  it("konfigurasi sesi kosong → tanda — dan tanpa pill", () => {
    render(<WfhAttendanceStatus sessions={[]} attendances={[]} />);

    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByTestId("wfh-attendance-status")).toBeNull();
  });
});
