import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Content hashes of every model and sound in public/ ("/lego/chars/hulk.glb" -> "1a2b3c4d").
 * asset() adds them as ?v=, so the host can tell browsers and Cloudflare to keep these files
 * for a year (Cache-Control immutable) and a changed file still gets a new URL.
 */
function assetVersions(dir = "public"): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(glb|mp3)$/i.test(e.name)) {
        out["/" + path.relative(dir, p).split(path.sep).join("/")] = createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 8);
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

// Static single-page build. The PHP backend (php/) serves dist/ and answers /api/*.
// `base: "./"` keeps asset URLs relative; PHP injects <base href> + window.MORSE_BASE
// so the same build runs at a site root or in a sub-folder such as /chess/.
export default defineConfig({
  base: "./",
  define: { __ASSET_VERSIONS__: JSON.stringify(assetVersions()) },
  server: { host: "0.0.0.0", port: 8080, proxy: { "/api": "http://127.0.0.1:8099" } },
  resolve: { tsconfigPaths: true },
  build: { modulePreload: false, chunkSizeWarningLimit: 4000 },
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: false }), tailwindcss(), viteReact()],
});
