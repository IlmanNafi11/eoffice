/**
 * TodayCards — seksi "Meja Kerja" beranda (modul dashboard, plan T6).
 *
 * Kontrak:
 * - Menerima `section: DashboardToday | undefined` + `status` fetch mentah;
 *   `undefined` = seksi tidak dirender (backend memilih seksi per permission).
 * - Selama `status === "loading"` setiap kartu diganti Skeleton — tanpa data
 *   lama tidak ada yang bisa ditampilkan; status lain merender data.
 * - Hari non-kerja (`is_workday:false`) → satu status netral tanpa kartu
 *   absensi/rekap (menampilkan "semua orang belum absen" saat libur
 *   menyesatkan, design §Resolved Questions 5).
 * - Kartu rekap (`scope`) hanya ada bila backend mengirimnya; angka selalu
 *   pembilang + penyebut ("3 dari 12 belum absen"), bukan persen telanjang.
 * - Badge status laporan memakai `WfhStatusBadge` — satu peta label + warna
 *   (draft=muted, pending=warning, approved=success, rejected=error).
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WfhStatusBadge } from "@/components/wfh/status-badge";
import type { DashboardFetchStatus } from "@/store/dashboardSlice";
import type { DashboardScopeRecap, DashboardToday } from "@/api/types";

interface TodayCardsProps {
  section: DashboardToday | undefined;
  status: DashboardFetchStatus;
}

/** Kartu absensi diri: "2/3 sesi" + sesi berikutnya (atau lengkap). */
function AttendanceCard({ attendance }: { attendance: NonNullable<DashboardToday["me"]>["attendance"] }) {
  const { sessions_done, sessions_total, next_session } = attendance;
  return (
    <Card data-testid="today-attendance">
      <CardHeader>
        <CardTitle>Absensi hari ini</CardTitle>
        <CardDescription>
          {next_session ? `Sesi berikutnya: ${next_session}` : "Semua sesi selesai"}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-2xl font-semibold tabular-nums">
        {sessions_done}/{sessions_total} sesi
      </CardContent>
    </Card>
  );
}

/** Kartu status laporan WFH hari ini (badge) + tautan detail bila ada. */
function ReportCard({ report }: { report: NonNullable<DashboardToday["me"]>["report"] }) {
  return (
    <Card data-testid="today-report">
      <CardHeader>
        <CardTitle>Laporan WFH</CardTitle>
        <CardDescription>Status laporan hari ini</CardDescription>
      </CardHeader>
      <CardContent>
        {report ? (
          <WfhStatusBadge status={report.status} />
        ) : (
          <span className="text-sm text-muted-foreground">Belum ada laporan hari ini</span>
        )}
      </CardContent>
    </Card>
  );
}

/** Kartu rekap cakupan (hanya pemegang `wfh.monitoring.view` pada hari kerja). */
function ScopeCard({ scope }: { scope: DashboardScopeRecap }) {
  return (
    <Card data-testid="today-scope">
      <CardHeader>
        <CardTitle>Rekap {scope.label}</CardTitle>
        <CardDescription>
          {scope.absent} dari {scope.users_total} belum absen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>
          {scope.no_report} dari {scope.users_total} belum membuat laporan
        </p>
        {scope.team_reports_pending != null && (
          <p>{scope.team_reports_pending} laporan tim menunggu persetujuan</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Skeleton grid — bentuk kartu per seksi selama fetch berjalan. */
function TodaySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="today-skeleton">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-32" data-testid="today-card-skeleton" />
            <Skeleton className="h-3 w-48" data-testid="today-card-skeleton" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-24" data-testid="today-card-skeleton" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TodayCards({ section, status }: TodayCardsProps) {
  if (status === "loading") return <TodaySkeleton />;
  if (!section) return null;

  if (!section.is_workday) {
    return (
      <Card data-testid="today-non-workday">
        <CardHeader>
          <CardTitle>Hari ini bukan hari WFH</CardTitle>
          <CardDescription>Tidak ada absensi atau laporan yang diharapkan hari ini.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const me = section.me;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {me && <AttendanceCard attendance={me.attendance} />}
      {me && <ReportCard report={me.report} />}
      {section.scope && <ScopeCard scope={section.scope} />}
    </div>
  );
}
