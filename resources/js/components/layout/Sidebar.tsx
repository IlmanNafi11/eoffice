/**
 * Sidebar — render dinamis dari `NAV_REGISTRY` (frontend-phase1 Phase 2).
 *
 * Aturan spec (§Boundaries — Never): TIDAK ADA hardcode role name di sini.
 * Item yang tampil murni hasil filter `visibleNav(user)`, yaitu
 * `requiredPermission` dicocokkan ke payload `permissions` dari server.
 *
 * Catatan: variant sidebar `radix-nova` TIDAK membungkus `TooltipProvider`
 * sendiri (berbeda dari distribusi shadcn upstream), sedangkan
 * `SidebarMenuButton tooltip=` memakai `Tooltip` — jadi provider dipasang di
 * sini agar tooltip mode collapsed berfungsi.
 */

import { NavLink } from "react-router-dom";
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { visibleNav } from "@/lib/nav-registry";
import { useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/authSlice";

export function Sidebar() {
  const user = useAppSelector(selectUser);
  const items = visibleNav(user);

  return (
    <TooltipProvider>
      <SidebarRoot collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="text-lg font-bold tracking-tight">eOffice</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton asChild tooltip={item.label}>
                      <NavLink to={item.path} end={item.path === "/"}>
                        <item.icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </SidebarRoot>
    </TooltipProvider>
  );
}
