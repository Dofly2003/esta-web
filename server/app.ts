// Penangan request produksi: /api → backend, file statis dari dist/client, sisanya → halaman Astro.
import { join, normalize } from "node:path";
import { handleApi } from "./api";
import { compress } from "./compress";
import { envOf } from "./env";
import { secure } from "./headers";

type PageHandler = (req: Request) => Promise<Response>;
type Server = { requestIP(req: Request): { address: string } | null };

// Halaman Astro memanggil API langsung (tanpa jaringan) karena berjalan di proses yang sama
(globalThis as { __ESTA_API__?: typeof handleApi }).__ESTA_API__ = handleApi;

export function createFetch(pages: PageHandler | null, clientDir = join(process.cwd(), "dist", "client")) {
  async function serveStatic(req: Request, pathname: string) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return null; // escape % rusak: bukan file statis (halaman Astro yang menjawab, mis. 404)
    }
    const path = normalize(join(clientDir, decoded));
    if (!path.startsWith(clientDir) || pathname.endsWith("/")) return null;
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    const immutable = pathname.startsWith("/_astro/");
    // file tanpa hash (favicon, font, gambar): validasi ulang murah setelah max-age (304 tanpa isi)
    const etag = `W/"${file.size.toString(36)}-${file.lastModified.toString(36)}"`;
    const headers = {
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600",
      ETag: etag,
    };
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return new Response(file, { headers });
  }

  async function respond(req: Request, url: URL, server?: Server) {
    const { pathname } = url;
    // Di Vercel IP asli ada di x-forwarded-for (diisi proxy Vercel); di server sendiri pakai IP koneksi
    const forwarded = envOf("VERCEL") ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : null;
    const ip = forwarded || server?.requestIP(req)?.address || "unknown";
    if (pathname === "/api" || pathname.startsWith("/api/")) return handleApi(req, ip);
    if (!pages) return new Response("Halaman dilayani oleh `astro dev` di http://localhost:4321", { status: 404 });
    if (req.method === "GET" || req.method === "HEAD") {
      const file = await serveStatic(req, pathname);
      if (file) return compress(req, file, pathname.startsWith("/_astro/") ? pathname : undefined);
    }
    return pages(req);
  }

  return async function fetch(req: Request, server?: Server) {
    const url = new URL(req.url);
    const res = secure(req, url, await respond(req, url, server));
    // file statis sudah dikompres di respond (dengan cache); sisanya: HTML / JSON dinamis
    return res.headers.has("content-encoding") ? res : compress(req, res);
  };
}
