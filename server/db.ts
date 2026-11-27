// Koneksi database lewat libSQL:
// - Lokal  : file SQLite (DATABASE_PATH, default data/esta.sqlite)
// - Online : Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN) — SQLite di cloud
import { createClient, type InArgs, type Row } from "@libsql/client";
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

async function migrate() {
  if (!isRemote) await client.executeMultiple("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  await client.execute(
    "CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const done = (await client.execute("SELECT COALESCE(MAX(version), 0) AS v FROM _migrations")).rows[0]!.v as number;
  for (let v = done; v < migrations.length; v++) {
    await client.executeMultiple(migrations[v]!);
    await client.execute({ sql: "INSERT INTO _migrations (version, applied_at) VALUES (?, ?)", args: [v + 1, now()] });
  }
}

/** Selesai saat skema siap. Semua query menunggu ini. */
export const ready = migrate();

export async function rows(sql: string, args: InArgs = {}): Promise<Row[]> {
  await ready;
  return (await client.execute({ sql, args })).rows;
}

export async function first(sql: string, args: InArgs = {}): Promise<Row | null> {
  return (await rows(sql, args))[0] ?? null;
}

export async function run(sql: string, args: InArgs = {}) {
  await ready;
  await client.execute({ sql, args });
}

/** Beberapa perintah tulis sekaligus secara atomik */
export async function batch(stmts: { sql: string; args?: InArgs }[]) {
  await ready;
  await client.batch(
    stmts.map((s) => ({ sql: s.sql, args: s.args ?? {} })),
    "write",
  );
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();
