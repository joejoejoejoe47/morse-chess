import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Static single-page build. The PHP backend (php/) serves dist/ and answers /api/*.
// `base: "./"` keeps asset URLs relative; PHP injects <base href> + window.MORSE_BASE
// so the same build runs at a site root or in a sub-folder such as /chess/.
export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0", port: 8080, proxy: { "/api": "http://127.0.0.1:8099" } },
  resolve: { tsconfigPaths: true },
  build: { modulePreload: false, chunkSizeWarningLimit: 4000 },
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: false }), tailwindcss(), viteReact()],
});
