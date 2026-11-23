// Konfigurasi Vite+ (`vp check`, `vp lint`, `vp fmt`, `vp test`).
// Dev server & build halaman tetap lewat Astro (yang juga berbasis Vite) — lihat astro.config.mjs.
import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    ignorePatterns: ["dist/**", ".astro/**", "data/**", "node_modules/**"],
  },
  fmt: {
    printWidth: 120,
    ignorePatterns: ["dist/**", ".astro/**", "data/**", "*.astro"],
  },
  test: {
    include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
