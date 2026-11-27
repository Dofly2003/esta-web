import { defineConfig, passthroughImageService } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import bunAdapter from "./adapter/index.mjs";

const apiPort = process.env.API_PORT || 3001;

export default defineConfig({
  output: "server",
  adapter: bunAdapter(),
  // Form dikirim ke backend Bun (/api), bukan ke halaman Astro
  security: { checkOrigin: false },
  server: { port: 4321 },
  // Gambar portofolio berupa link luar; tidak perlu optimasi sharp
  image: { service: passthroughImageService() },
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Saat development, /api diteruskan ke server Bun
      proxy: { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false, xfwd: true } },
    },
  },
});
