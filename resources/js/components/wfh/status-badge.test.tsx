/**
 * Unit test `status-badge` (frontend-phase2 — modul wfh-reports).
 * Kontrak yang dijaga (spec §Code Style, §Testing Strategy):
 * - Peta `status → label` bahasa Indonesia terpusat di sini (dipakai juga
 *   monitoring/team-reports nanti).
 * - `WfhReportStatus` adalah union literal: keempat nilai wajib punya label
 *   (hilang satu = tipe tidak lagi sinkron dengan kontrak).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WfhReportStatus } from "@/api/types";
import { WFH_STATUS_LABELS, WfhStatusBadge } from "./status-badge";

const CASES: Array<[WfhReportStatus, string]> = [
  ["draft", "Draf"],
  ["pending", "Menunggu persetujuan"],
  ["approved", "Disetujui"],
  ["rejected", "Ditolak"],
];

describe("WfhStatusBadge", () => {
  it.each(CASES)('status %s menampilkan label Indonesia "%s"', (status, label) => {
    render(<WfhStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("peta label mencakup tepat keempat status union", () => {
    expect(Object.keys(WFH_STATUS_LABELS).sort()).toEqual(
      ["approved", "draft", "pending", "rejected"],
    );
  });
});