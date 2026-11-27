/**
 * Pesan dari `exportTeamWfhPdf`/`exportWfhReportPdf` SUDAH lewat seam: API
 * membungkus pesan blob ter-dekode ke `ApiError` dengan copy aman ("Gagal
 * mengunduh PDF.") dan fallback generik di bawah menutup non-Error. T10
 * dipenuhi — ApiError yang sampai di sini tidak membawa teks axios mentah.
 * Satu salinan dibagi antara MonitoringPage, TeamReportsPage, dan
 * TeamReportDetailPage agar copy tidak berdiferensiasi.
 */
export function pdfErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Gagal mengunduh PDF. Coba lagi.";
}
