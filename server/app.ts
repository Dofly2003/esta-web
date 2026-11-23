// Penangan request produksi: /api → backend, file statis dari dist/client, sisanya → halaman Astro.
import { join, normalize } from "node:path";
import { handleApi } from "./api";

type PageHandler = (req: Request) => Promise<Response>;
type Server = { requestIP(req: Request): { address: string } | null };

// Halaman Astro memanggil API langsung (tanpa jaringan) karena berjalan di proses yang sama
(globalThis as { __ESTA_API__?: typeof handleApi }).__ESTA_API__ = handleApi;

export function createFetch(pages: PageHandler | null, clientDir = join(process.cwd(), "dist", "client")) {
  async function serveStatic(pathname: string) {
    const path = normalize(join(clientDir, decodeURIComponent(pathname)));
    if (!path.startsWith(clientDir) || pathname.endsWith("/")) return null;
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    const immutable = pathname.startsWith("/_astro/");
    return new Response(file, {
      headers: { "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600" },
    });
  }

  return async function fetch(req: Request, server?: Server) {
    const { pathname } = new URL(req.url);
    // Di Vercel IP asli ada di x-forwarded-for (diisi proxy Vercel); di server sendiri pakai IP koneksi
    const forwarded = process.env.VERCEL ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : null;
    const ip = forwarded || server?.requestIP(req)?.address || "unknown";
    if (pathname === "/api" || pathname.startsWith("/api/")) return handleApi(req, ip);
    if (!pages) return new Response("Halaman dilayani oleh `astro dev` di http://localhost:4321", { status: 404 });
    if (req.method === "GET" || req.method === "HEAD") {
      const file = await serveStatic(pathname);
      if (file) return file;
    }
    return pages(req);
  };
}
