import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { wasp } from 'wasp/client/vite'

export default defineConfig({
  plugins: [wasp(), tailwindcss()],
  server: {
    open: true,
    /** Lets phones on the same LAN open `http://<your-ip>:3000` (see `.env.client.example`). */
    host: true,
    /** Without this, Vite may reject requests when the Host header is your LAN IP. */
    allowedHosts: true,
  },
})
