// Frontend (Astro) → backend (Bun) API.
// Di production keduanya satu proses: panggil handler langsung tanpa jaringan.
// Saat development: fetch ke server Bun di API_ORIGIN (default http://127.0.0.1:3001).
import type { AstroGlobal, APIContext } from "astro";

type Handler = (req: Request) => Promise<Response>;
type Ctx = Pick<AstroGlobal | APIContext, "request">;

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
  const res = direct ? await direct(req) : await fetch(req);
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
