// Frontend (Astro) → backend (Bun) API.
// Di production keduanya satu proses: panggil handler langsung tanpa jaringan.
// Saat development: fetch ke server Bun di API_ORIGIN (default http://127.0.0.1:3001).
import type { AstroGlobal, APIContext } from "astro";
import type { ErrCode, OkCode } from "@shared/messages";
import type { User } from "@shared/types";

/** server/api.ts handleApi(req, ip, internal): `internal.user` = user yang sudah dicari middleware */
type Handler = (req: Request, ip?: string, internal?: { user: User | null }) => Promise<Response>;
type Ctx = Pick<AstroGlobal | APIContext, "request"> & { locals?: App.Locals };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(ctx: Ctx, path: string): Promise<T> {
  const direct = (globalThis as { __ESTA_API__?: Handler }).__ESTA_API__;
  const origin = direct
    ? "http://internal"
    : process.env.API_ORIGIN || `http://127.0.0.1:${process.env.API_PORT || 3001}`;
  const headers = new Headers({ accept: "application/json" });
  const cookie = ctx.request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const req = new Request(new URL(path, origin), { headers });
  // Satu proses (produksi): sesi sudah dicek middleware untuk request halaman ini, jadi API tidak mencarinya lagi.
  // /api/me (middleware itu sendiri) dan halaman tanpa locals.user tetap mencari sesi dari cookie.
  const user = path !== "/api/me" ? ctx.locals?.user : undefined;
  const res = direct ? await direct(req, "internal", user ? { user } : undefined) : await fetch(req);
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `API ${res.status}`);
  return body as T;
}

/** Sama seperti api(), tapi null bila 404 (untuk halaman detail) */
export async function apiOrNull<T>(ctx: Ctx, path: string): Promise<T | null> {
  try {
    return await api<T>(ctx, path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Path API + query; nilai "", null, undefined dan false dilewati (nilai lain di-encode) */
export function apiPath(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "" && v != null && v !== false) q.set(k, String(v));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** URL halaman dengan kode pesan flash ?ok= / ?err= (teks di shared/messages.ts, ditampilkan oleh Dash.astro) */
export function withFlash(to: string, msg: { ok?: OkCode; err?: ErrCode }) {
  const q = Object.entries(msg)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`);
  return q.length ? `${to}${to.includes("?") ? "&" : "?"}${q.join("&")}` : to;
}
