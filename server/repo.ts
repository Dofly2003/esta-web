// Akses data (query SQL) — satu-satunya tempat yang menyentuh tabel.
// Hapus berantai ditulis eksplisit (tidak bergantung pada PRAGMA foreign_keys) agar sama di file lokal & Turso.
import type { Row } from "@libsql/client";
import { batch, first, newId, now, readMany, rows, run, type Stmt } from "./db";
import type {
  DiscordForm,
  DiscordSettings,
  Inquiry,
  NamedRef,
  InquiryBrief,
  PortfolioCard,
  PortfolioItem,
  PortfolioPublic,
  PortfolioRow,
  Project,
  ProjectSummary,
  Task,
  TaskBrief,
  TaskEditable,
  User,
} from "../shared/types";
import { ACTIVE_PROJECT_STATUSES, coverColorOr } from "../shared/constants";
import { envWebhook } from "./env";
import { DISCORD_DEFAULT, discordSettingOf } from "./schemas/settings";

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
const toProjectSummary = (r: Row): ProjectSummary => ({
  id: s(r.id),
  name: s(r.name),
  client: s(r.client),
  type: s(r.type),
  status: s(r.status),
  budget: r.budget == null ? null : n(r.budget),
  startDate: sn(r.start_date),
  dueDate: sn(r.due_date),
  leadId: sn(r.lead_id),
  createdAt: s(r.created_at),
  updatedAt: s(r.updated_at),
});
const toProject = (r: Row): Project => ({ ...toProjectSummary(r), description: s(r.description) });
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
// Kartu karya publik: hanya yang ditampilkan PortfolioCard + Cover
const toPortfolioCard = (r: Row): PortfolioCard => ({
  slug: s(r.slug),
  title: s(r.title),
  client: s(r.client),
  category: s(r.category),
  // juga dibersihkan saat dibaca: nilai ini masuk ke atribut style
  coverColor: coverColorOr(s(r.cover_color)),
  imageUrl: sn(r.image_url),
});
const toPortfolioPublic = (r: Row): PortfolioPublic => ({
  ...toPortfolioCard(r),
  year: n(r.year),
  summary: s(r.summary),
  content: s(r.content),
  tags: s(r.tags),
  liveUrl: sn(r.live_url),
});
const toPortfolioRow = (r: Row): PortfolioRow => ({
  id: s(r.id),
  title: s(r.title),
  client: s(r.client),
  category: s(r.category),
  year: n(r.year),
  coverColor: coverColorOr(s(r.cover_color)),
  imageUrl: sn(r.image_url),
  featured: !!n(r.featured),
  published: !!n(r.published),
  sortOrder: n(r.sort_order),
});
const toPortfolio = (r: Row): PortfolioItem => ({
  ...toPortfolioPublic(r),
  ...toPortfolioRow(r),
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

/* ---------- kolom ---------- */
/** Kolom akun tanpa password_hash (hash tidak pernah ikut terbaca kecuali saat login / ganti password) */
const USER_COLS = "id, name, email, role, discord_id, created_at";
const userCols = (alias: string) =>
  USER_COLS.split(", ")
    .map((c) => `${alias}.${c}`)
    .join(", ");
/** Kolom proyek untuk daftar / ringkasan (tanpa deskripsi) */
const PROJECT_LIST_COLS =
  "id, name, client, type, status, budget, start_date, due_date, lead_id, created_at, updated_at";
/** Kolom karya per tampilan (tanpa isi artikel, bisa sampai 50 KB per karya, kecuali halaman detail) */
const PF_CARD_COLS = "slug, title, client, category, cover_color, image_url";
const PF_ROW_COLS = "id, title, client, category, year, cover_color, image_url, featured, published, sort_order";
const PF_PUBLIC_COLS = `${PF_CARD_COLS}, year, summary, content, tags, live_url, published`;
/** Kolom tugas: daftar yang bisa diedit (tanpa created_at) dan ringkas (tanpa deskripsi) */
const TASK_EDIT_COLS =
  "t.id, t.title, t.description, t.status, t.priority, t.due_date, t.project_id, t.assignee_id, t.updated_at";
const TASK_BRIEF_COLS = "t.id, t.title, t.status, t.priority, t.due_date, t.project_id, t.updated_at";
/** Potongan pesan inquiry di Ringkasan (satu baris berelipsis; isi lengkap di Inbox) */
const INQUIRY_SNIPPET = 300;

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
/** Pernyataan INSERT + id barisnya: dijalankan sendiri (create) atau sekaligus dalam satu transaksi (impor) */
type Insert = Stmt & { id: string };
const exec = async (ins: Insert) => {
  await run(ins.sql, ins.args);
  return ins.id;
};

type NewUser = {
  id?: string;
  name: string;
  email: string;
  role: string;
  passwordHash: string;
  discordId?: string;
  createdAt?: string;
};

/* ---------- users ---------- */
export const users = {
  list: () => many(`SELECT ${USER_COLS} FROM users ORDER BY name COLLATE NOCASE`, toUser),
  get: async (id: string | null | undefined) =>
    id ? one(`SELECT ${USER_COLS} FROM users WHERE id = $id`, toUser, { id }) : null,
  async byEmail(email: string) {
    const r = await first(`SELECT ${USER_COLS}, password_hash FROM users WHERE email = $email`, { email });
    return r ? { ...toUser(r), passwordHash: s(r.password_hash) } : null;
  },
  /** Hash baru untuk password yang sama (parameter argon2 diperbarui saat login); sesi tidak disentuh */
  rehash: (id: string, hash: string) => run("UPDATE users SET password_hash = $hash WHERE id = $id", { id, hash }),
  async passwordHash(id: string) {
    return sn((await first("SELECT password_hash FROM users WHERE id = $id", { id }))?.password_hash);
  },
  insert(d: NewUser): Insert {
    const id = d.id ?? newId();
    return {
      id,
      sql: `INSERT INTO users (id, name, email, password_hash, role, discord_id, created_at)
       VALUES ($id, $name, $email, $hash, $role, $discord, $at)`,
      args: {
        id,
        name: d.name,
        email: d.email,
        hash: d.passwordHash,
        role: d.role,
        discord: d.discordId ?? "",
        at: d.createdAt ?? now(),
      },
    };
  },
  create: (d: NewUser) => exec(users.insert(d)),
  /** Ganti password sendiri: semua sesi LAIN akun ini berakhir, sesi `keepSession` (perangkat ini) tetap (atomik) */
  changePassword: (id: string, hash: string, keepSession: string | null) =>
    batch([
      { sql: "UPDATE users SET password_hash = $hash WHERE id = $id", args: { id, hash } },
      { sql: "DELETE FROM sessions WHERE user_id = $id AND id IS NOT $keep", args: { id, keep: keepSession } },
    ]),
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
  /** Sesi kedaluwarsa disapu lalu sesi baru dibuat, dalam satu batch (satu round trip ke Turso) */
  start: (id: string, userId: string, expiresAt: string) =>
    batch([
      { sql: "DELETE FROM sessions WHERE expires_at <= $now", args: { now: now() } },
      {
        sql: "INSERT INTO sessions (id, user_id, expires_at) VALUES ($id, $userId, $expiresAt)",
        args: { id, userId, expiresAt },
      },
    ]),
  user: (id: string) =>
    one(
      `SELECT ${userCols("u")} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $id AND s.expires_at > $now`,
      toUser,
      { id, now: now() },
    ),
  remove: (id: string) => run("DELETE FROM sessions WHERE id = $id", { id }),
  /** Keluarkan akun dari semua perangkat lain (sesi `keep` tetap) */
  removeOthers: (userId: string, keep: string) =>
    run("DELETE FROM sessions WHERE user_id = $userId AND id <> $keep", { userId, keep }),
  countFor: (userId: string) => count("SELECT COUNT(*) AS n FROM sessions WHERE user_id = $userId", { userId }),
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
  /** Semua proyek lengkap, A–Z (skrip / tes; rute memakai `reads` yang lebih hemat) */
  list: () => many("SELECT * FROM projects ORDER BY name COLLATE NOCASE", toProject),
  get: (id: string) => one("SELECT * FROM projects WHERE id = $id", toProject, { id }),
  insert(d: ProjectInput & Seed): Insert {
    const st = stamps(d);
    return {
      id: st.id,
      sql: `INSERT INTO projects (id, name, client, type, status, description, budget, start_date, due_date, lead_id, created_at, updated_at)
       VALUES ($id, $name, $client, $type, $status, $description, $budget, $startDate, $dueDate, $leadId, $createdAt, $updatedAt)`,
      args: { ...projectArgs(d), ...st },
    };
  },
  create: (d: ProjectInput & Seed) => exec(projects.insert(d)),
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
  byProject: (projectId: string) =>
    many(`SELECT * FROM tasks WHERE project_id = $projectId ${TASK_ORDER}`, toTask, { projectId }),
  get: (id: string) => one("SELECT * FROM tasks WHERE id = $id", toTask, { id }),
  // projects.updated_at TIDAK disentuh: dipakai sebagai versi form edit proyek (cek bentrok antar-tab),
  // jadi menambah tugas tidak boleh membuat form edit proyek di tab lain dianggap usang.
  insert(d: TaskInput & Seed): Insert {
    const st = stamps(d);
    return {
      id: st.id,
      sql: `INSERT INTO tasks (id, title, description, status, priority, due_date, project_id, assignee_id, created_at, updated_at)
       VALUES ($id, $title, $description, $status, $priority, $dueDate, $projectId, $assigneeId, $createdAt, $updatedAt)`,
      args: { ...taskArgs(d), ...st, projectId: d.projectId },
    };
  },
  create: (d: TaskInput & Seed) => exec(tasks.insert(d)),
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
  coverColor: coverColorOr(d.coverColor),
  imageUrl: d.imageUrl,
  liveUrl: d.liveUrl,
  featured: d.featured ? 1 : 0,
  published: d.published ? 1 : 0,
  sortOrder: d.sortOrder,
  projectId: d.projectId,
});

export const portfolio = {
  /** Kartu karya (tanpa isi), urutan tampil; published = hanya yang tayang */
  list: () => many(`SELECT ${PF_ROW_COLS} FROM portfolio ${PF_ORDER}`, toPortfolioRow),
  get: (id: string) => one("SELECT * FROM portfolio WHERE id = $id", toPortfolio, { id }),
  bySlug: (slug: string) => one("SELECT * FROM portfolio WHERE slug = $slug", toPortfolio, { slug }),
  byProject: (projectId: string) =>
    many("SELECT id FROM portfolio WHERE project_id = $projectId", (r) => ({ id: s(r.id) }), { projectId }),
  /** Slug yang sudah dipakai: `root` sendiri dan `prefix-…` (kandidat uniqueSlug) → id pemiliknya */
  slugsLike: async (root: string, prefix: string) =>
    new Map(
      (
        await rows(
          "SELECT id, slug FROM portfolio WHERE slug = $root OR substr(slug, 1, length($prefix) + 1) = $prefix || '-'",
          { root, prefix },
        )
      ).map((r) => [s(r.slug), s(r.id)]),
    ),
  /** Jumlah karya unggulan yang tayang, selain `exceptId` */
  countFeatured: (exceptId: string | null = null) =>
    count("SELECT COUNT(*) AS n FROM portfolio WHERE published = 1 AND featured = 1 AND id IS NOT $id", {
      id: exceptId,
    }),
  insert(d: PortfolioInput & Seed): Insert {
    const st = stamps(d);
    return {
      id: st.id,
      sql: `INSERT INTO portfolio (id, slug, title, client, category, year, summary, content, tags, cover_color, image_url, live_url,
        featured, published, sort_order, project_id, created_at, updated_at)
       VALUES ($id, $slug, $title, $client, $category, $year, $summary, $content, $tags, $coverColor, $imageUrl, $liveUrl,
        $featured, $published, $sortOrder, $projectId, $createdAt, $updatedAt)`,
      args: { ...pfArgs(d), ...st },
    };
  },
  create: (d: PortfolioInput & Seed) => exec(portfolio.insert(d)),
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
type NewInquiry = Omit<Inquiry, "id" | "createdAt" | "status"> & { status?: string; id?: string; createdAt?: string };
export const inquiries = {
  /** Semua inquiry, terbaru dulu (skrip / tes; Inbox memakai reads.inquiryPage) */
  list: () => many("SELECT * FROM inquiries ORDER BY created_at DESC", toInquiry),
  get: (id: string) => one("SELECT * FROM inquiries WHERE id = $id", toInquiry, { id }),
  insert(d: NewInquiry): Insert {
    const id = d.id ?? newId();
    return {
      id,
      sql: `INSERT INTO inquiries (id, name, email, company, service, budget, message, status, created_at)
       VALUES ($id, $name, $email, $company, $service, $budget, $message, $status, $createdAt)`,
      args: {
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
    };
  },
  create: (d: NewInquiry) => exec(inquiries.insert(d)),
  setStatus: (id: string, status: string) =>
    run("UPDATE inquiries SET status = $status WHERE id = $id", { id, status }),
  remove: (id: string) => run("DELETE FROM inquiries WHERE id = $id", { id }),
  countNew: () => count("SELECT COUNT(*) AS n FROM inquiries WHERE status = 'NEW'"),
};

/* ---------- pengaturan ---------- */
/** Nilai tersimpan (digabung dengan fallback), atau null bila kunci belum pernah disimpan.
 * JSON rusak dianggap fallback (tidak membuat setiap request Discord gagal). */
const DISCORD_ROW = "SELECT value FROM settings WHERE key = 'discord'";
/** Setelan tersimpan (skema schemas/settings), atau null bila admin belum pernah menyimpannya */
const savedDiscord = (rs: Row[]) => (rs[0] ? discordSettingOf(s(rs[0].value)) : null);
/** Form admin dari baris tersimpan (lihat settings.discordForm) */
const discordFormOf = (saved: DiscordSettings | null): DiscordForm => ({
  ...(saved ?? DISCORD_DEFAULT),
  fromEnv: !saved && !!envWebhook(),
});
const settingStmt = (key: string, value: unknown): Stmt => ({
  sql: "INSERT INTO settings (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  args: { key, value: JSON.stringify(value) },
});

export const settings = {
  /** Setelan untuk mengirim. Env DISCORD_WEBHOOK_URL hanya cadangan selama admin BELUM pernah menyimpan
   * setelan di dashboard; setelah webhook dikosongkan di sana, notifikasi benar-benar mati. */
  async discord(): Promise<DiscordSettings> {
    const saved = savedDiscord(await rows(DISCORD_ROW));
    return saved ?? { ...DISCORD_DEFAULT, webhookUrl: envWebhook() };
  },
  /** Untuk form admin: hanya nilai tersimpan (rahasia env tidak pernah diisikan ke form, jadi tidak ikut tersalin
   * ke database saat Simpan) + fromEnv = saat ini notifikasi memakai webhook cadangan dari env */
  async discordForm(): Promise<DiscordForm> {
    return discordFormOf(savedDiscord(await rows(DISCORD_ROW)));
  },
  discordStmt: (v: DiscordSettings) => settingStmt("discord", { webhookUrl: v.webhookUrl, enabled: v.enabled }),
  setDiscord: (v: DiscordSettings) => {
    const st = settings.discordStmt(v);
    return run(st.sql, st.args);
  },
};

/* ---------- seed / impor ---------- */
/** Pernyataan untuk mengosongkan semua tabel data (urutan: anak dulu) */
export const WIPE_STMTS: Stmt[] = ["tasks", "portfolio", "projects", "inquiries", "sessions", "users", "settings"].map(
  (t) => ({ sql: `DELETE FROM ${t}` }),
);
/** Kosongkan semua tabel data (dipakai `db:seed --force` dan `db:import --force`) */
export async function wipeAll() {
  await batch(WIPE_STMTS);
}

/* ---------- query baca gabungan (ringkasan, daftar) ----------
 * Setiap fungsi di bawah mengembalikan Query (SQL + pembaca hasil), lalu rute menjalankan beberapa sekaligus lewat
 * fetchAll → readMany: satu round trip ke Turso per halaman, tanpa memuat seluruh tabel ke memori.
 * "Tugas hidup" = belum selesai dan proyeknya berjalan (ACTIVE_PROJECT_STATUSES), sama dengan liveTasks(). */
export type Query<T> = Stmt & { read: (rows: Row[]) => T };
type Results<Q extends readonly Query<unknown>[]> = {
  -readonly [K in keyof Q]: Q[K] extends Query<infer T> ? T : never;
};

/** Jalankan beberapa Query baca sekaligus (satu batch) */
export async function fetchAll<const Q extends readonly Query<unknown>[]>(qs: Q): Promise<Results<Q>> {
  const res = await readMany(qs as unknown as Stmt[]);
  return qs.map((q, i) => q.read(res[i]!)) as Results<Q>;
}

const ACTIVE_IN = `(${ACTIVE_PROJECT_STATUSES.map((st) => `'${st}'`).join(", ")})`;
const LIVE = `FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.status <> 'DONE' AND p.status IN ${ACTIVE_IN}`;
/** Deadline tugas sebagai "YYYY-MM-DD" (nilai lain = NULL: tidak dihitung lewat / minggu ini). Sama dengan
 * isLate / isDueWithin untuk semua nilai yang bisa ditulis aplikasi (NULL atau tanggal tervalidasi). */
const DUE = "(CASE WHEN t.due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' THEN t.due_date END)";
const TASK_ORDER_T = "ORDER BY t.due_date IS NULL, t.due_date, t.created_at";
const mapRows =
  <T>(map: (r: Row) => T) =>
  (rs: Row[]) =>
    rs.map(map);
const firstOf =
  <T>(map: (r: Row) => T) =>
  (rs: Row[]) =>
    rs[0] ? map(rs[0]) : null;
const countOf = (rs: Row[]) => n(rs[0]?.n);
/** Baris (id, n) → { id: n } */
const countsBy = (rs: Row[]) => {
  const out: Record<string, number> = {};
  for (const r of rs) out[s(r.id)] = n(r.n);
  return out;
};

export type TaskWithProjectName = TaskEditable & { projectName: string };
const toTaskEditable = (r: Row): TaskEditable => ({
  id: s(r.id),
  title: s(r.title),
  description: s(r.description),
  status: s(r.status),
  priority: s(r.priority),
  dueDate: sn(r.due_date),
  projectId: s(r.project_id),
  assigneeId: sn(r.assignee_id),
  updatedAt: s(r.updated_at),
});
const toTaskWithName = (r: Row): TaskWithProjectName => ({ ...toTaskEditable(r), projectName: s(r.project_name) });
const toTaskBrief = (r: Row): TaskBrief => ({
  id: s(r.id),
  title: s(r.title),
  status: s(r.status),
  priority: s(r.priority),
  dueDate: sn(r.due_date),
  projectId: s(r.project_id),
  updatedAt: s(r.updated_at),
  projectName: s(r.project_name),
});

/** Cakupan daftar tugas: semua, tanpa penanggung jawab, atau satu akun */
export type TaskScope = { kind: "all" } | { kind: "none" } | { kind: "user"; id: string };
const scopeSql = (scope: TaskScope) =>
  scope.kind === "all"
    ? ""
    : scope.kind === "none"
      ? " AND COALESCE(t.assignee_id, '') = ''"
      : " AND t.assignee_id = $who";
const scopeArgs = (scope: TaskScope): Record<string, string> => (scope.kind === "user" ? { who: scope.id } : {});

/** Hitungan tugas hidup seluruh tim, per hari ini `today` (APP_TZ) dan `week` = hari ini + 7 */
export type LiveCounts = {
  open: number;
  overdue: number;
  dueThisWeek: number;
  dueToday: number;
  unassigned: number;
  review: number;
  oldestReviewAt: string | null;
};

export const reads = {
  users: (): Query<User[]> => ({
    sql: `SELECT ${USER_COLS} FROM users ORDER BY name COLLATE NOCASE`,
    read: mapRows(toUser),
  }),
  /** { id, name } semua akun, A-Z (pilihan PJ, nama penanggung jawab) */
  userRefs: (): Query<NamedRef[]> => ({
    sql: "SELECT id, name FROM users ORDER BY name COLLATE NOCASE",
    read: mapRows((r) => ({ id: s(r.id), name: s(r.name) })),
  }),
  project: (id: string): Query<Project | null> => ({
    sql: "SELECT * FROM projects WHERE id = $id",
    args: { id },
    read: firstOf(toProject),
  }),
  /** Semua proyek tanpa deskripsi, A–Z (urutan dasar; rute mengurutkan ulang) */
  projectList: (): Query<ProjectSummary[]> => ({
    sql: `SELECT ${PROJECT_LIST_COLS} FROM projects ORDER BY name COLLATE NOCASE`,
    read: mapRows(toProjectSummary),
  }),
  /** Proyek berjalan tanpa deskripsi, A–Z */
  activeProjects: (): Query<ProjectSummary[]> => ({
    sql: `SELECT ${PROJECT_LIST_COLS} FROM projects WHERE status IN ${ACTIVE_IN} ORDER BY name COLLATE NOCASE`,
    read: mapRows(toProjectSummary),
  }),
  /** Proyek berjalan untuk pilihan "Proyek" di form tambah tugas (rute mengurutkan per deadline) */
  activeProjectOptions: (): Query<Pick<ProjectSummary, "id" | "name" | "status" | "dueDate">[]> => ({
    sql: `SELECT id, name, status, due_date FROM projects WHERE status IN ${ACTIVE_IN} ORDER BY name COLLATE NOCASE`,
    read: mapRows((r) => ({ id: s(r.id), name: s(r.name), status: s(r.status), dueDate: sn(r.due_date) })),
  }),
  /** { id, name } semua proyek, A–Z dasar (pilihan "Proyek terkait"; rute mengurutkan dengan collator) */
  projectNames: (): Query<NamedRef[]> => ({
    sql: "SELECT id, name FROM projects ORDER BY name COLLATE NOCASE",
    read: mapRows((r) => ({ id: s(r.id), name: s(r.name) })),
  }),
  /** Jumlah tugas (semua / selesai) per proyek; activeOnly = hanya proyek berjalan */
  taskTotals: (activeOnly = false): Query<Map<string, { total: number; done: number }>> => ({
    sql: `SELECT project_id AS id, COUNT(*) AS total, SUM(status = 'DONE') AS done FROM tasks
      ${activeOnly ? `WHERE project_id IN (SELECT id FROM projects WHERE status IN ${ACTIVE_IN})` : ""}
      GROUP BY project_id`,
    read: (rs) => new Map(rs.map((r) => [s(r.id), { total: n(r.total), done: n(r.done) }])),
  }),
  /** id proyek yang sudah punya karya portofolio */
  linkedProjectIds: (): Query<Set<string>> => ({
    sql: "SELECT DISTINCT project_id AS id FROM portfolio WHERE project_id IS NOT NULL",
    read: (rs) => new Set(rs.map((r) => s(r.id))),
  }),
  liveCounts: (today: string, week: string): Query<LiveCounts> => ({
    sql: `SELECT COUNT(*) AS open,
        COALESCE(SUM(${DUE} < $today), 0) AS overdue,
        COALESCE(SUM(${DUE} >= $today AND ${DUE} <= $week), 0) AS week,
        COALESCE(SUM(${DUE} = $today), 0) AS today,
        COALESCE(SUM(COALESCE(t.assignee_id, '') = ''), 0) AS unassigned,
        COALESCE(SUM(t.status = 'REVIEW'), 0) AS review,
        MIN(CASE WHEN t.status = 'REVIEW' THEN t.updated_at END) AS oldest_review
      ${LIVE}`,
    args: { today, week },
    read: (rs) => {
      const r = rs[0];
      return {
        open: n(r?.open),
        overdue: n(r?.overdue),
        dueThisWeek: n(r?.week),
        dueToday: n(r?.today),
        unassigned: n(r?.unassigned),
        review: n(r?.review),
        oldestReviewAt: sn(r?.oldest_review),
      };
    },
  }),
  /** Tugas hidup per penanggung jawab: id → { open, overdue } */
  liveByAssignee: (today: string): Query<Map<string, { open: number; overdue: number }>> => ({
    sql: `SELECT t.assignee_id AS id, COUNT(*) AS open, COALESCE(SUM(${DUE} < $today), 0) AS overdue
      ${LIVE} AND t.assignee_id IS NOT NULL AND t.assignee_id <> '' GROUP BY t.assignee_id`,
    args: { today },
    read: (rs) => new Map(rs.map((r) => [s(r.id), { open: n(r.open), overdue: n(r.overdue) }])),
  }),
  /** Tugas belum selesai per penanggung jawab, di proyek apa pun */
  openByAssignee: (): Query<Record<string, number>> => ({
    sql: `SELECT assignee_id AS id, COUNT(*) AS n FROM tasks WHERE status <> 'DONE' AND assignee_id IS NOT NULL
      GROUP BY assignee_id`,
    read: countsBy,
  }),
  /** Proyek yang dipimpin per akun (semua status) */
  ledByUser: (): Query<Record<string, number>> => ({
    sql: "SELECT lead_id AS id, COUNT(*) AS n FROM projects WHERE lead_id IS NOT NULL GROUP BY lead_id",
    read: countsBy,
  }),
  /** Tugas hidup (lengkap + nama proyek) dalam `scope`, urutan deadline */
  liveTasks: (scope: TaskScope): Query<TaskWithProjectName[]> => ({
    sql: `SELECT ${TASK_EDIT_COLS}, p.name AS project_name ${LIVE}${scopeSql(scope)} ${TASK_ORDER_T}`,
    args: scopeArgs(scope),
    read: mapRows(toTaskWithName),
  }),
  /** Sama dengan liveTasks, versi ringkas (Ringkasan: tanpa deskripsi) */
  liveTaskBriefs: (scope: TaskScope): Query<TaskBrief[]> => ({
    sql: `SELECT ${TASK_BRIEF_COLS}, p.name AS project_name ${LIVE}${scopeSql(scope)} ${TASK_ORDER_T}`,
    args: scopeArgs(scope),
    read: mapRows(toTaskBrief),
  }),
  /** Tugas di proyek berjalan dalam `scope` (withDone = termasuk yang selesai), urutan deadline */
  activeProjectTasks: (scope: TaskScope, withDone: boolean): Query<TaskWithProjectName[]> => ({
    sql: `SELECT ${TASK_EDIT_COLS}, p.name AS project_name FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE p.status IN ${ACTIVE_IN}${withDone ? "" : " AND t.status <> 'DONE'"}${scopeSql(scope)} ${TASK_ORDER_T}`,
    args: scopeArgs(scope),
    read: mapRows(toTaskWithName),
  }),
  /** Tugas hidup berstatus Review, paling lama menunggu dulu (maks. `limit`) */
  reviewTasks: (limit: number): Query<TaskBrief[]> => ({
    sql: `SELECT ${TASK_BRIEF_COLS}, p.name AS project_name ${LIVE} AND t.status = 'REVIEW'
      ORDER BY t.updated_at, t.due_date IS NULL, t.due_date, t.created_at LIMIT $limit`,
    args: { limit },
    read: mapRows(toTaskBrief),
  }),
  /** Satu tugas, kolom form ubah (GET /api/tasks/:id) */
  task: (id: string): Query<TaskEditable | null> => ({
    sql: `SELECT ${TASK_EDIT_COLS} FROM tasks t WHERE t.id = $id`,
    args: { id },
    read: firstOf(toTaskEditable),
  }),
  projectTasks: (projectId: string): Query<TaskEditable[]> => ({
    sql: `SELECT ${TASK_EDIT_COLS} FROM tasks t WHERE t.project_id = $projectId ${TASK_ORDER_T}`,
    args: { projectId },
    read: mapRows(toTaskEditable),
  }),
  /** Tugas belum selesai di proyek Ditunda */
  onHoldOpenTasks: (): Query<number> => ({
    sql: `SELECT COUNT(*) AS n FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.status <> 'DONE' AND p.status = 'ON_HOLD'`,
    read: countOf,
  }),
  /** Proyek Selesai yang belum punya karya portofolio */
  doneWithoutPortfolio: (): Query<number> => ({
    sql: `SELECT COUNT(*) AS n FROM projects WHERE status = 'DONE'
      AND id NOT IN (SELECT project_id FROM portfolio WHERE project_id IS NOT NULL)`,
    read: countOf,
  }),
  /** Inquiry NEW: jumlah + createdAt tertua */
  newInquiryStats: (): Query<{ count: number; oldest: string | null }> => ({
    sql: "SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM inquiries WHERE status = 'NEW'",
    read: (rs) => ({ count: n(rs[0]?.n), oldest: sn(rs[0]?.oldest) }),
  }),
  /** Inquiry NEW terbaru (maks. `limit`) */
  newestNewInquiries: (limit: number): Query<InquiryBrief[]> => ({
    sql: `SELECT id, name, company, substr(message, 1, ${INQUIRY_SNIPPET}) AS message, created_at FROM inquiries
      WHERE status = 'NEW' ORDER BY created_at DESC, id DESC LIMIT $limit`,
    args: { limit },
    read: mapRows((r) => ({
      id: s(r.id),
      name: s(r.name),
      company: s(r.company),
      message: s(r.message),
      createdAt: s(r.created_at),
    })),
  }),
  /** Jumlah inquiry per status (semua) */
  inquiryCounts: (): Query<Record<string, number>> => ({
    sql: "SELECT status AS id, COUNT(*) AS n FROM inquiries GROUP BY status",
    read: countsBy,
  }),
  /** Satu halaman Inbox. Baru (NEW) = terlama dulu (triase), selain itu terbaru dulu. */
  inquiryPage: (status: string, limit: number, offset: number): Query<Inquiry[]> => ({
    sql: `SELECT * FROM inquiries ${status ? "WHERE status = $status" : ""}
      ORDER BY ${status === "NEW" ? "created_at, id" : "created_at DESC, id DESC"} LIMIT $limit OFFSET $offset`,
    args: status ? { status, limit, offset } : { limit, offset },
    read: mapRows(toInquiry),
  }),
  /** Posisi (0, 1, …) inquiry `id` di urutan inquiryPage(status); null bila tidak ada di filter itu */
  inquiryPosition: (status: string, id: string): Query<number | null> => {
    const cmp = status === "NEW" ? "<" : ">";
    return {
      sql: `SELECT (SELECT COUNT(*) FROM inquiries x WHERE ${status ? "x.status = $status AND " : ""}
          (x.created_at ${cmp} f.created_at OR (x.created_at = f.created_at AND x.id ${cmp} f.id))) AS n
        FROM inquiries f WHERE f.id = $id${status ? " AND f.status = $status" : ""}`,
      args: status ? { id, status } : { id },
      read: (rs) => (rs[0] ? n(rs[0].n) : null),
    };
  },
  /** Kartu karya (tanpa isi), urutan tampil. Filter opsional: tayang, unggulan, kategori, kecuali id, batas. */
  portfolioCards: (
    opts: { published?: boolean; featured?: boolean; category?: string; exceptSlug?: string; limit?: number } = {},
  ): Query<PortfolioCard[]> => {
    const where: string[] = [];
    const args: Record<string, string | number> = {};
    if (opts.published) where.push("published = 1");
    if (opts.featured) where.push("featured = 1");
    if (opts.category) {
      where.push("category = $category");
      args.category = opts.category;
    }
    if (opts.exceptSlug) {
      where.push("slug <> $exceptSlug");
      args.exceptSlug = opts.exceptSlug;
    }
    if (opts.limit) args.limit = opts.limit;
    return {
      sql: `SELECT ${PF_CARD_COLS} FROM portfolio ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ${PF_ORDER}
        ${opts.limit ? "LIMIT $limit" : ""}`,
      args,
      read: mapRows(toPortfolioCard),
    };
  },
  /** Karya tayang untuk halaman publik (null bila tidak ada / masih draf) */
  publicPortfolio: (slug: string): Query<PortfolioPublic | null> => ({
    sql: `SELECT ${PF_PUBLIC_COLS} FROM portfolio WHERE slug = $slug`,
    args: { slug },
    read: (rs) => (rs[0] && n(rs[0].published) ? toPortfolioPublic(rs[0]) : null),
  }),
  /** Karya lengkap (dengan isi) per id */
  portfolioItem: (id: string): Query<PortfolioItem | null> => ({
    sql: "SELECT * FROM portfolio WHERE id = $id",
    args: { id },
    read: firstOf(toPortfolio),
  }),
  /** id karya yang terhubung ke proyek */
  portfolioByProject: (projectId: string): Query<{ id: string }[]> => ({
    sql: "SELECT id FROM portfolio WHERE project_id = $projectId",
    args: { projectId },
    read: mapRows((r) => ({ id: s(r.id) })),
  }),
  /** Karya unggulan yang tayang */
  countFeatured: (): Query<number> => ({
    sql: "SELECT COUNT(*) AS n FROM portfolio WHERE published = 1 AND featured = 1",
    read: countOf,
  }),
  /** Angka di Beranda: proyek selesai, karya tayang, dan klien unik (proyek + karya tayang; teks persis, tanpa "") */
  publicStats: (): Query<{ doneProjects: number; published: number; clients: number }> => ({
    sql: `SELECT (SELECT COUNT(*) FROM projects WHERE status = 'DONE') AS done,
        (SELECT COUNT(*) FROM portfolio WHERE published = 1) AS published,
        (SELECT COUNT(*) FROM (SELECT client FROM projects WHERE client <> ''
          UNION SELECT client FROM portfolio WHERE published = 1 AND client <> '')) AS clients`,
    read: (rs) => ({ doneProjects: n(rs[0]?.done), published: n(rs[0]?.published), clients: n(rs[0]?.clients) }),
  }),
  /** Setelan Discord untuk form admin */
  discordForm: (): Query<DiscordForm> => ({ sql: DISCORD_ROW, read: (rs) => discordFormOf(savedDiscord(rs)) }),
};
