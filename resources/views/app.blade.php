<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WFH & Change Management - Kominfo Jatimprov</title>
    @viteReactRefresh
    {{-- Anti-flash tema (Task 8): set class `dark` sebelum bundle dieksekusi,
         selaras dengan ThemeProvider next-themes (storageKey "theme",
         default system). --}}
    <script>
      (function () {
        try {
          var stored = localStorage.getItem("theme");
          var dark =
            stored === "dark" ||
            ((stored === null || stored === "system") &&
              window.matchMedia("(prefers-color-scheme: dark)").matches);
          document.documentElement.classList.toggle("dark", dark);
        } catch (e) {}
      })();
    </script>
    @vite(['resources/css/app.css', 'resources/js/app.tsx'])
</head>
<body>
    <div id="app"></div>
</body>
</html>