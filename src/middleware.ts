import { defineMiddleware } from "astro:middleware";
import { api, ApiError } from "./lib/api";
import type { User } from "@shared/types";

const isDash = (p: string) => p === "/dashboard" || p.startsWith("/dashboard/");

/** Halaman tim tidak boleh disimpan cache browser/proxy (juga mematikan bfcache: tombol Back setelah
 * "Keluar" tidak lagi menampilkan data dashboard). */
function noStore(res: Response) {
  try {
    res.headers.set("Cache-Control", "no-store, private");
    return res;
  } catch {
    const h = new Headers(res.headers);
    h.set("Cache-Control", "no-store, private");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }
}

// Semua halaman /dashboard wajib login. Data user disimpan di Astro.locals.user.
export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname, search } = ctx.url;
  if (isDash(pathname)) {
    try {
      ctx.locals.user = await api<User>(ctx, "/api/me");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // cookie sesi ada tapi tidak berlaku lagi → "sesi berakhir"; tanpa cookie → "silakan masuk"
        const err = ctx.cookies.has("esta_session") ? "session-expired" : "login-required";
        return noStore(ctx.redirect(`/login?next=${encodeURIComponent(pathname + search)}&err=${err}`));
      }
      throw e;
    }
  }
  const res = await next();
  return isDash(pathname) || pathname === "/login" ? noStore(res) : res;
});
