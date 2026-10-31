import { createRoot } from "react-dom/client";
import "@/components/ui/button";

const rootEl = document.getElementById("app");
if (!rootEl) {
  throw new Error("Root element #app not found");
}

createRoot(rootEl).render(
  <div className="p-8">
    <h1 className="text-3xl font-bold text-blue-600">eoffice SPA — fase 1</h1>
  </div>,
);
