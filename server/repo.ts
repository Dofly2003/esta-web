// Akses data (query SQL) — satu-satunya tempat yang menyentuh tabel.
import { db, newId, now } from "./db";
import type { DiscordSettings, Inquiry, PortfolioItem, Project, Task, User } from "../shared/types";

type Row = Record<string, unknown>;

/* ---------- mapper baris → objek ---------- */
const toUser = (r: Row): User => ({
  id: r.id as string,
  name: r.name as string,
  email: r.email as string,
  role: r.role as string,
  discordId: (r.discord_id as string) ?? "",
  createdAt: r.created_at as string,
});
const toProject = (r: Row): Project => ({
  id: r.id as string,
  name: r.name as string,
  client: r.client as string,
  type: r.type as string,
  status: r.status as string,
  description: r.description as string,
  budget: (r.budget as number | null) ?? null,
  startDate: (r.start_date as string | null) ?? null,
  dueDate: (r.due_date as string | null) ?? null,
  leadId: (r.lead_id as string | null) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});
const toTask = (r: Row): Task => ({
  id: r.id as string,
  title: r.title as string,
  description: r.description as string,
  status: r.status as string,
  priority: r.priority as string,
  dueDate: (r.due_date as string | null) ?? null,
  projectId: r.project_id as string,
  assigneeId: (r.assignee_id as string | null) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});
const toPortfolio = (r: Row): PortfolioItem => ({
  id: r.id as string,
  slug: r.slug as string,
  title: r.title as string,
  client: r.client as string,
  category: r.category as string,
  year: r.year as number,
  summary: r.summary as string,
  content: r.content as string,
  tags: r.tags as string,
  coverColor: r.cover_color as string,
  imageUrl: (r.image_url as string | null) ?? null,
  liveUrl: (r.live_url as string | null) ?? null,
  featured: !!r.featured,
  published: !!r.published,
  sortOrder: r.sort_order as number,
  projectId: (r.project_id as string | null) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});
const toInquiry = (r: Row): Inquiry => ({
  id: r.id as string,
  name: r.name as string,
  email: r.email as string,
  company: r.company as string,
  service: r.service as string,
  budget: r.budget as string,
  message: r.message as string,
  status: r.status as string,
  createdAt: r.created_at as string,
});

const all = <T>(sql: string, map: (r: Row) => T, params: Record<string, unknown> = {}) =>
  (db.query(sql).all(params as never) as Row[]).map(map);
const one = <T>(sql: string, map: (r: Row) => T, params: Record<string, unknown> = {}) => {
  const r = db.query(sql).get(params as never) as Row | null;
  return r ? map(r) : null;
};

/* ---------- users ---------- */
export const users = {
  list: () => all("SELECT * FROM users ORDER BY name COLLATE NOCASE", toUser),
  get: (id: string | null | undefined) => (id ? one("SELECT * FROM users WHERE id = $id", toUser, { id }) : null),
  byEmail: (email: string) => {
    const r = db.query("SELECT * FROM users WHERE email = $email").get({ email } as never) as Row | null;
    return r ? { ...toUser(r), passwordHash: r.password_hash as string } : null;
  },
  passwordHash: (id: string) =>
    (db.query("SELECT password_hash FROM users WHERE id = $id").get({ id } as never) as Row | null)?.password_hash as
      | string
      | undefined,
  create(d: {
    id?: string;
    name: string;
    email: string;
    role: string;
    passwordHash: string;
    discordId?: string;
    createdAt?: string;
  }) {
    const id = d.id ?? newId();
    db.query(
      `INSERT INTO users (id, name, email, password_hash, role, discord_id, created_at)
       VALUES ($id, $name, $email, $hash, $role, $discord, $at)`,
    ).run({
      id,
      name: d.name,
      email: d.email,
      hash: d.passwordHash,
      role: d.role,
      discord: d.discordId ?? "",
      at: d.createdAt ?? now(),
    } as never);
    return id;
  },
  setPassword: (id: string, hash: string) =>
    db.query("UPDATE users SET password_hash = $hash WHERE id = $id").run({ id, hash } as never),
  setDiscordId: (id: string, discordId: string) =>
    db.query("UPDATE users SET discord_id = $discordId WHERE id = $id").run({ id, discordId } as never),
  remove: (id: string) => db.query("DELETE FROM users WHERE id = $id").run({ id } as never),
  count: () => (db.query("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n,
};

/* ---------- sesi login ---------- */
export const sessions = {
  create: (id: string, userId: string, expiresAt: string) =>
    db
      .query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($id, $userId, $expiresAt)")
      .run({ id, userId, expiresAt } as never),
  user(id: string) {
    const r = db
      .query("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $id AND s.expires_at > $now")
      .get({ id, now: now() } as never) as Row | null;
    return r ? toUser(r) : null;
  },
  remove: (id: string) => db.query("DELETE FROM sessions WHERE id = $id").run({ id } as never),
  removeForUser: (userId: string) => db.query("DELETE FROM sessions WHERE user_id = $userId").run({ userId } as never),
  purgeExpired: () => db.query("DELETE FROM sessions WHERE expires_at <= $now").run({ now: now() } as never),
};

/* ---------- proyek ---------- */
export type ProjectInput = Omit<Project, "id" | "createdAt" | "updatedAt">;

export const projects = {
  list: () => all("SELECT * FROM projects ORDER BY updated_at DESC", toProject),
  get: (id: string) => one("SELECT * FROM projects WHERE id = $id", toProject, { id }),
  create(d: ProjectInput & { id?: string; createdAt?: string; updatedAt?: string }) {
    const id = d.id ?? newId();
    const at = now();
    db.query(
      `INSERT INTO projects (id, name, client, type, status, description, budget, start_date, due_date, lead_id, created_at, updated_at)
       VALUES ($id, $name, $client, $type, $status, $description, $budget, $startDate, $dueDate, $leadId, $createdAt, $updatedAt)`,
    ).run({ ...d, id, createdAt: d.createdAt ?? at, updatedAt: d.updatedAt ?? at } as never);
    return id;
  },
  update(id: string, d: ProjectInput) {
    db.query(
      `UPDATE projects SET name=$name, client=$client, type=$type, status=$status, description=$description, budget=$budget,
       start_date=$startDate, due_date=$dueDate, lead_id=$leadId, updated_at=$updatedAt WHERE id=$id`,
    ).run({ ...d, id, updatedAt: now() } as never);
  },
  touch: (id: string) =>
    db.query("UPDATE projects SET updated_at = $at WHERE id = $id").run({ id, at: now() } as never),
  remove: (id: string) => db.query("DELETE FROM projects WHERE id = $id").run({ id } as never),
};

/* ---------- tugas ---------- */
export type TaskInput = Omit<Task, "id" | "createdAt" | "updatedAt">;
const TASK_ORDER = "ORDER BY due_date IS NULL, due_date, created_at";

export const tasks = {
  list: () => all(`SELECT * FROM tasks ${TASK_ORDER}`, toTask),
  byProject: (projectId: string) =>
    all(`SELECT * FROM tasks WHERE project_id = $projectId ${TASK_ORDER}`, toTask, { projectId }),
  get: (id: string) => one("SELECT * FROM tasks WHERE id = $id", toTask, { id }),
  create(d: TaskInput & { id?: string; createdAt?: string; updatedAt?: string }) {
    const id = d.id ?? newId();
    const at = now();
    db.query(
      `INSERT INTO tasks (id, title, description, status, priority, due_date, project_id, assignee_id, created_at, updated_at)
       VALUES ($id, $title, $description, $status, $priority, $dueDate, $projectId, $assigneeId, $createdAt, $updatedAt)`,
    ).run({ ...d, id, createdAt: d.createdAt ?? at, updatedAt: d.updatedAt ?? at } as never);
    projects.touch(d.projectId);
    return id;
  },
  update(id: string, d: Omit<TaskInput, "projectId">) {
    db.query(
      `UPDATE tasks SET title=$title, description=$description, status=$status, priority=$priority, due_date=$dueDate,
       assignee_id=$assigneeId, updated_at=$updatedAt WHERE id=$id`,
    ).run({ ...d, id, updatedAt: now() } as never);
  },
  setStatus: (id: string, status: string) =>
    db
      .query("UPDATE tasks SET status = $status, updated_at = $at WHERE id = $id")
      .run({ id, status, at: now() } as never),
  remove: (id: string) => db.query("DELETE FROM tasks WHERE id = $id").run({ id } as never),
};

/* ---------- portofolio ---------- */
export type PortfolioInput = Omit<PortfolioItem, "id" | "createdAt" | "updatedAt">;
const PF_ORDER = "ORDER BY sort_order, year DESC";
const pfParams = (d: PortfolioInput) => ({ ...d, featured: d.featured ? 1 : 0, published: d.published ? 1 : 0 });

export const portfolio = {
  list: (opts: { published?: boolean } = {}) =>
    all(`SELECT * FROM portfolio ${opts.published ? "WHERE published = 1" : ""} ${PF_ORDER}`, toPortfolio),
  get: (id: string) => one("SELECT * FROM portfolio WHERE id = $id", toPortfolio, { id }),
  bySlug: (slug: string) => one("SELECT * FROM portfolio WHERE slug = $slug", toPortfolio, { slug }),
  byProject: (projectId: string) =>
    all("SELECT * FROM portfolio WHERE project_id = $projectId", toPortfolio, { projectId }),
  create(d: PortfolioInput & { id?: string; createdAt?: string; updatedAt?: string }) {
    const id = d.id ?? newId();
    const at = now();
    db.query(
      `INSERT INTO portfolio (id, slug, title, client, category, year, summary, content, tags, cover_color, image_url, live_url,
        featured, published, sort_order, project_id, created_at, updated_at)
       VALUES ($id, $slug, $title, $client, $category, $year, $summary, $content, $tags, $coverColor, $imageUrl, $liveUrl,
        $featured, $published, $sortOrder, $projectId, $createdAt, $updatedAt)`,
    ).run({ ...pfParams(d), id, createdAt: d.createdAt ?? at, updatedAt: d.updatedAt ?? at } as never);
    return id;
  },
  update(id: string, d: PortfolioInput) {
    db.query(
      `UPDATE portfolio SET slug=$slug, title=$title, client=$client, category=$category, year=$year, summary=$summary,
       content=$content, tags=$tags, cover_color=$coverColor, image_url=$imageUrl, live_url=$liveUrl, featured=$featured,
       published=$published, sort_order=$sortOrder, project_id=$projectId, updated_at=$updatedAt WHERE id=$id`,
    ).run({ ...pfParams(d), id, updatedAt: now() } as never);
  },
  toggle(id: string, field: "featured" | "published") {
    db.query(`UPDATE portfolio SET ${field} = 1 - ${field}, updated_at = $at WHERE id = $id`).run({
      id,
      at: now(),
    } as never);
  },
  remove: (id: string) => db.query("DELETE FROM portfolio WHERE id = $id").run({ id } as never),
};

/* ---------- inquiry ---------- */
export const inquiries = {
  list: () => all("SELECT * FROM inquiries ORDER BY created_at DESC", toInquiry),
  create(d: Omit<Inquiry, "id" | "createdAt" | "status"> & { status?: string; id?: string; createdAt?: string }) {
    db.query(
      `INSERT INTO inquiries (id, name, email, company, service, budget, message, status, created_at)
       VALUES ($id, $name, $email, $company, $service, $budget, $message, $status, $createdAt)`,
    ).run({ ...d, id: d.id ?? newId(), status: d.status ?? "NEW", createdAt: d.createdAt ?? now() } as never);
  },
  setStatus: (id: string, status: string) =>
    db.query("UPDATE inquiries SET status = $status WHERE id = $id").run({ id, status } as never),
  remove: (id: string) => db.query("DELETE FROM inquiries WHERE id = $id").run({ id } as never),
  countNew: () => (db.query("SELECT COUNT(*) AS n FROM inquiries WHERE status = 'NEW'").get() as { n: number }).n,
};

/* ---------- pengaturan ---------- */
function getSetting<T>(key: string, fallback: T): T {
  const r = db.query("SELECT value FROM settings WHERE key = $key").get({ key } as never) as { value: string } | null;
  return r ? { ...fallback, ...JSON.parse(r.value) } : fallback;
}
function setSetting(key: string, value: unknown) {
  db.query(
    "INSERT INTO settings (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run({
    key,
    value: JSON.stringify(value),
  } as never);
}

export const settings = {
  discord(): DiscordSettings {
    const s = getSetting<DiscordSettings>("discord", { webhookUrl: "", enabled: true });
    return { ...s, webhookUrl: s.webhookUrl || process.env.DISCORD_WEBHOOK_URL || "" };
  },
  setDiscord: (v: DiscordSettings) => setSetting("discord", v),
};
