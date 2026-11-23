// Koneksi SQLite (bun:sqlite) + skema. Migrasi sederhana berbasis PRAGMA user_version.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const path = resolve(process.env.DATABASE_PATH || "data/esta.sqlite");
mkdirSync(dirname(path), { recursive: true });

export const db = new Database(path, { create: true, strict: true });
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

const migrations: string[] = [
  /* 1: skema awal */ `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'MEMBER',      -- ADMIN | MEMBER
    discord_id    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
  );
  CREATE TABLE sessions (
    id         TEXT PRIMARY KEY,                       -- sha256(token)
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    client      TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'WEBSITE',
    status      TEXT NOT NULL DEFAULT 'PLANNING',
    description TEXT NOT NULL DEFAULT '',
    budget      INTEGER,
    start_date  TEXT,
    due_date    TEXT,
    lead_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE TABLE tasks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'TODO',
    priority    TEXT NOT NULL DEFAULT 'MEDIUM',
    due_date    TEXT,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX tasks_project ON tasks(project_id);
  CREATE INDEX tasks_assignee ON tasks(assignee_id);
  CREATE TABLE portfolio (
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
    project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE TABLE inquiries (
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
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL                                -- JSON
  );`,
];

const current = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
for (let v = current; v < migrations.length; v++) {
  db.transaction(() => {
    db.exec(migrations[v]!);
    db.exec(`PRAGMA user_version = ${v + 1}`);
  })();
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();
