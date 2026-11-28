// scripts/import-firestore.ts dijalankan sebagai proses terpisah di folder temp (database & file ekspor sementara).
// Semua tulis dalam SATU transaksi: impor yang gagal tidak meninggalkan database setengah terisi / terhapus.
import { afterAll, describe, expect, test } from "bun:test";
import "./guard";
import { createClient } from "@libsql/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const work = join(process.env.ESTA_TEST_DIR!, "import");
mkdirSync(join(work, "data"), { recursive: true });
const dbFile = join(work, "data", "import.sqlite");
const db = createClient({ url: "file:" + dbFile.replace(/\\/g, "/"), intMode: "number" });
afterAll(() => db.close());

const script = resolve(import.meta.dir, "../../scripts/import-firestore.ts");
async function runImport(data: unknown, ...args: string[]) {
  writeFileSync(join(work, "data", "firestore-export.json"), JSON.stringify(data));
  const p = Bun.spawn(["bun", "--no-env-file", script, ...args], {
    cwd: work,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_PATH: dbFile },
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await p.exited;
  return { code, out: await new Response(p.stdout).text(), err: await new Response(p.stderr).text() };
}
const count = async (table: string) => Number((await db.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]!.n);

const base = {
  users: [
    { id: "u1", name: "Satu", email: "Satu@T.test", role: "ADMIN" },
    { id: "u2", name: "Dua", email: "dua@t.test" },
  ],
  projects: [{ id: "p1", name: "Proyek", client: "K", leadId: "u1", dueDate: "2026-12-01T00:00:00Z" }],
  tasks: [
    { id: "t1", title: "Tugas", projectId: "p1", assigneeId: "u2" },
    { id: "t2", title: "Yatim", projectId: "missing" },
  ],
  portfolio: [
    {
      id: "f1",
      slug: "karya-satu",
      title: "Karya",
      year: 2025,
      coverColor: "red;}</style><script>alert(1)</script>",
      imageUrl: "javascript:alert(1)",
      liveUrl: "//evil.test",
      sortOrder: 1.5,
      projectId: "p1",
    },
    {
      id: "f2",
      slug: "karya-dua",
      title: "Karya 2",
      coverColor: "#123abc",
      imageUrl: "/img/a.jpg",
      liveUrl: "https://x.test",
    },
  ],
  inquiries: [{ id: "q1", name: "Q", email: "q@x.test", message: "m" }],
  settings: [{ id: "discord", webhookUrl: "", enabled: false }],
};

describe("import-firestore", () => {
  test("imports everything; unsafe colour / links / numbers are cleaned", async () => {
    const r = await runImport(base);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toContain("Impor selesai: 2 akun, 1 proyek, 2 tugas, 2 karya, 1 pesan.");
    expect([await count("users"), await count("projects"), await count("tasks"), await count("portfolio")]).toEqual([
      2, 1, 1, 2,
    ]);
    const users = (await db.execute("SELECT email, role FROM users ORDER BY email")).rows;
    expect(users.map((u) => [u.email, u.role])).toEqual([
      ["dua@t.test", "MEMBER"],
      ["satu@t.test", "ADMIN"],
    ]);
    const f1 = (await db.execute("SELECT * FROM portfolio WHERE id = 'f1'")).rows[0]!;
    expect(f1.cover_color).toBe("#6d5efc");
    expect(f1.image_url).toBe(null);
    expect(f1.live_url).toBe(null);
    expect(f1.sort_order).toBe(0);
    const f2 = (await db.execute("SELECT * FROM portfolio WHERE id = 'f2'")).rows[0]!;
    expect([f2.cover_color, f2.image_url, f2.live_url]).toEqual(["#123abc", "/img/a.jpg", "https://x.test"]);
    expect((await db.execute("SELECT due_date FROM projects")).rows[0]!.due_date).toBe("2026-12-01");
    expect((await db.execute("SELECT value FROM settings WHERE key = 'discord'")).rows[0]!.value).toBe(
      JSON.stringify({ webhookUrl: "", enabled: false }),
    );
  }, 60_000);
  test("refuses a non-empty database without --force", async () => {
    const r = await runImport(base);
    expect(r.code).toBe(1);
    expect(r.err).toContain("--force");
    expect(await count("users")).toBe(2);
  }, 60_000);
  test("a failing --force import rolls back completely (old data kept, nothing half-written)", async () => {
    const broken = {
      ...base,
      users: [{ id: "n1", name: "Baru", email: "baru@t.test" }],
      // duplicate slug → UNIQUE constraint fails on the second item, after the wipe and the user insert
      portfolio: [
        { id: "x1", slug: "sama", title: "A" },
        { id: "x2", slug: "sama", title: "B" },
      ],
    };
    const r = await runImport(broken, "--force");
    expect(r.code).not.toBe(0);
    expect(await count("users")).toBe(2);
    expect((await db.execute("SELECT id FROM users WHERE id = 'n1'")).rows.length).toBe(0);
    expect(await count("portfolio")).toBe(2);
    expect(await count("projects")).toBe(1);
  }, 60_000);
  test("--force with valid data replaces the old data", async () => {
    const r = await runImport({ users: [{ id: "n1", name: "Baru", email: "baru@t.test" }] }, "--force");
    expect(r.code).toBe(0);
    expect([await count("users"), await count("projects"), await count("portfolio"), await count("settings")]).toEqual([
      1, 0, 0, 0,
    ]);
  }, 60_000);
});
