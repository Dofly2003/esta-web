import { defineConfig, passthroughImageService } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import bunAdapter from "./adapter/index.mjs";

const apiPort = process.env.API_PORT || 3001;

/** Hash SHA-256 isi setiap `<script is:inline>` di src/ (Astro hanya meng-hash skrip yang dibundelnya sendiri).
 * Mengubah isi skrip inline otomatis memperbarui hash-nya saat build; skrip inline BARU juga otomatis ikut. */
function inlineScriptHashes(dir = "src") {
  const out = new Set();
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".astro")) continue;
    const src = readFileSync(join(entry.parentPath, entry.name), "utf8");
    for (const m of src.matchAll(/<script\b[^>]*\bis:inline\b[^>]*>([\s\S]*?)<\/script>/g)) {
      out.add(`sha256-${createHash("sha256").update(m[1]).digest("base64")}`);
    }
  }
  return [...out];
}

export default defineConfig({
  output: "server",
  adapter: bunAdapter(),
  security: {
    // Form dikirim ke backend Bun (/api), bukan ke halaman Astro
    checkOrigin: false,
    // CSP per halaman (header Content-Security-Policy di halaman SSR): skrip & <style> hasil bundel Astro di-hash
    // otomatis, skrip is:inline lewat inlineScriptHashes(). Atribut style="" (cover karya, GSAP) diizinkan
    // lewat style-src-attr. Gambar karya berupa link luar mana pun.
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob: https: http:",
        "font-src 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
      ],
      scriptDirective: { resources: ["'self'"], hashes: inlineScriptHashes() },
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: "attribute" }],
      },
    },
  },
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
