/**
 * AppShell — kerangka shared semua modul (frontend-phase1 Phase 2).
 * Sidebar + Header + `<Outlet/>`. Guard sesi (`ProtectedRoute`) membungkus
 * shell ini di `routes/index.tsx`, jadi di sini hanya layout murni.
 */

import { Outlet } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";

export function AppShell() {
  return (
    <SidebarProvider>
      <Sidebar />
      <SidebarInset>
        <Header />
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
