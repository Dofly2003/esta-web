// Server utama (Bun vanilla).
// - Development: hanya API di port 3001; halaman dilayani `astro dev` (port 4321) yang mem-proxy /api ke sini.
// - Production : satu proses di PORT (default 3000) untuk API + file statis + halaman Astro (SSR).
import { join, normalize } from "node:path";
import { handleApi } from "./api";

const prod = process.env.NODE_ENV === "production";
const port = Number(prod ? process.env.PORT || 3000 : process.env.API_PORT || 3001);

// Halaman Astro memanggil API langsung (tanpa jaringan) bila berjalan di proses yang sama
(globalThis as { __ESTA_API__?: typeof handleApi }).__ESTA_API__ = handleApi;

type AstroHandler = (req: Request) => Promise<Response>;
let astro: AstroHandler | null = null;
const clientDir = join(import.meta.dir, "..", "dist", "client");

if (prod) {
  const entry = join(import.meta.dir, "..", "dist", "server", "entry.mjs");
  try {
    astro = ((await import(entry)) as { handler: AstroHandler }).handler;
  } catch (e) {
    console.error("Build Astro tidak ditemukan. Jalankan `bun run build` dulu.\n", e);
    process.exit(1);
  }
}

async function serveStatic(pathname: string) {
  const path = normalize(join(clientDir, decodeURIComponent(pathname)));
  if (!path.startsWith(clientDir)) return null;
  const file = Bun.file(path);
  if (!(await file.exists()) || pathname.endsWith("/")) return null;
  const immutable = pathname.startsWith("/_astro/");
  return new Response(file, {
    headers: { "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600" },
  });
}

const server = Bun.serve({
  port,
  hostname: prod ? "0.0.0.0" : "127.0.0.1",
  async fetch(req, srv) {
    const { pathname } = new URL(req.url);
    const ip = srv.requestIP(req)?.address ?? "unknown";
    if (pathname === "/api" || pathname.startsWith("/api/")) return handleApi(req, ip);
    if (!astro) return new Response("Halaman dilayani oleh `astro dev` di http://localhost:4321", { status: 404 });
    if (req.method === "GET" || req.method === "HEAD") {
      const file = await serveStatic(pathname);
      if (file) return file;
    }
    return astro(req);
  },
  error(e) {
    console.error(e);
    return new Response("Terjadi kesalahan di server.", { status: 500 });
  },
});

console.log(
  prod
    ? `ESTA berjalan di http://localhost:${server.port}`
    : `API ESTA (dev) di http://127.0.0.1:${server.port} — buka website di http://localhost:4321`,
);
