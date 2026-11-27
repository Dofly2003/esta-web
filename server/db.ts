// Koneksi database lewat libSQL:
// - Lokal  : file SQLite (DATABASE_PATH, default data/esta.sqlite)
// - Online : Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN) — SQLite di cloud
import { createClient, type Client, type InArgs, type Row } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const remote = process.env.TURSO_DATABASE_URL;
let url = remote;
if (!url) {
  const path = resolve(process.env.DATABASE_PATH || "data/esta.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  url = "file:" + path.replace(/\\/g, "/");
}

export const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: "number" });
const isRemote = !!remote;

const migrations: string[] = [
  /* 1: skema awal */ `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'MEMBER',
    discord_id    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    client      TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'WEBSITE',
    status      TEXT NOT NULL DEFAULT 'PLANNING',
    description TEXT NOT NULL DEFAULT '',
    budget      INTEGER,
    start_date  TEXT,
    due_date    TEXT,
    lead_id     TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'TODO',
    priority    TEXT NOT NULL DEFAULT 'MEDIUM',
    due_date    TEXT,
    project_id  TEXT NOT NULL,
    assignee_id TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS tasks_assignee ON tasks(assignee_id);
  CREATE TABLE IF NOT EXISTS portfolio (
    id          TEXT PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    client      TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL DEFAULT 'Website',
    year        INTEGER NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '',
    cover_color TEXT NOT NULL DEFAULT '#6d5efc',
    image_url   TEXT,
    live_url    TEXT,
    featured    INTEGER NOT NULL DEFAULT 0,
    published   INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    project_id  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inquiries (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    company    TEXT NOT NULL DEFAULT '',
    service    TEXT NOT NULL DEFAULT '',
    budget     TEXT NOT NULL DEFAULT '',
    message    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'NEW',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,
];

const appliedVersion = async (c: Pick<Client, "execute">) =>
  Number((await c.execute("SELECT COALESCE(MAX(version), 0) AS v FROM _migrations")).rows[0]!.v);

/**
 * Terapkan migrasi yang belum ada. Aman bila beberapa instance cold start bersamaan (Vercel + Turso, atau dua
 * proses pada file yang sama): tiap versi dijalankan di dalam transaksi tulis, versinya dicek ulang di dalam
 * transaksi, dan pencatatan memakai INSERT OR IGNORE. Pernyataan migrasi sebaiknya tetap idempoten
 * (CREATE … IF NOT EXISTS).
 */
export async function migrate(c: Client = client, local = !isRemote) {
  // busy_timeout dulu: proses lain yang sedang menulis ditunggu, bukan langsung SQLITE_BUSY.
  // Klien file libSQL membuka koneksi BARU setelah transaksi, jadi busy_timeout dipasang lagi sesudahnya.
  const busyTimeout = () => (local ? c.execute("PRAGMA busy_timeout = 5000") : null);
  await busyTimeout();
  if (local) await c.execute("PRAGMA journal_mode = WAL");
  await c.execute("CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  while ((await appliedVersion(c)) < migrations.length) {
    const tx = await c.transaction("write");
    try {
      const v = await appliedVersion(tx);
      if (v < migrations.length) {
        await tx.executeMultiple(migrations[v]!);
        await tx.execute({
          sql: "INSERT OR IGNORE INTO _migrations (version, applied_at) VALUES (?, ?)",
          args: [v + 1, now()],
        });
      }
      await tx.commit();
    } finally {
      tx.close();
      await busyTimeout();
    }
  }
}

/** fn dijalankan sekali; bila gagal (mis. jaringan putus saat cold start), panggilan berikutnya mencoba lagi
 * (tidak tersangkut di promise yang ditolak selamanya) */
export function retryingOnce<T>(fn: () => Promise<T>) {
  let pending: Promise<T> | null = null;
  return () =>
    (pending ??= fn().catch((e) => {
      pending = null;
      throw e;
    }));
}

/** Selesai saat skema siap. Semua query menunggu ini; bila migrasi gagal, query berikutnya mencoba lagi. */
export const ready = retryingOnce(() => migrate());

export async function rows(sql: string, args: InArgs = {}): Promise<Row[]> {
  await ready();
  return (await client.execute({ sql, args })).rows;
}

export async function first(sql: string, args: InArgs = {}): Promise<Row | null> {
  return (await rows(sql, args))[0] ?? null;
}

export async function run(sql: string, args: InArgs = {}) {
  await ready();
  await client.execute({ sql, args });
}

/** Satu perintah SQL dengan argumen (untuk batch) */
export type Stmt = { sql: string; args?: InArgs };

/** Beberapa perintah tulis sekaligus secara atomik */
export async function batch(stmts: Stmt[]) {
  await ready();
  await client.batch(
    stmts.map((s) => ({ sql: s.sql, args: s.args ?? {} })),
    "write",
  );
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();
