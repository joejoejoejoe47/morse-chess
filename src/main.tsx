import "@/lib/resilient-gltf";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";
import "./legendary.css";
import { installLegendaryChrome } from "@/lib/legendary/theme";

installLegendaryChrome();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={getRouter()} />
  </StrictMode>,
);
