/**
 * Entry SPA (frontend-phase1).
 * Provider Redux + RouterProvider (peta route di `@/routes`).
 */

import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "react-router-dom";
import { store } from "@/store";
import { router } from "@/routes";

const rootEl = document.getElementById("app");
if (!rootEl) {
  throw new Error("Root element #app not found");
}

createRoot(rootEl).render(
  <Provider store={store}>
    <RouterProvider router={router} />
  </Provider>,
);
