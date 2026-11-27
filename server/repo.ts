// Akses data (query SQL) — satu-satunya tempat yang menyentuh tabel.
// Hapus berantai ditulis eksplisit (tidak bergantung pada PRAGMA foreign_keys) agar sama di file lokal & Turso.
import type { Row } from "@libsql/client";
import { batch, client, first, newId, now, ready, rows, run } from "./db";
import type { DiscordSettings, Inquiry, PortfolioItem, Project, Task, User } from "../shared/types";

/* ---------- mapper baris → objek ---------- */
const s = (v: unknown) => (v == null ? "" : String(v));
const sn = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => Number(v ?? 0);

const toUser = (r: Row): User => ({
  id: s(r.id),
  name: s(r.name),
  email: s(r.email),
  role: s(r.role),
  discordId: s(r.discord_id),
  createdAt: s(r.created_at),
});
const toProject = (r: Row): Project => ({
  id: s(r.id),
  name: s(r.name),
  client: s(r.client),
  type: s(r.type),
  status: s(r.status),
  description: s(r.description),
  budget: r.budget == null ? null : n(r.budget),
  startDate: sn(r.start_date),
  dueDate: sn(r.due_date),
  leadId: sn(r.lead_id),
  createdAt: s(r.created_at),
  updatedAt: s(r.updated_at),
});
const toTask = (r: Row): Task => ({
  id: s(r.id),
  title: s(r.title),
  description: s(r.description),
  status: s(r.status),
  priority: s(r.priority),
  dueDate: sn(r.due_date),
  projectId: s(r.project_id),
  assigneeId: sn(r.assignee_id),
  createdAt: s(r.created_at),
  updatedAt: s(r.updated_at),
});
const toPortfolio = (r: Row): PortfolioItem => ({
  id: s(r.id),
  slug: s(r.slug),
  title: s(r.title),
  client: s(r.client),
  category: s(r.category),
  year: n(r.year),
  summary: s(r.summary),
  content: s(r.content),
  tags: s(r.tags),
  coverColor: s(r.cover_color),
  imageUrl: sn(r.image_url),
  liveUrl: sn(r.live_url),
  featured: !!n(r.featured),
  published: !!n(r.published),
  sortOrder: n(r.sort_order),
  projectId: sn(r.project_id),
  createdAt: s(r.created_at),
  updatedAt: s(r.updated_at),
});
const toInquiry = (r: Row): Inquiry => ({
  id: s(r.id),
  name: s(r.name),
  email: s(r.email),
  company: s(r.company),
  service: s(r.service),
  budget: s(r.budget),
  message: s(r.message),
  status: s(r.status),
  createdAt: s(r.created_at),
});

const many = async <T>(sql: string, map: (r: Row) => T, args: Record<string, unknown> = {}) =>
  (await rows(sql, args as never)).map(map);
const one = async <T>(sql: string, map: (r: Row) => T, args: Record<string, unknown> = {}) => {
  const r = await first(sql, args as never);
  return r ? map(r) : null;
};
const count = async (sql: string, args: Record<string, unknown> = {}) => n((await first(sql, args as never))?.n);

/** Data tulis = baris tanpa kolom yang diisi otomatis */
type Input<T> = Omit<T, "id" | "createdAt" | "updatedAt">;
/** Kolom otomatis yang boleh diisi saat impor / seed */
type Seed = { id?: string; createdAt?: string; updatedAt?: string };
/** id baru + cap waktu (pakai nilai impor bila ada) */
const stamps = (d: Seed, at = now()) => ({
  id: d.id ?? newId(),
  createdAt: d.createdAt ?? at,
  updatedAt: d.updatedAt ?? at,
});

/* ---------- users ---------- */
export const users = {
  list: () => many("SELECT * FROM users ORDER BY name COLLATE NOCASE", toUser),
  get: async (id: string | null | undefined) => (id ? one("SELECT * FROM users WHERE id = $id", toUser, { id }) : null),
  async byEmail(email: string) {
    const r = await first("SELECT * FROM users WHERE email = $email", { email });
    return r ? { ...toUser(r), passwordHash: s(r.password_hash) } : null;
  },
  async passwordHash(id: string) {
    return sn((await first("SELECT password_hash FROM users WHERE id = $id", { id }))?.password_hash);
  },
  async create(d: {
    id?: string;
    name: string;
    email: string;
    role: string;
    passwordHash: string;
    discordId?: string;
    createdAt?: string;
  }) {
    const id = d.id ?? newId();
    await run(
      `INSERT INTO users (id, name, email, password_hash, role, discord_id, created_at)
       VALUES ($id, $name, $email, $hash, $role, $discord, $at)`,
      {
        id,
        name: d.name,
        email: d.email,
        hash: d.passwordHash,
        role: d.role,
        discord: d.discordId ?? "",
        at: d.createdAt ?? now(),
      },
    );
    return id;
  },
  setPassword: (id: string, hash: string) => run("UPDATE users SET password_hash = $hash WHERE id = $id", { id, hash }),
  /** Password baru dari admin + keluarkan akun itu dari semua sesi (atomik) */
  resetPassword: (id: string, hash: string) =>
    batch([
      { sql: "UPDATE users SET password_hash = $hash WHERE id = $id", args: { id, hash } },
      { sql: "DELETE FROM sessions WHERE user_id = $id", args: { id } },
    ]),
  setRole: (id: string, role: string) => run("UPDATE users SET role = $role WHERE id = $id", { id, role }),
  countAdmins: () => count("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN'"),
  setDiscordId: (id: string, discordId: string) =>
    run("UPDATE users SET discord_id = $discordId WHERE id = $id", { id, discordId }),
  remove: (id: string) =>
    batch([
      { sql: "DELETE FROM sessions WHERE user_id = $id", args: { id } },
      { sql: "UPDATE tasks SET assignee_id = NULL WHERE assignee_id = $id", args: { id } },
      { sql: "UPDATE projects SET lead_id = NULL WHERE lead_id = $id", args: { id } },
      { sql: "DELETE FROM users WHERE id = $id", args: { id } },
    ]),
  count: () => count("SELECT COUNT(*) AS n FROM users"),
};

/* ---------- sesi login ---------- */
export const sessions = {
  create: (id: string, userId: string, expiresAt: string) =>
    run("INSERT INTO sessions (id, user_id, expires_at) VALUES ($id, $userId, $expiresAt)", { id, userId, expiresAt }),
  user: (id: string) =>
    one(
      "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $id AND s.expires_at > $now",
      toUser,
      { id, now: now() },
    ),
  remove: (id: string) => run("DELETE FROM sessions WHERE id = $id", { id }),
  purgeExpired: () => run("DELETE FROM sessions WHERE expires_at <= $now", { now: now() }),
};

/* ---------- proyek ---------- */
export type ProjectInput = Input<Project>;
const projectArgs = (d: ProjectInput) => ({
  name: d.name,
  client: d.client,
  type: d.type,
  status: d.status,
  description: d.description,
  budget: d.budget,
  startDate: d.startDate,
  dueDate: d.dueDate,
  leadId: d.leadId,
});

export const projects = {
  // urutan tampilan ditentukan API (/api/projects?sort=); di sini nama saja agar stabil
  list: () => many("SELECT * FROM projects ORDER BY name COLLATE NOCASE", toProject),
  get: (id: string) => one("SELECT * FROM projects WHERE id = $id", toProject, { id }),
  async create(d: ProjectInput & Seed) {
    const st = stamps(d);
    await run(
      `INSERT INTO projects (id, name, client, type, status, description, budget, start_date, due_date, lead_id, created_at, updated_at)
       VALUES ($id, $name, $client, $type, $status, $description, $budget, $startDate, $dueDate, $leadId, $createdAt, $updatedAt)`,
      { ...projectArgs(d), ...st },
    );
    return st.id;
  },
  setStatus: (id: string, status: string) =>
    run("UPDATE projects SET status = $status, updated_at = $at WHERE id = $id", { id, status, at: now() }),
  update: (id: string, d: ProjectInput) =>
    run(
      `UPDATE projects SET name=$name, client=$client, type=$type, status=$status, description=$description, budget=$budget,
       start_date=$startDate, due_date=$dueDate, lead_id=$leadId, updated_at=$updatedAt WHERE id=$id`,
      { ...projectArgs(d), id, updatedAt: now() },
    ),
  remove: (id: string) =>
    batch([
      { sql: "DELETE FROM tasks WHERE project_id = $id", args: { id } },
      { sql: "UPDATE portfolio SET project_id = NULL WHERE project_id = $id", args: { id } },
      { sql: "DELETE FROM projects WHERE id = $id", args: { id } },
    ]),
};

/* ---------- tugas ---------- */
export type TaskInput = Input<Task>;
const TASK_ORDER = "ORDER BY due_date IS NULL, due_date, created_at";
const taskArgs = (d: Omit<TaskInput, "projectId">) => ({
  title: d.title,
  description: d.description,
  status: d.status,
  priority: d.priority,
  dueDate: d.dueDate,
  assigneeId: d.assigneeId,
});

export const tasks = {
  list: () => many(`SELECT * FROM tasks ${TASK_ORDER}`, toTask),
  byProject: (projectId: string) =>
    many(`SELECT * FROM tasks WHERE project_id = $projectId ${TASK_ORDER}`, toTask, { projectId }),
  get: (id: string) => one("SELECT * FROM tasks WHERE id = $id", toTask, { id }),
  // projects.updated_at TIDAK disentuh: dipakai sebagai versi form edit proyek (cek bentrok antar-tab),
  // jadi menambah tugas tidak boleh membuat form edit proyek di tab lain dianggap usang.
  async create(d: TaskInput & Seed) {
    const st = stamps(d);
    await run(
      `INSERT INTO tasks (id, title, description, status, priority, due_date, project_id, assignee_id, created_at, updated_at)
       VALUES ($id, $title, $description, $status, $priority, $dueDate, $projectId, $assigneeId, $createdAt, $updatedAt)`,
      { ...taskArgs(d), ...st, projectId: d.projectId },
    );
    return st.id;
  },
  update: (id: string, d: Omit<TaskInput, "projectId">) =>
    run(
      `UPDATE tasks SET title=$title, description=$description, status=$status, priority=$priority, due_date=$dueDate,
       assignee_id=$assigneeId, updated_at=$updatedAt WHERE id=$id`,
      { ...taskArgs(d), id, updatedAt: now() },
    ),
  setStatus: (id: string, status: string) =>
    run("UPDATE tasks SET status = $status, updated_at = $at WHERE id = $id", { id, status, at: now() }),
  remove: (id: string) => run("DELETE FROM tasks WHERE id = $id", { id }),
};

/* ---------- portofolio ---------- */
type PortfolioInput = Input<PortfolioItem>;
const PF_ORDER = "ORDER BY sort_order, year DESC";
const pfArgs = (d: PortfolioInput) => ({
  slug: d.slug,
  title: d.title,
  client: d.client,
  category: d.category,
  year: d.year,
  summary: d.summary,
  content: d.content,
  tags: d.tags,
  coverColor: d.coverColor,
  imageUrl: d.imageUrl,
  liveUrl: d.liveUrl,
  featured: d.featured ? 1 : 0,
  published: d.published ? 1 : 0,
  sortOrder: d.sortOrder,
  projectId: d.projectId,
});

export const portfolio = {
  list: (opts: { published?: boolean } = {}) =>
    many(`SELECT * FROM portfolio ${opts.published ? "WHERE published = 1" : ""} ${PF_ORDER}`, toPortfolio),
  get: (id: string) => one("SELECT * FROM portfolio WHERE id = $id", toPortfolio, { id }),
  bySlug: (slug: string) => one("SELECT * FROM portfolio WHERE slug = $slug", toPortfolio, { slug }),
  byProject: (projectId: string) =>
    many("SELECT * FROM portfolio WHERE project_id = $projectId", toPortfolio, { projectId }),
  async create(d: PortfolioInput & Seed) {
    const st = stamps(d);
    await run(
      `INSERT INTO portfolio (id, slug, title, client, category, year, summary, content, tags, cover_color, image_url, live_url,
        featured, published, sort_order, project_id, created_at, updated_at)
       VALUES ($id, $slug, $title, $client, $category, $year, $summary, $content, $tags, $coverColor, $imageUrl, $liveUrl,
        $featured, $published, $sortOrder, $projectId, $createdAt, $updatedAt)`,
      { ...pfArgs(d), ...st },
    );
    return st.id;
  },
  update: (id: string, d: PortfolioInput) =>
    run(
      `UPDATE portfolio SET slug=$slug, title=$title, client=$client, category=$category, year=$year, summary=$summary,
       content=$content, tags=$tags, cover_color=$coverColor, image_url=$imageUrl, live_url=$liveUrl, featured=$featured,
       published=$published, sort_order=$sortOrder, project_id=$projectId, updated_at=$updatedAt WHERE id=$id`,
      { ...pfArgs(d), id, updatedAt: now() },
    ),
  /** Tayang/sembunyikan; menyembunyikan juga mematikan unggulan */
  setPublished: (id: string, on: boolean) =>
    run(
      `UPDATE portfolio SET published = $on, featured = CASE WHEN $on = 1 THEN featured ELSE 0 END, updated_at = $at
       WHERE id = $id`,
      { id, on: on ? 1 : 0, at: now() },
    ),
  setFeatured: (id: string, on: boolean) =>
    run("UPDATE portfolio SET featured = $on, updated_at = $at WHERE id = $id", { id, on: on ? 1 : 0, at: now() }),
  remove: (id: string) => run("DELETE FROM portfolio WHERE id = $id", { id }),
};

/* ---------- inquiry ---------- */
export const inquiries = {
  list: () => many("SELECT * FROM inquiries ORDER BY created_at DESC", toInquiry),
  get: (id: string) => one("SELECT * FROM inquiries WHERE id = $id", toInquiry, { id }),
  async create(d: Omit<Inquiry, "id" | "createdAt" | "status"> & { status?: string; id?: string; createdAt?: string }) {
    const id = d.id ?? newId();
    await run(
      `INSERT INTO inquiries (id, name, email, company, service, budget, message, status, created_at)
       VALUES ($id, $name, $email, $company, $service, $budget, $message, $status, $createdAt)`,
      {
        id,
        name: d.name,
        email: d.email,
        company: d.company,
        service: d.service,
        budget: d.budget,
        message: d.message,
        status: d.status ?? "NEW",
        createdAt: d.createdAt ?? now(),
      },
    );
    return id;
  },
  setStatus: (id: string, status: string) =>
    run("UPDATE inquiries SET status = $status WHERE id = $id", { id, status }),
  remove: (id: string) => run("DELETE FROM inquiries WHERE id = $id", { id }),
  countNew: () => count("SELECT COUNT(*) AS n FROM inquiries WHERE status = 'NEW'"),
};

/* ---------- pengaturan ---------- */
async function getSetting<T extends object>(key: string, fallback: T): Promise<T> {
  const r = await first("SELECT value FROM settings WHERE key = $key", { key });
  return r ? { ...fallback, ...JSON.parse(s(r.value)) } : fallback;
}
const setSetting = (key: string, value: unknown) =>
  run("INSERT INTO settings (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value", {
    key,
    value: JSON.stringify(value),
  });

export const settings = {
  async discord(): Promise<DiscordSettings> {
    const v = await getSetting<DiscordSettings>("discord", { webhookUrl: "", enabled: true });
    return { ...v, webhookUrl: v.webhookUrl || process.env.DISCORD_WEBHOOK_URL || "" };
  },
  setDiscord: (v: DiscordSettings) => setSetting("discord", v),
};

/* ---------- seed / impor ---------- */
/** Kosongkan semua tabel data (dipakai `db:seed --force` dan `db:import --force`) */
export async function wipeAll() {
  await ready;
  await client.executeMultiple(
    "DELETE FROM tasks; DELETE FROM portfolio; DELETE FROM projects; DELETE FROM inquiries; DELETE FROM sessions; DELETE FROM users; DELETE FROM settings;",
  );
}
