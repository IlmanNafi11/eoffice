/**
 * ThemeToggle — kontrol tema Terang/Gelap/Sistem di header (modul `theme-modes`,
 * Task 8). Memakai `next-themes`: `setTheme` menulis localStorage key `theme`
 * dan men-set class `dark` pada `documentElement`; nilai `system` mengikuti
 * `prefers-color-scheme`. Toast (`components/ui/sonner.tsx`) ikut tema karena
 * membaca `useTheme()` dari provider yang sama.
 */
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEME_OPTIONS = [
  { value: "light", label: "Terang", icon: Sun },
  { value: "dark", label: "Gelap", icon: Moon },
  { value: "system", label: "Sistem", icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // Sebelum ter-mount `theme` undefined → tampilkan Sistem (nilai default
  // provider) agar ikon tidak berganti-ganti saat hidrasi.
  const active =
    THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2];
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="theme-toggle"
          aria-label="Tema"
        >
          <ActiveIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={active.value}
          onValueChange={setTheme}
        >
          {THEME_OPTIONS.map(({ value, label, icon: OptionIcon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <OptionIcon aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
