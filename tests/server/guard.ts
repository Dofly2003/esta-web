// Di-import PERTAMA oleh helpers.ts: berhenti sebelum server/db.ts dimuat bila setup.ts (preload) tidak berjalan,
// supaya tes tidak pernah membuka database sungguhan (data/ atau Turso).
if (!process.env.ESTA_TEST_DIR || !process.env.DATABASE_PATH?.startsWith(process.env.ESTA_TEST_DIR)) {
  throw new Error("tests/server/setup.ts belum dimuat: jalankan lewat `bun test` (bunfig.toml memuatnya)");
}
if (process.env.TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL harus kosong saat tes");
export {};
