import { defineMiddleware } from "astro:middleware";
import { api, ApiError } from "./lib/api";
import type { User } from "@shared/types";

// Semua halaman /dashboard wajib login. Data user disimpan di Astro.locals.user.
export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname, search } = ctx.url;
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    try {
      ctx.locals.user = await api<User>(ctx, "/api/me");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        return ctx.redirect(`/login?next=${encodeURIComponent(pathname + search)}`);
      }
      throw e;
    }
  }
  return next();
});
