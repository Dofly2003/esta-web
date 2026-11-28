// Migrasi aman saat beberapa instance cold start bersamaan, dan `ready` tidak tersangkut setelah gagal.
// Cold start bersamaan diuji dengan PROSES terpisah (seperti instance serverless sungguhan): klien file libSQL
// bersifat sinkron, jadi beberapa klien dalam satu proses tidak mewakili kasus itu.
import { afterAll, describe, expect, test } from "bun:test";
import "./guard";
import { createClient, type Client } from "@libsql/client";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { migrate, retryingOnce } from "../../server/db";

const dir = process.env.ESTA_TEST_DIR!;
const opened: Client[] = [];
const open = (file: string) => {
  const c = createClient({ url: "file:" + join(dir, file).replace(/\\/g, "/"), intMode: "number" });
  opened.push(c);
  return c;
};
afterAll(() => {
  for (const c of opened) c.close();
});

const tables = async (c: Client) =>
  (
    await c.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  ).rows.map((r) => r.name);

/** Satu "instance" baru: proses bun yang meng-import server/db.ts dan menunggu ready() pada file `file` */
function coldStart(file: string) {
  const dbModule = pathToFileURL(resolve(import.meta.dir, "../../server/db.ts")).href;
  const code = `const { ready, rows } = await import(${JSON.stringify(dbModule)}); await ready(); console.log((await rows("SELECT COUNT(*) AS n FROM users"))[0].n);`;
  return Bun.spawn(["bun", "--no-env-file", "-e", code], {
    cwd: dir,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_PATH: join(dir, file) },
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("migrate()", () => {
  test("concurrent cold starts (separate processes) on one fresh database all succeed", async () => {
    const procs = Array.from({ length: 4 }, () => coldStart("cold.sqlite"));
    const codes = await Promise.all(procs.map((p) => p.exited));
    const errors = await Promise.all(procs.map((p) => new Response(p.stderr).text()));
    expect(errors.filter(Boolean)).toEqual([]);
    expect(codes).toEqual([0, 0, 0, 0]);
    const outs = await Promise.all(procs.map((p) => new Response(p.stdout).text()));
    expect(outs.map((s) => s.trim())).toEqual(["0", "0", "0", "0"]);
    const c = open("cold.sqlite");
    const v = await c.execute("SELECT version FROM _migrations ORDER BY version");
    expect(v.rows.map((r) => r.version)).toEqual([1, 2]);
    expect(await tables(c)).toEqual([
      "_migrations",
      "inquiries",
      "portfolio",
      "projects",
      "sessions",
      "settings",
      "tasks",
      "users",
    ]);
  }, 30_000);
  test("re-running on an up-to-date database is a no-op", async () => {
    const c = open("cold.sqlite");
    await migrate(c, true);
    await migrate(c, true);
    expect((await c.execute("SELECT COUNT(*) AS n FROM _migrations")).rows[0]!.n).toBe(2);
  });
  test("another instance records the version between our check and our write: no UNIQUE error", async () => {
    const real = open("race.sqlite");
    await migrate(real, true);
    // this instance read "version 0" just before the other instance committed version 1
    let stale = true;
    const racing = {
      execute: (stmt: Parameters<Client["execute"]>[0]) => {
        if (stale && typeof stmt === "string" && stmt.includes("MAX(version)")) {
          stale = false;
          return Promise.resolve({ rows: [{ v: 0 }] });
        }
        return real.execute(stmt);
      },
      executeMultiple: (sql: string) => real.executeMultiple(sql),
      transaction: (mode: "write") => real.transaction(mode),
    } as unknown as Client;
    await migrate(racing, true);
    expect(stale).toBe(false);
    expect((await real.execute("SELECT COUNT(*) AS n FROM _migrations")).rows[0]!.n).toBe(2);
  });
  test("schema present but version row missing (crash before the record): migrates again without error", async () => {
    const c = open("half.sqlite");
    await migrate(c, true);
    await c.execute("DELETE FROM _migrations");
    await migrate(c, true);
    expect((await c.execute("SELECT COUNT(*) AS n FROM _migrations")).rows[0]!.n).toBe(2);
    expect((await tables(c)).length).toBe(8);
  });
  test("migration 2 creates the list / summary indexes (idempotent)", async () => {
    const c = open("idx.sqlite");
    await migrate(c, true);
    await migrate(c, true);
    const idx = await c.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'");
    expect(idx.rows.map((r) => r.name as string).sort()).toEqual([
      "inquiries_created",
      "inquiries_status_created",
      "portfolio_project",
      "portfolio_pub_order",
      "sessions_expires",
      "sessions_user",
      "tasks_assignee",
      "tasks_project",
      "tasks_status_project",
    ]);
  });
});

describe("retryingOnce (used for `ready`)", () => {
  test("shares one run while pending, retries after a failure, then stays resolved", async () => {
    let calls = 0;
    const once = retryingOnce(async () => {
      calls++;
      if (calls === 1) throw new Error("cold start failed");
      return "ok";
    });
    const [a, b] = await Promise.allSettled([once(), once()]);
    expect(a.status).toBe("rejected");
    expect(b.status).toBe("rejected");
    expect(calls).toBe(1);
    expect(await once()).toBe("ok");
    expect(await once()).toBe("ok");
    expect(calls).toBe(2);
  });
});
