// Konfigurasi Vite+ (`vp check`, `vp lint`, `vp fmt`, `vp test`).
// Dev server & build halaman tetap lewat Astro (yang juga berbasis Vite) — lihat astro.config.mjs.
import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    ignorePatterns: ["dist/**", ".astro/**", "data/**", "node_modules/**", ".taste-skill/**"],
    // Lint type-aware + type-check lewat backend TypeScript 7 (tsrs); butuh tsconfig tanpa baseUrl.
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    printWidth: 120,
    ignorePatterns: ["dist/**", ".astro/**", "data/**", ".taste-skill/**", "*.astro"],
  },
  // Tes unit web (`vp test run`, Vitest bawaan Vite+): hanya tests/web. Tes server memakai `bun test`
  // (tests/server, bun:test) dan tidak boleh ikut dijalankan Vitest.
  test: {
    include: ["tests/web/**/*.test.ts"],
    exclude: ["tests/server/**", "node_modules/**", "dist/**"],
    environment: "node",
    // zona waktu server bukan WIB: helper tanggal harus tetap memakai APP_TZ
    env: { TZ: "America/Los_Angeles" },
  },
});
