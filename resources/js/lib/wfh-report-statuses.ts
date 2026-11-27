import type { WfhReportStatus } from "@/api/types";

/**
 * Nilai filter status laporan WFH — satu daftar untuk papan monitoring dan
 * daftar laporan tim (keduanya memfilter kolom `status` yang sama; dua salinan
 * literal pernah hidup berdampingan).
 */
export const WFH_REPORT_STATUSES = ["draft", "pending", "approved", "rejected"] as const satisfies readonly WfhReportStatus[];
