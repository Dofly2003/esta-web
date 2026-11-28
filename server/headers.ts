// Header keamanan + cache untuk SEMUA respons dari server Bun (API, halaman Astro, file statis).
// File statis di Vercel dilayani CDN dari public/ (tidak lewat sini): header yang sama ada di vercel.json.
// CSP halaman HTML dibuat Astro (astro.config.mjs → security.csp, hash skrip/style per halaman); di sini hanya
// ditambah frame-ancestors bila belum ada, dan CSP ketat untuk respons non-HTML.
import { envOf } from "./env";

/** Header untuk semua respons */
export const BASE_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};
/** JSON / redirect / file statis: tidak boleh menjalankan atau memuat apa pun bila dibuka langsung */
export const NON_HTML_CSP = "default-src 'none'; frame-ancestors 'none'";
/** Halaman HTML tanpa CSP dari Astro (mis. halaman error): minimal anti-clickjacking + tanpa plugin / <base> */
export const FALLBACK_HTML_CSP = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'";
export const HSTS = "max-age=63072000";

/** Halaman publik yang tidak bergantung pada sesi (Site.astro tidak membaca cookie / locals) */
const PUBLIC_PAGES = /^\/(?:|portfolio|portfolio\/[^/]+|contact)\/?$/;
/** Browser selalu cek ulang; CDN (Vercel) boleh menyimpan 60 dtk + 60 dtk basi sambil memperbarui */
export const PUBLIC_PAGE_CACHE = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
};

/** Request lewat HTTPS. x-forwarded-proto hanya dipercaya di Vercel (proxy-nya yang mengisi). */
export function isHttps(req: Request, url: URL) {
  if (url.protocol === "https:") return true;
  return !!envOf("VERCEL") && req.headers.get("x-forwarded-proto") === "https";
}

function mutable(res: Response) {
  try {
    res.headers.set("X-Content-Type-Options", "nosniff");
    return res;
  } catch {
    // header tidak bisa diubah (mis. Response.redirect / respons fetch): salin
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: new Headers(res.headers),
    });
  }
}

/** Tambahkan header keamanan (tanpa menimpa yang sudah diset handler) dan cache CDN halaman publik */
export function secure(req: Request, url: URL, res: Response): Response {
  const out = mutable(res);
  const h = out.headers;
  for (const [k, v] of Object.entries(BASE_HEADERS)) if (!h.has(k)) h.set(k, v);
  const html = (h.get("content-type") ?? "").includes("text/html");
  const csp = h.get("content-security-policy");
  if (csp) {
    if (!/(?:^|;)\s*frame-ancestors\b/.test(csp)) h.set("content-security-policy", `${csp}; frame-ancestors 'none'`);
  } else {
    h.set("content-security-policy", html ? FALLBACK_HTML_CSP : NON_HTML_CSP);
  }
  if (isHttps(req, url)) h.set("Strict-Transport-Security", HSTS);
  if (
    html &&
    out.status === 200 &&
    (req.method === "GET" || req.method === "HEAD") &&
    PUBLIC_PAGES.test(url.pathname) &&
    !h.has("set-cookie") &&
    !h.has("cache-control")
  ) {
    for (const [k, v] of Object.entries(PUBLIC_PAGE_CACHE)) h.set(k, v);
  }
  return out;
}
