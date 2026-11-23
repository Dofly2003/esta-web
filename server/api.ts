// Router API Bun vanilla. Semua endpoint di bawah /api.
// - Form HTML biasa → balas 303 redirect kembali ke halaman (dengan ?ok= / ?err=)
// - Request JSON (Accept: application/json) → balas JSON
import type { User } from "../shared/types";
import {
  INQUIRY_STATUS,
  PORTFOLIO_CATEGORIES,
  PRIORITY,
  PROJECT_STATUS,
  PROJECT_TYPES,
  ROLES,
  TASK_STATUS,
} from "../shared/constants";
import { slugify } from "../shared/format";
import { currentUser, endSession, hashPassword, login, startSession, verifyPassword } from "./auth";
import { isWebhookUrl, notifyProjectLead, notifyTaskAssigned, sendTest } from "./discord";
import { inquiries, portfolio, projects, settings, tasks, users, type ProjectInput } from "./repo";

/* ================= util ================= */
type Fields = { get(k: string): string; has(k: string): boolean };
type Ctx = {
  req: Request;
  url: URL;
  params: Record<string, string>;
  user: User | null;
  ip: string;
  body: () => Promise<Fields>;
};
type Handler = (c: Ctx) => Response | Promise<Response>;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (data: unknown, status = 200, headers: HeadersInit = {}) => Response.json(data, { status, headers });

function wantsJson(req: Request) {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("application/json") || (req.headers.get("content-type") ?? "").includes("application/json");
}

async function readBody(req: Request): Promise<Fields> {
  const type = req.headers.get("content-type") ?? "";
  let map = new Map<string, string>();
  if (type.includes("application/json")) {
    const obj = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) map.set(k, v === true ? "on" : v == null ? "" : String(v));
  } else if (type.includes("form")) {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) if (typeof v === "string") map.set(k, v);
  }
  return { get: (k) => (map.get(k) ?? "").trim(), has: (k) => map.has(k) };
}

/** Halaman tujuan setelah form: field _back, atau Referer (hanya path lokal) */
function backPath(c: Ctx, f?: Fields, fallback = "/dashboard") {
  const candidates = [f?.get("_back"), c.req.headers.get("referer")];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const u = new URL(raw, c.url.origin);
      const p = u.pathname + u.search;
      if (p.startsWith("/") && !p.startsWith("//")) return p;
    } catch {}
  }
  return fallback;
}

/** Selesai: JSON untuk fetch, redirect 303 + pesan untuk form */
function done(
  c: Ctx,
  opts: { ok?: string; err?: string; to?: string; data?: unknown; headers?: Record<string, string> },
) {
  if (wantsJson(c.req)) {
    return json(
      { ok: !opts.err, message: opts.ok, error: opts.err, data: opts.data, redirect: opts.to },
      opts.err ? 400 : 200,
      opts.headers,
    );
  }
  const u = new URL(opts.to ?? "/dashboard", c.url.origin);
  u.searchParams.delete("ok");
  u.searchParams.delete("err");
  if (opts.ok) u.searchParams.set("ok", opts.ok);
  if (opts.err) u.searchParams.set("err", opts.err);
  return new Response(null, { status: 303, headers: { Location: u.pathname + u.search, ...opts.headers } });
}

const oneOf = (map: Record<string, unknown>, v: string, fallback: string) => (v in map ? v : fallback);
const orNull = (v: string) => v || null;
const dateOrNull = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const intOrNull = (v: string) => {
  const n = v.replace(/[^\d]/g, "");
  return n ? parseInt(n, 10) : null;
};
const safeUrl = (v: string) => (v && /^(https?:\/\/|\/)/.test(v) ? v : null);

function needUser(c: Ctx) {
  if (!c.user) throw new HttpError(401, "Silakan login dulu.");
  return c.user;
}
function needAdmin(c: Ctx) {
  const u = needUser(c);
  if (u.role !== "ADMIN") throw new HttpError(403, "Hanya admin.");
  return u;
}

/* ============ rate limit login sederhana (memori) ============ */
const loginFails = new Map<string, { n: number; until: number }>();
function loginBlocked(ip: string) {
  const e = loginFails.get(ip);
  return !!e && e.n >= 10 && e.until > Date.now();
}
function loginFailed(ip: string) {
  const e = loginFails.get(ip);
  const fresh = !e || e.until < Date.now();
  loginFails.set(ip, { n: fresh ? 1 : e!.n + 1, until: Date.now() + 15 * 60_000 });
}

/* ============ notifikasi Discord ============ */
function announceTask(
  t: {
    id: string;
    title: string;
    description: string;
    priority: string;
    dueDate: string | null;
    projectId: string;
    assigneeId: string | null;
  },
  prevAssignee: string | null,
  by: User,
) {
  if (!t.assigneeId || t.assigneeId === prevAssignee || t.assigneeId === by.id) return;
  const assignee = users.get(t.assigneeId);
  const project = projects.get(t.projectId);
  if (assignee && project) return notifyTaskAssigned({ task: t, project, assignee, by });
}
function announceLead(p: ProjectInput & { id: string }, prevLead: string | null, by: User) {
  if (!p.leadId || p.leadId === prevLead || p.leadId === by.id) return;
  const lead = users.get(p.leadId);
  if (lead) return notifyProjectLead({ project: p, lead, by });
}

/* ============ input form ============ */
function projectInput(f: Fields): ProjectInput {
  const d: ProjectInput = {
    name: f.get("name"),
    client: f.get("client"),
    type: oneOf(PROJECT_TYPES, f.get("type"), "WEBSITE"),
    status: oneOf(PROJECT_STATUS, f.get("status"), "PLANNING"),
    description: f.get("description"),
    budget: intOrNull(f.get("budget")),
    startDate: dateOrNull(f.get("startDate")),
    dueDate: dateOrNull(f.get("dueDate")),
    leadId: orNull(f.get("leadId")),
  };
  if (!d.name || !d.client) throw new HttpError(400, "Nama proyek dan klien wajib diisi.");
  if (d.leadId && !users.get(d.leadId)) d.leadId = null;
  return d;
}

function taskInput(f: Fields) {
  const assigneeId = orNull(f.get("assigneeId"));
  return {
    title: f.get("title"),
    description: f.get("description"),
    status: oneOf(TASK_STATUS, f.get("status"), "TODO"),
    priority: oneOf(PRIORITY, f.get("priority"), "MEDIUM"),
    dueDate: dateOrNull(f.get("dueDate")),
    assigneeId: assigneeId && users.get(assigneeId) ? assigneeId : null,
  };
}

function uniqueSlug(base: string, ignoreId?: string) {
  const root = slugify(base) || "karya";
  let slug = root;
  for (let i = 2; ; i++) {
    const found = portfolio.bySlug(slug);
    if (!found || found.id === ignoreId) return slug;
    slug = `${root}-${i}`;
  }
}

/* ================= rute ================= */
const routes: [method: string, pattern: string, handler: Handler][] = [];
const on = (method: string, pattern: string, handler: Handler) => routes.push([method, pattern, handler]);

/* ---------- publik ---------- */
on("GET", "/api/health", () => json({ ok: true }));

on("GET", "/api/public/home", () => {
  const published = portfolio.list({ published: true });
  const all = projects.list();
  const clients = new Set([...all.map((p) => p.client), ...published.map((p) => p.client)].filter(Boolean));
  return json({
    featured: published.filter((p) => p.featured).slice(0, 6),
    stats: {
      done: Math.max(all.filter((p) => p.status === "DONE").length, published.length),
      clients: clients.size,
    },
  });
});

on("GET", "/api/public/portfolio", (c) => {
  const cat = c.url.searchParams.get("kategori");
  return json(portfolio.list({ published: true }).filter((p) => !cat || p.category === cat));
});

on("GET", "/api/public/portfolio/:slug", (c) => {
  const item = portfolio.bySlug(c.params.slug!);
  if (!item || !item.published) throw new HttpError(404, "Karya tidak ditemukan.");
  const others = portfolio
    .list({ published: true })
    .filter((p) => p.id !== item.id)
    .slice(0, 3);
  return json({ item, others });
});

on("POST", "/api/public/inquiries", async (c) => {
  const f = await c.body();
  const to = "/contact";
  if (f.get("website")) return done(c, { ok: "Terima kasih!", to }); // honeypot
  const name = f.get("name");
  const email = f.get("email");
  const message = f.get("message");
  if (!name || !email || !message) return done(c, { err: "Nama, email, dan pesan wajib diisi.", to });
  if (!/^\S+@\S+\.\S+$/.test(email)) return done(c, { err: "Format email tidak valid.", to });
  if (message.length > 5000) return done(c, { err: "Pesan terlalu panjang.", to });
  inquiries.create({
    name: name.slice(0, 120),
    email: email.slice(0, 200),
    company: f.get("company").slice(0, 120),
    service: f.get("service").slice(0, 60),
    budget: f.get("budget").slice(0, 60),
    message,
  });
  return done(c, {
    ok: "Pesan terkirim! Tim kami akan menghubungi Anda dalam 1×24 jam kerja.",
    to: "/contact?terkirim=1",
  });
});

/* ---------- auth ---------- */
on("POST", "/api/auth/login", async (c) => {
  const f = await c.body();
  const next = f.get("next");
  const target = next.startsWith("/dashboard") ? next : "/dashboard";
  const back = `/login?next=${encodeURIComponent(target)}`;
  if (loginBlocked(c.ip)) return done(c, { err: "Terlalu banyak percobaan. Coba lagi 15 menit lagi.", to: back });
  const user = await login(f.get("email"), f.get("password"));
  if (!user) {
    loginFailed(c.ip);
    return done(c, { err: "Email atau password salah.", to: back });
  }
  loginFails.delete(c.ip);
  return done(c, { to: target, headers: { "Set-Cookie": startSession(user.id) } });
});

on("POST", "/api/auth/logout", (c) => done(c, { to: "/login", headers: { "Set-Cookie": endSession(c.req) } }));

on("GET", "/api/me", (c) => json(needUser(c)));

/* ---------- ringkasan dashboard ---------- */
on("GET", "/api/dashboard", (c) => {
  const me = needUser(c);
  const allProjects = projects.list();
  const allTasks = tasks.list();
  const allUsers = users.list();
  const name = new Map(allProjects.map((p) => [p.id, p.name]));
  const todayStr = new Date().toISOString().slice(0, 10);
  const open = allTasks.filter((t) => t.status !== "DONE");
  return json({
    active: allProjects
      .filter((p) => ["PLANNING", "IN_PROGRESS", "REVIEW"].includes(p.status))
      .map((p) => ({
        ...p,
        lead: allUsers.find((u) => u.id === p.leadId) ?? null,
        tasks: allTasks.filter((t) => t.projectId === p.id),
      }))
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")),
    openTasks: open.length,
    overdue: open.filter((t) => t.dueDate && t.dueDate < todayStr).length,
    newInquiries: inquiries.countNew(),
    myTasks: open
      .filter((t) => t.assigneeId === me.id)
      .slice(0, 8)
      .map((t) => ({ ...t, projectName: name.get(t.projectId) ?? "—" })),
    inquiries: inquiries
      .list()
      .filter((q) => q.status === "NEW")
      .slice(0, 4),
  });
});

on("GET", "/api/nav", (c) => {
  needUser(c);
  return json({ newInquiries: inquiries.countNew() });
});

/* ---------- proyek ---------- */
on("GET", "/api/projects", (c) => {
  needUser(c);
  const sp = c.url.searchParams;
  const status = sp.get("status") ?? "";
  const type = sp.get("type") ?? "";
  const q = (sp.get("q") ?? "").toLowerCase();
  const allTasks = tasks.list();
  const allUsers = users.list();
  const list = projects
    .list()
    .filter((p) => (!status || p.status === status) && (!type || p.type === type))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q))
    .map((p) => ({
      ...p,
      lead: allUsers.find((u) => u.id === p.leadId) ?? null,
      tasks: allTasks.filter((t) => t.projectId === p.id),
    }));
  return json({ projects: list, users: allUsers });
});

on("POST", "/api/projects", async (c) => {
  const me = needUser(c);
  const f = await c.body();
  const d = projectInput(f);
  const id = projects.create(d);
  await announceLead({ ...d, id }, null, me);
  return done(c, { ok: "Proyek dibuat.", to: `/dashboard/projects/${id}`, data: { id } });
});

on("GET", "/api/projects/:id", (c) => {
  needUser(c);
  const p = projects.get(c.params.id!);
  if (!p) throw new HttpError(404, "Proyek tidak ditemukan.");
  const allUsers = users.list();
  const byId = (id: string | null) => allUsers.find((u) => u.id === id) ?? null;
  return json({
    project: {
      ...p,
      lead: byId(p.leadId),
      tasks: tasks.byProject(p.id).map((t) => ({ ...t, assignee: byId(t.assigneeId), projectName: p.name })),
    },
    portfolio: portfolio.byProject(p.id),
    users: allUsers,
  });
});

on("POST", "/api/projects/:id", async (c) => {
  const me = needUser(c);
  const before = projects.get(c.params.id!);
  if (!before) throw new HttpError(404, "Proyek tidak ditemukan.");
  const f = await c.body();
  const d = projectInput(f);
  projects.update(before.id, d);
  await announceLead({ ...d, id: before.id }, before.leadId, me);
  return done(c, { ok: "Proyek disimpan.", to: backPath(c, f) });
});

on("POST", "/api/projects/:id/delete", (c) => {
  needUser(c);
  projects.remove(c.params.id!);
  return done(c, { ok: "Proyek dihapus.", to: "/dashboard/projects" });
});

on("POST", "/api/projects/:id/portfolio", (c) => {
  needUser(c);
  const p = projects.get(c.params.id!);
  if (!p) throw new HttpError(404, "Proyek tidak ditemukan.");
  const type = PROJECT_TYPES[p.type] ?? "Website";
  const id = portfolio.create({
    title: p.name,
    slug: uniqueSlug(p.name),
    client: p.client,
    category: type === "UI/UX Design" ? "UI/UX" : PORTFOLIO_CATEGORIES.includes(type) ? type : "Website",
    year: Number((p.dueDate ?? new Date().toISOString()).slice(0, 4)),
    summary: p.description.slice(0, 200),
    content: p.description,
    tags: "",
    coverColor: "#6d5efc",
    imageUrl: null,
    liveUrl: null,
    featured: false,
    published: false,
    sortOrder: 0,
    projectId: p.id,
  });
  return done(c, { ok: "Draf portofolio dibuat.", to: `/dashboard/portfolio/${id}` });
});

/* ---------- tugas ---------- */
on("GET", "/api/tasks", (c) => {
  const me = needUser(c);
  const all = c.url.searchParams.get("filter") === "all";
  const showDone = c.url.searchParams.get("done") === "1";
  const allUsers = users.list();
  const name = new Map(projects.list().map((p) => [p.id, p.name]));
  return json({
    tasks: tasks
      .list()
      .filter((t) => (all || t.assigneeId === me.id) && (showDone || t.status !== "DONE"))
      .map((t) => ({
        ...t,
        assignee: allUsers.find((u) => u.id === t.assigneeId) ?? null,
        projectName: name.get(t.projectId) ?? "—",
      })),
    users: allUsers,
  });
});

on("POST", "/api/tasks", async (c) => {
  const me = needUser(c);
  const f = await c.body();
  const projectId = f.get("projectId");
  if (!projects.get(projectId)) throw new HttpError(400, "Proyek tidak ditemukan.");
  const d = taskInput(f);
  if (!d.title) return done(c, { err: "Judul tugas wajib diisi.", to: backPath(c, f) });
  const id = tasks.create({ ...d, projectId });
  await announceTask({ ...d, id, projectId }, null, me);
  return done(c, { ok: "Tugas ditambahkan.", to: backPath(c, f), data: { id } });
});

on("POST", "/api/tasks/:id", async (c) => {
  const me = needUser(c);
  const before = tasks.get(c.params.id!);
  if (!before) throw new HttpError(404, "Tugas tidak ditemukan.");
  const f = await c.body();
  const d = taskInput(f);
  if (!d.title) return done(c, { err: "Judul tugas wajib diisi.", to: backPath(c, f) });
  tasks.update(before.id, d);
  await announceTask({ ...d, id: before.id, projectId: before.projectId }, before.assigneeId, me);
  return done(c, { ok: "Tugas disimpan.", to: backPath(c, f) });
});

on("POST", "/api/tasks/:id/status", async (c) => {
  needUser(c);
  const f = await c.body();
  tasks.setStatus(c.params.id!, oneOf(TASK_STATUS, f.get("status"), "TODO"));
  return done(c, { to: backPath(c, f) });
});

on("POST", "/api/tasks/:id/delete", async (c) => {
  needUser(c);
  const f = await c.body();
  tasks.remove(c.params.id!);
  return done(c, { ok: "Tugas dihapus.", to: backPath(c, f) });
});

/* ---------- portofolio (admin dashboard) ---------- */
on("GET", "/api/portfolio", (c) => {
  needUser(c);
  return json(portfolio.list());
});

on("GET", "/api/portfolio/:id", (c) => {
  needUser(c);
  const item = c.params.id === "new" ? null : portfolio.get(c.params.id!);
  if (c.params.id !== "new" && !item) throw new HttpError(404, "Karya tidak ditemukan.");
  return json({ item, projects: projects.list().sort((a, b) => a.name.localeCompare(b.name)) });
});

async function savePortfolio(c: Ctx, id: string | null) {
  needUser(c);
  const f = await c.body();
  const title = f.get("title");
  if (!title) return done(c, { err: "Judul wajib diisi.", to: backPath(c, f) });
  const projectId = orNull(f.get("projectId"));
  const d = {
    title,
    slug: uniqueSlug(f.get("slug") || title, id ?? undefined),
    client: f.get("client"),
    category: PORTFOLIO_CATEGORIES.includes(f.get("category")) ? f.get("category") : "Website",
    year: intOrNull(f.get("year")) ?? new Date().getFullYear(),
    summary: f.get("summary"),
    content: f.get("content"),
    tags: f.get("tags"),
    coverColor: /^#[0-9a-f]{6}$/i.test(f.get("coverColor")) ? f.get("coverColor") : "#6d5efc",
    imageUrl: safeUrl(f.get("imageUrl")),
    liveUrl: safeUrl(f.get("liveUrl")),
    featured: f.get("featured") === "on",
    published: f.get("published") === "on",
    sortOrder: intOrNull(f.get("sortOrder")) ?? 0,
    projectId: projectId && projects.get(projectId) ? projectId : null,
  };
  if (id) portfolio.update(id, d);
  else portfolio.create(d);
  return done(c, { ok: "Karya disimpan.", to: "/dashboard/portfolio" });
}
on("POST", "/api/portfolio", (c) => savePortfolio(c, null));
on("POST", "/api/portfolio/:id", (c) => savePortfolio(c, c.params.id!));

on("POST", "/api/portfolio/:id/toggle", async (c) => {
  needUser(c);
  const f = await c.body();
  portfolio.toggle(c.params.id!, f.get("field") === "featured" ? "featured" : "published");
  return done(c, { to: backPath(c, f, "/dashboard/portfolio") });
});

on("POST", "/api/portfolio/:id/delete", (c) => {
  needUser(c);
  portfolio.remove(c.params.id!);
  return done(c, { ok: "Karya dihapus.", to: "/dashboard/portfolio" });
});

/* ---------- inbox ---------- */
on("GET", "/api/inquiries", (c) => {
  needUser(c);
  const status = c.url.searchParams.get("status");
  return json(inquiries.list().filter((q) => !status || q.status === status));
});

on("POST", "/api/inquiries/:id/status", async (c) => {
  needUser(c);
  const f = await c.body();
  inquiries.setStatus(c.params.id!, oneOf(INQUIRY_STATUS, f.get("status"), "NEW"));
  return done(c, { to: backPath(c, f, "/dashboard/inbox") });
});

on("POST", "/api/inquiries/:id/delete", async (c) => {
  needUser(c);
  const f = await c.body();
  inquiries.remove(c.params.id!);
  return done(c, { ok: "Pesan dihapus.", to: backPath(c, f, "/dashboard/inbox") });
});

/* ---------- tim & akun ---------- */
on("GET", "/api/team", (c) => {
  const me = needUser(c);
  const open = tasks.list().filter((t) => t.status !== "DONE");
  return json({
    users: users.list().map((u) => ({ ...u, openTasks: open.filter((t) => t.assigneeId === u.id).length })),
    discord: me.role === "ADMIN" ? settings.discord() : null,
  });
});

on("POST", "/api/users", async (c) => {
  needAdmin(c);
  const f = await c.body();
  const to = "/dashboard/team";
  const name = f.get("name");
  const email = f.get("email").toLowerCase();
  const password = f.get("password");
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return done(c, { err: "Lengkapi data. Password minimal 8 karakter.", to });
  }
  if (users.byEmail(email)) return done(c, { err: "Email sudah terdaftar.", to });
  users.create({
    name,
    email,
    role: oneOf(ROLES, f.get("role"), "MEMBER"),
    passwordHash: await hashPassword(password),
  });
  return done(c, { ok: `Akun ${name} berhasil dibuat.`, to });
});

on("POST", "/api/users/:id/delete", (c) => {
  const me = needAdmin(c);
  if (c.params.id === me.id) return done(c, { err: "Tidak bisa menghapus akun sendiri.", to: "/dashboard/team" });
  users.remove(c.params.id!);
  return done(c, { ok: "Akun dihapus.", to: "/dashboard/team" });
});

on("POST", "/api/users/:id/discord", async (c) => {
  const me = needUser(c);
  const id = c.params.id!;
  if (id !== me.id && me.role !== "ADMIN") throw new HttpError(403, "Hanya admin yang bisa mengubah akun lain.");
  const f = await c.body();
  const discordId = f.get("discordId").replace(/[<@!>]/g, "");
  if (discordId && !/^\d{15,21}$/.test(discordId)) {
    return done(c, { err: "Discord ID berupa 17–20 digit angka (bukan username).", to: "/dashboard/team" });
  }
  users.setDiscordId(id, discordId);
  return done(c, { ok: discordId ? "Discord ID disimpan." : "Discord ID dihapus.", to: "/dashboard/team" });
});

on("POST", "/api/account/password", async (c) => {
  const me = needUser(c);
  const f = await c.body();
  const to = "/dashboard/team";
  const hash = users.passwordHash(me.id);
  if (!hash || !(await verifyPassword(f.get("current"), hash))) return done(c, { err: "Password lama salah.", to });
  if (f.get("next").length < 8) return done(c, { err: "Password baru minimal 8 karakter.", to });
  users.setPassword(me.id, await hashPassword(f.get("next")));
  return done(c, { ok: "Password berhasil diubah.", to });
});

/* ---------- Discord ---------- */
on("POST", "/api/settings/discord", async (c) => {
  needAdmin(c);
  const f = await c.body();
  const to = "/dashboard/team";
  const webhookUrl = f.get("webhookUrl");
  if (webhookUrl && !isWebhookUrl(webhookUrl)) {
    return done(c, { err: "Link webhook tidak valid. Contoh: https://discord.com/api/webhooks/123…/abc…", to });
  }
  settings.setDiscord({ webhookUrl, enabled: f.get("enabled") === "on" });
  return done(c, {
    ok: webhookUrl ? "Pengaturan Discord disimpan." : "Webhook dikosongkan, notifikasi Discord mati.",
    to,
  });
});

on("POST", "/api/settings/discord/test", async (c) => {
  const me = needAdmin(c);
  const to = "/dashboard/team";
  const { webhookUrl } = settings.discord();
  if (!webhookUrl) return done(c, { err: "Isi dan simpan link webhook dulu.", to });
  try {
    await sendTest(webhookUrl, me);
    return done(c, { ok: "Pesan uji terkirim. Cek channel Discord Anda.", to });
  } catch (e) {
    return done(c, { err: "Gagal mengirim ke Discord: " + (e as Error).message, to });
  }
});

/* ================= dispatcher ================= */
function match(pattern: string, path: string) {
  const a = pattern.split("/");
  const b = path.split("/");
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.startsWith(":")) params[a[i]!.slice(1)] = decodeURIComponent(b[i]!);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

/** Tolak POST lintas situs (cookie SameSite=Lax sudah menahan sebagian besar; ini lapisan kedua) */
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function handleApi(req: Request, ip = "unknown"): Promise<Response> {
  const url = new URL(req.url);
  const c: Ctx = { req, url, params: {}, user: currentUser(req), ip, body: () => readBody(req) };
  try {
    if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req))
      throw new HttpError(403, "Origin tidak diizinkan.");
    for (const [method, pattern, handler] of routes) {
      if (method !== req.method && !(method === "GET" && req.method === "HEAD")) continue;
      const params = match(pattern, url.pathname);
      if (!params) continue;
      c.params = params;
      return await handler(c);
    }
    throw new HttpError(404, "Endpoint tidak ditemukan.");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof HttpError ? e.message : "Terjadi kesalahan di server.";
    if (status === 500) console.error("[api]", req.method, url.pathname, e);
    if (wantsJson(req) || req.method === "GET") return json({ ok: false, error: message }, status);
    if (status === 401) return done(c, { to: "/login" });
    return done(c, { err: message, to: backPath(c) });
  }
}
