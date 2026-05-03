import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { wasp } from "wasp/client/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [wasp(), tailwindcss()],
  resolve: {
    // Vite 7 Rollup does not resolve the SDK's self-import `wasp/universal/ansiColors`
    // from `wasp/env/validation` without an explicit alias.
    alias: {
      "wasp/universal/ansiColors": path.resolve(
        __dirname,
        "node_modules/wasp/dist/universal/ansiColors.js",
      ),
    },
  },
  server: {
    open: true,
    /** Lets phones on the same LAN open `http://<your-ip>:3000` (see `.env.client.example`). */
    host: true,
    /** Without this, Vite may reject requests when the Host header is your LAN IP. */
    allowedHosts: true,
  },
})
