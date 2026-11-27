// Preload `bun test` (bunfig.toml). Berjalan sebelum file tes mana pun meng-import server/*.
// - Database: file SQLite sementara di folder temp OS (tidak pernah data/ atau database .env / Turso).
// - Jaringan: fetch global diganti perekam; tidak ada tes yang bisa menghubungi Discord / internet.
// - Zona waktu: ESTA_TEST_TZ → process.env.TZ. Di Windows `bun test` mengabaikan TZ dari lingkungan
//   (selalu UTC), tetapi TZ yang diset dari dalam proses dipakai; scripts/test-server.ts menjalankan matriks TZ.
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.ESTA_TEST_TZ) process.env.TZ = process.env.ESTA_TEST_TZ;

// rahasia / konfigurasi dari .env tidak boleh ikut ke tes (skrip juga memakai --no-env-file)
for (const k of [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "DISCORD_WEBHOOK_URL",
  "SITE_URL",
  "VERCEL",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "SESSION_DAYS",
  "SEED_PASSWORD",
  "INSECURE_COOKIE",
]) {
  delete process.env[k];
}

// argon2 murah khusus tes (lihat server/auth.ts); berlaku hanya bila NODE_ENV=test (bawaan `bun test`)
process.env.ESTA_TEST_FAST_HASH = "1";

// Folder tes lama yang tidak bisa dihapus saat keluar (Windows mengunci file database yang masih terbuka)
// dibersihkan pada putaran berikutnya.
for (const name of readdirSync(tmpdir())) {
  if (!name.startsWith("esta-test-")) continue;
  const old = join(tmpdir(), name);
  try {
    if (Date.now() - statSync(old).mtimeMs > 10 * 60_000) rmSync(old, { recursive: true, force: true });
  } catch {
    // masih dipakai putaran lain
  }
}

const dir = mkdtempSync(join(tmpdir(), "esta-test-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.ESTA_TEST_DIR = dir;
process.on("exit", () => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // file database masih terkunci (Windows): biarkan, folder temp OS
  }
});

export type NetCall = { url: string; body: any; init?: RequestInit };
type Responder = (url: string, init?: RequestInit) => Response | Promise<Response>;
const ok: Responder = () => new Response("{}", { status: 200 });

/** Semua panggilan fetch selama tes. `net.respond` bisa diganti per tes (kembalikan ke net.reset()). */
export const net = {
  calls: [] as NetCall[],
  respond: ok,
  reset() {
    this.respond = ok;
  },
};
(globalThis as { __ESTA_NET__?: typeof net }).__ESTA_NET__ = net;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  let body: any = null;
  try {
    body = init?.body ? JSON.parse(String(init.body)) : null;
  } catch {
    body = String(init?.body);
  }
  net.calls.push({ url, body, init });
  return net.respond(url, init);
}) as typeof fetch;
