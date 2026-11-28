// Tes server (`bun test`, tests/server) di beberapa zona waktu: `bun run test:server`.
// Setiap putaran = proses terpisah dengan database sementara sendiri (tests/server/setup.ts).
// TZ diteruskan lewat ESTA_TEST_TZ karena di Windows `bun test` mengabaikan TZ dari lingkungan;
// setup.ts memasangnya ke process.env.TZ, dan tests/server/tz.test.ts memastikan TZ itu benar-benar berlaku.
// Argumen tambahan diteruskan ke `bun test` (mis. nama file atau -t "pola").
const ZONES = ["UTC", "Asia/Jakarta", "America/Los_Angeles", "Pacific/Kiritimati"];

// `bun run` bisa memuat .env: jangan teruskan database / rahasia ke tes (setup.ts juga menghapusnya)
const env: Record<string, string | undefined> = { ...process.env };
for (const k of ["DATABASE_PATH", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "DISCORD_WEBHOOK_URL", "SITE_URL"])
  delete env[k];

const results: { tz: string; ok: boolean; summary: string }[] = [];
for (const tz of ZONES) {
  console.log(`\n=== TZ=${tz} ===`);
  const p = Bun.spawn(["bun", "test", "--no-env-file", ...process.argv.slice(2)], {
    env: { ...env, ESTA_TEST_TZ: tz },
    stdout: "inherit",
    stderr: "pipe",
  });
  // bun test menulis ringkasan ke stderr: teruskan, dan simpan baris "N pass / N fail"
  const err = await new Response(p.stderr).text();
  process.stderr.write(err);
  const code = await p.exited;
  const summary = err
    .split("\n")
    .filter((l) => /^\s*\d+ (pass|fail)$/.test(l))
    .map((l) => l.trim())
    .join(", ");
  results.push({ tz, ok: code === 0, summary });
}

console.log("\n=== ringkasan ===");
for (const r of results) console.log(`${r.ok ? "OK  " : "GAGAL"} ${r.tz.padEnd(20)} ${r.summary}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
export {};
