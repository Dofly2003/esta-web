// Entry PRODUCTION: satu server Bun untuk API + halaman Astro + file statis.
// - Lokal : `bun run build` lalu `bun run start` → http://localhost:3000
// - Vercel: file ini dideteksi otomatis (preset Bun: server.ts + Bun.serve)
// Jalankan `bun run build` dulu: file di bawah dibuat oleh `astro build`.
// @ts-ignore — dist/ baru ada setelah build
import { handler } from "./dist/server/entry.mjs";
import { MAX_BODY_BYTES } from "./server/api";
import { createFetch } from "./server/app";
import { envOf } from "./server/env";
import { BASE_HEADERS, NON_HTML_CSP } from "./server/headers";

const fetch = createFetch(handler as (req: Request) => Promise<Response>);

const server = Bun.serve({
  port: envOf("PORT"),
  // body form terbesar ≈ 600 KB (lihat MAX_BODY_BYTES di server/api.ts); bawaan Bun 128 MB
  maxRequestBodySize: MAX_BODY_BYTES,
  fetch: (req, srv) => fetch(req, srv),
  error(e) {
    console.error(e);
    return new Response("Terjadi kesalahan di server.", {
      status: 500,
      headers: { ...BASE_HEADERS, "Content-Security-Policy": NON_HTML_CSP },
    });
  },
});

console.log(`ESTA berjalan di http://localhost:${server.port}`);
