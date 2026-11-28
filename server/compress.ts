// Kompresi respons server Bun sendiri (self-host / `bun run start`). Di Vercel edge sudah mengompres (gzip/br),
// jadi di sana TIDAK dikompres dua kali. HTML/JSON dinamis: brotli kualitas 5 (cepat) atau gzip 6; file /_astro
// (nama ber-hash, tidak pernah berubah) dikompres sekali lalu disimpan di memori.
import { brotliCompressSync, constants } from "node:zlib";
import { envOf } from "./env";

const COMPRESSIBLE = /^(?:text\/|application\/(?:json|javascript|xml|manifest\+json)|image\/svg\+xml)/;
/** Di bawah ini kompresi tidak sepadan (header gzip/br + CPU) */
const MIN_BYTES = 1024;
type Encoding = "br" | "gzip";

/** Encoding terbaik yang diterima klien (q=0 = ditolak) */
export function pickEncoding(accept: string | null): Encoding | null {
  if (!accept) return null;
  const ok = new Set<string>();
  for (const part of accept.toLowerCase().split(",")) {
    const [name = "", ...params] = part.trim().split(";");
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    if (q && Number(q.slice(2)) <= 0) continue;
    ok.add(name.trim());
  }
  return ok.has("br") ? "br" : ok.has("gzip") || ok.has("*") ? "gzip" : null;
}

type Bytes = Uint8Array<ArrayBuffer>;
const encode = (body: Bytes, enc: Encoding): Bytes =>
  enc === "br"
    ? brotliCompressSync(body, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 5, [constants.BROTLI_PARAM_SIZE_HINT]: body.byteLength },
      })
    : Bun.gzipSync(body, { level: 6 });

/** Hasil kompresi file statis ber-hash (/_astro/…), per path + encoding */
const staticCache = new Map<string, Bytes>();

/** Kompres respons bila klien mendukung dan isinya teks; `cacheKey` = simpan hasilnya (hanya file yang tidak berubah) */
export async function compress(req: Request, res: Response, cacheKey?: string): Promise<Response> {
  if (envOf("VERCEL")) return res;
  const h = res.headers;
  if (req.method === "HEAD" || !res.body || res.status < 200 || res.status === 204 || res.status === 206) return res;
  if (h.has("content-encoding") || !COMPRESSIBLE.test(h.get("content-type") ?? "")) return res;
  // sudah diputuskan sebelumnya (file statis): jangan dibaca / dikompres lagi
  if (/accept-encoding/i.test(h.get("vary") ?? "")) return res;
  // isi berbeda per Accept-Encoding: cache (browser / proxy) wajib membedakannya, juga untuk respons tanpa kompresi
  h.append("Vary", "Accept-Encoding");
  const enc = pickEncoding(req.headers.get("accept-encoding"));
  if (!enc) return res;
  const key = cacheKey && `${enc}:${cacheKey}`;
  let out = key ? staticCache.get(key) : undefined;
  if (!out) {
    const body = new Uint8Array(await res.arrayBuffer());
    if (body.byteLength < MIN_BYTES)
      return new Response(body, { status: res.status, statusText: res.statusText, headers: h });
    out = encode(body, enc);
    if (key) staticCache.set(key, out);
  } else {
    await res.body.cancel().catch(() => {});
  }
  h.set("Content-Encoding", enc);
  h.delete("Content-Length");
  return new Response(out, { status: res.status, statusText: res.statusText, headers: h });
}
