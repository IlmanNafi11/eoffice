/**
 * Konfigurasi ThemeProvider produksi (ship #23).
 *
 * `app.tsx` dan tes toggle tema dulu mendeklarasikan props yang sama secara
 * terpisah — storage key/default bisa berubah di produksi tanpa ada tes yang
 * ikut merah. Satu sumber: keduanya mengimpor objek ini.
 *
 * Selaras dengan `next-themes` (attribute `class` → `dark` di `<html>`) dan
 * skrip anti-flash inline di `resources/views/app.blade.php` yang membaca
 * kunci localStorage yang SAMA.
 */
export const THEME_STORAGE_KEY = "theme";

export const themeProviderConfig = {
  attribute: "class",
  defaultTheme: "system",
  enableSystem: true,
  storageKey: THEME_STORAGE_KEY,
  disableTransitionOnChange: true,
} as const;
