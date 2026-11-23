// Entry PRODUCTION: satu server Bun untuk API + halaman Astro + file statis.
// - Lokal : `bun run build` lalu `bun run start` → http://localhost:3000
// - Vercel: file ini dideteksi otomatis (preset Bun: server.ts + Bun.serve)
// Jalankan `bun run build` dulu: file di bawah dibuat oleh `astro build`.
// @ts-ignore — dist/ baru ada setelah build
import { handler } from "./dist/server/entry.mjs";
import { createFetch } from "./server/app";

const fetch = createFetch(handler as (req: Request) => Promise<Response>);

const server = Bun.serve({
  port: Number(process.env.PORT || 3000),
  fetch: (req, srv) => fetch(req, srv),
  error(e) {
    console.error(e);
    return new Response("Terjadi kesalahan di server.", { status: 500 });
  },
});

console.log(`ESTA berjalan di http://localhost:${server.port}`);
