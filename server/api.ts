// Router API Bun vanilla. Semua endpoint di bawah /api.
// - Form HTML biasa → balas 303 redirect kembali ke halaman (dengan ?ok=<kode> / ?err=<kode>, teks di shared/messages.ts)
// - Request JSON (Accept: application/json) → balas JSON (teks pesan + kode)
// - Form edit (proyek, tugas, karya) mengirim `version` = updatedAt saat halaman dibuka; bila data sudah berubah
//   di tab lain / oleh orang lain, simpan ditolak dengan err=stale (tidak pernah menimpa diam-diam).
// - Hak akses: semua anggota boleh mengelola proyek/tugas/portofolio (termasuk tayang & unggulan);
//   HANYA admin yang boleh menghapus proyek, karya, inquiry, dan mengelola akun.
import type {
  ActiveProject,
  DashboardSummary,
  Inquiry,
  NavSummary,
  PortfolioEditResponse,
  Project,
  ProjectDetailResponse,
  ProjectListItem,
  ProjectsResponse,
  PublicHome,
  PublicPortfolioDetail,
  Task,
  TaskCounts,
  TasksResponse,
  TeamResponse,
  User,
} from "../shared/types";
import {
  ACTIVE_PROJECT_STATUSES,
  coverColorOr,
  DEFAULT_COVER,
  INQUIRY_STATUS_ALL,
  isActiveProject,
  isAdmin,
  MAX_FEATURED,
  MAX_LEN,
  MAX_TASK_LINES,
  MIN_PASSWORD,
  portfolioCategory,
  PRIORITY,
  PROJECT_STATUS,
  PROJECT_TYPES,
  ROLES,
  TASK_STATUS,
} from "../shared/constants";
import {
  currentYear,
  cutText,
  doneCount,
  elapsed,
  FRAGMENT_RE,
  ISO_DAY_RE,
  isDone,
  isDueWithin,
  isEmail,
  isLate,
  isLink,
  liveTasks,
  normEmail,
  openTasks,
  parseRupiah,
  relDays,
  safeNext,
  slugify,
  today,
} from "../shared/format";
import {
  ERR,
  inquiryStatusOk,
  OK,
  projectStatusOk,
  taskStatusOk,
  type ErrCode,
  type OkCode,
} from "../shared/messages";
import {
  currentUser,
  endSession,
  hashPassword,
  hasSessionCookie,
  login,
  sessionId,
  startSession,
  verifyPassword,
} from "./auth";
import {
  INQUIRY_NOTIFY_CAP_MS,
  isWebhookUrl,
  notifyInquiry,
  notifyProjectLead,
  notifyTaskAssigned,
  notifyTasksAssigned,
  sendTest,
} from "./discord";
import { FailWindow } from "./limits";
import {
  inquiries,
  portfolio,
  projects,
  sessions,
  settings,
  tasks,
  users,
  type ProjectInput,
  type TaskInput,
} from "./repo";

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

/** Error dengan kode pesan (teks di shared/messages.ts) */
class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrCode,
  ) {
    super(ERR[code]);
  }
}

/** Halaman dashboard tujuan redirect */
const PAGES = {
  projects: "/dashboard/projects",
  portfolio: "/dashboard/portfolio",
  inbox: "/dashboard/inbox",
  team: "/dashboard/team",
  tasks: "/dashboard/tasks",
} as const;

const json = (data: unknown, status = 200, headers: HeadersInit = {}) => Response.json(data, { status, headers });

function wantsJson(req: Request) {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("application/json") || (req.headers.get("content-type") ?? "").includes("application/json");
}

async function readBody(req: Request): Promise<Fields> {
  const type = req.headers.get("content-type") ?? "";
  const map = new Map<string, string>();
  if (type.includes("application/json")) {
    const obj = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) map.set(k, v === true ? "on" : v == null ? "" : String(v));
  } else if (type.includes("form")) {
    // body rusak (mis. multipart tanpa boundary) = form kosong → error validasi biasa, bukan 500
    const fd = await req.formData().catch(() => null);
    for (const [k, v] of fd?.entries() ?? []) if (typeof v === "string") map.set(k, v);
  }
  return { get: (k) => (map.get(k) ?? "").trim(), has: (k) => map.has(k) };
}

/** Halaman tujuan setelah form: field _back (boleh dengan #fragment), atau Referer (hanya path lokal) */
function backPath(c: Ctx, f?: Fields, fallback = "/dashboard") {
  for (const raw of [f?.get("_back"), c.req.headers.get("referer")]) {
    if (!raw) continue;
    try {
      const u = new URL(raw, c.url.origin);
      const p = u.pathname + u.search;
      if (p.startsWith("/") && !p.startsWith("//")) return p + (FRAGMENT_RE.test(u.hash) ? u.hash : "");
    } catch {}
  }
  return fallback;
}

type DoneOpts = {
  ok?: OkCode;
  err?: ErrCode;
  to?: string;
  data?: unknown;
  headers?: Record<string, string>;
  /** keterangan tambahan, hanya di respons JSON (tidak pernah di URL) */
  detail?: string;
  /** parameter tambahan di URL redirect (nilai sederhana, mis. id baru atau saran slug) */
  query?: Record<string, string>;
  /** ganti #fragmen tujuan */
  hash?: string;
};

/** Selesai: JSON untuk fetch (teks + kode), redirect 303 + kode pesan untuk form */
function done(c: Ctx, opts: DoneOpts) {
  if (wantsJson(c.req)) {
    return json(
      {
        ok: !opts.err,
        message: opts.ok && OK[opts.ok],
        error: opts.err && ERR[opts.err],
        code: opts.err ?? opts.ok,
        detail: opts.detail,
        data: opts.data,
        redirect: opts.to,
      },
      opts.err ? 400 : 200,
      opts.headers,
    );
  }
  const u = new URL(opts.to ?? "/dashboard", c.url.origin);
  u.searchParams.delete("ok");
  u.searchParams.delete("err");
  for (const [k, v] of Object.entries(opts.query ?? {})) u.searchParams.set(k, v);
  if (opts.ok) u.searchParams.set("ok", opts.ok);
  if (opts.err) u.searchParams.set("err", opts.err);
  const h = opts.hash ?? u.hash;
  const hash = FRAGMENT_RE.test(h) ? h : "";
  return new Response(null, { status: 303, headers: { Location: u.pathname + u.search + hash, ...opts.headers } });
}

/** Data yang dicari, atau lempar HttpError (default 404) */
function found<T>(v: T | null | undefined, code: ErrCode, status = 404): T {
  if (!v) throw new HttpError(status, code);
  return v;
}

const oneOf = (map: Record<string, unknown>, v: string, fallback: string) => (Object.hasOwn(map, v) ? v : fallback);
/** Nilai pilihan yang wajib dikenal (kosong = fallback); nilai asing ditolak, tidak diganti diam-diam */
function pick(map: Record<string, unknown>, v: string, fallback: string, code: ErrCode = "status-invalid") {
  if (!v) return fallback;
  if (!Object.hasOwn(map, v)) throw new HttpError(400, code);
  return v;
}
const orNull = (v: string) => v || null;
/** Tanggal "YYYY-MM-DD" (tahun 2000–2100) atau null bila kosong; selain itu error */
function dateField(v: string, code: ErrCode = "date-invalid") {
  if (!v) return null;
  const m = ISO_DAY_RE.exec(v);
  // tanggal kalender sungguhan (2026-02-31 ditolak, bukan digeser diam-diam)
  const d = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : null;
  if (!m || !d || +m[1]! < 2000 || +m[1]! > 2100 || d.getUTCMonth() !== +m[2]! - 1 || d.getUTCDate() !== +m[3]!) {
    throw new HttpError(400, code);
  }
  return v;
}
/** Teks dengan panjang maksimum (MAX_LEN); lebih panjang = 400 too-long, tidak dipotong diam-diam */
function within(v: string, max: number) {
  if (v.length > max) throw new HttpError(400, "too-long");
  return v;
}

/** Form edit membawa `version` (updatedAt saat dibuka). Beda = data sudah diubah tempat lain → tolak (409 stale). */
function checkVersion(f: Fields, current: string) {
  if (f.has("version") && f.get("version") !== current) throw new HttpError(409, "stale");
}

function needUser(c: Ctx) {
  if (!c.user) throw new HttpError(401, "login-required");
  return c.user;
}
function needAdmin(c: Ctx, code: ErrCode = "admin-only") {
  const u = needUser(c);
  if (!isAdmin(u)) throw new HttpError(403, code);
  return u;
}

/** id bila datanya ada di database, selain itu null */
async function existing(id: string | null, get: (id: string) => Promise<unknown>) {
  return id && (await get(id)) ? id : null;
}
const validUser = (id: string | null) => existing(id, users.get);

/* ============ rate limit login (memori per instance) ============
 * Kunci utama = IP + email (satu orang salah ketik tidak mengunci rekan satu kantor/NAT),
 * plus batas per IP yang lebih longgar. Jendela 15 menit dihitung dari kegagalan pertama dan
 * TIDAK diperpanjang oleh percobaan saat sudah diblokir. */
const LOGIN_WINDOW = 15 * 60_000;
const LIMIT_PER_ACCOUNT = 10;
const LIMIT_PER_IP = 50;
/** Password lebih panjang dari ini tidak di-hash sama sekali (langsung gagal), agar tidak bisa dipakai membebani CPU */
const MAX_LOGIN_PASSWORD = 1024;
const loginFails = new FailWindow(LOGIN_WINDOW);
const accountKey = (ip: string, email: string) => `${ip}|${email}`;
const loginBlocked = (ip: string, email: string) =>
  loginFails.blocked(accountKey(ip, email), LIMIT_PER_ACCOUNT) || loginFails.blocked(ip, LIMIT_PER_IP);
function loginFailed(ip: string, email: string) {
  loginFails.fail(accountKey(ip, email), LIMIT_PER_ACCOUNT);
  loginFails.fail(ip, LIMIT_PER_IP);
}

/* ============ notifikasi Discord ============ */
/** Hanya bila ada orang yang baru ditunjuk, dan bukan diri sendiri */
const shouldNotify = (next: string | null, prev: string | null, by: User): next is string =>
  !!next && next !== prev && next !== by.id;

async function announceTask(
  t: Pick<Task, "id" | "title" | "description" | "priority" | "dueDate" | "projectId" | "assigneeId">,
  prevAssignee: string | null,
  by: User,
) {
  if (!shouldNotify(t.assigneeId, prevAssignee, by)) return;
  const [assignee, project] = await Promise.all([users.get(t.assigneeId), projects.get(t.projectId)]);
  if (assignee && project) await notifyTaskAssigned({ task: t, project, assignee, by });
}
async function announceLead(p: ProjectInput & { id: string }, prevLead: string | null, by: User) {
  if (!shouldNotify(p.leadId, prevLead, by)) return;
  const lead = await users.get(p.leadId);
  if (lead) await notifyProjectLead({ project: p, lead, by });
}

/* ============ input form ============ */
async function projectInput(f: Fields): Promise<ProjectInput> {
  const name = f.get("name");
  const client = f.get("client");
  if (!name && !client) throw new HttpError(400, "project-required");
  if (!name) throw new HttpError(400, "project-name-required");
  if (!client) throw new HttpError(400, "project-client-required");
  within(name, MAX_LEN.projectName);
  within(client, MAX_LEN.client);
  const budget = parseRupiah(f.get("budget"));
  if (budget === "invalid") throw new HttpError(400, "budget-invalid");
  const startDate = dateField(f.get("startDate"));
  const dueDate = dateField(f.get("dueDate"));
  if (startDate && dueDate && dueDate < startDate) throw new HttpError(400, "project-dates");
  return {
    name,
    client,
    type: oneOf(PROJECT_TYPES, f.get("type"), "WEBSITE"),
    status: pick(PROJECT_STATUS, f.get("status"), "PLANNING"),
    description: within(f.get("description"), MAX_LEN.description),
    budget,
    startDate,
    dueDate,
    leadId: await validUser(orNull(f.get("leadId"))),
  };
}

/** Isian tugas. Panjang judul dicek pemanggil (tambah: per baris; ubah: seluruh judul). */
async function taskInput(f: Fields): Promise<Omit<TaskInput, "projectId">> {
  return {
    title: f.get("title"),
    description: within(f.get("description"), MAX_LEN.description),
    status: pick(TASK_STATUS, f.get("status"), "TODO"),
    priority: oneOf(PRIORITY, f.get("priority"), "MEDIUM"),
    dueDate: dateField(f.get("dueDate"), "task-date-invalid"),
    assigneeId: await validUser(orNull(f.get("assigneeId"))),
  };
}

async function uniqueSlug(base: string, ignoreId?: string | null) {
  const root = slugify(base) || "karya";
  let slug = root;
  for (let i = 2; ; i++) {
    const taken = await portfolio.bySlug(slug);
    if (!taken || taken.id === ignoreId) return slug;
    slug = `${slugify(root, 56)}-${i}`;
  }
}

/* ============ bentuk respons ============ */
type ById = (id: string | null) => User | null;
const userById =
  (list: User[]): ById =>
  (id) =>
    list.find((u) => u.id === id) ?? null;
/** Nama proyek per id ("—" bila tidak ada) */
function projectNames(list: Project[]) {
  const name = new Map(list.map((p) => [p.id, p.name]));
  return (id: string) => name.get(id) ?? "—";
}
const projectWithTasks = (p: Project, allTasks: Task[], byId: ById) => ({
  ...p,
  lead: byId(p.leadId),
  tasks: allTasks.filter((t) => t.projectId === p.id),
});
const taskWithRefs = (t: Task, projectName: string, byId: ById) => ({
  ...t,
  assignee: byId(t.assigneeId),
  projectName,
});
/** Jumlah tugas hidup per penanggung jawab (untuk pilihan "Budi · 2 terbuka") */
function loadByUser(live: Task[]) {
  const load: Record<string, number> = {};
  for (const t of live) if (t.assigneeId) load[t.assigneeId] = (load[t.assigneeId] ?? 0) + 1;
  return load;
}

/** Selisih progres di bawah waktu berjalan yang dianggap tertinggal (15 poin) */
const AT_RISK_MARGIN = 0.15;
/** Proyek berjalan + sinyal jadwal untuk ringkasan.
 * late   = lewat deadline (WIB).
 * atRisk = belum lewat & belum semua tugas selesai, dan (progres < waktu berjalan − 15 poin,
 *          atau deadline ≤ 7 hari lagi dengan progres < waktu berjalan / tanpa tugas / tanpa tanggal mulai). */
function activeProject(p: Project, allTasks: Task[], byId: ById): ActiveProject {
  const base = projectWithTasks(p, allTasks, byId);
  const totalTasks = base.tasks.length;
  const doneTasks = doneCount(base.tasks);
  const time = elapsed(p);
  const daysLeft = relDays(p.dueDate);
  const late = isLate(p);
  const frac = totalTasks ? doneTasks / totalTasks : null;
  const behind = frac != null && time != null && frac < time - AT_RISK_MARGIN;
  const dueSoon = daysLeft != null && daysLeft <= 7;
  const atRisk = !late && frac !== 1 && (behind || (dueSoon && (frac == null || time == null || frac < time)));
  return { ...base, doneTasks, totalTasks, elapsed: time, daysLeft, late, atRisk };
}
/** lewat deadline → berisiko → lainnya, lalu deadline terdekat (tanpa deadline paling bawah) */
const healthRank = (p: ActiveProject) => (p.late ? 0 : p.atRisk ? 1 : 2);
const byDue = (a: { dueDate: string | null }, b: { dueDate: string | null }) =>
  (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
const byHealth = (a: ActiveProject, b: ActiveProject) => healthRank(a) - healthRank(b) || byDue(a, b);

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
/** Urutan "tugas saya": lewat deadline dulu, lalu deadline terdekat (tanpa deadline paling bawah), lalu prioritas */
const byUrgency = (a: Task, b: Task) =>
  Number(isLate(b)) - Number(isLate(a)) || byDue(a, b) || (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);

/** Urutan daftar proyek (stabil; tidak berubah karena sekadar diedit):
 * deadline (default) = berjalan dulu (lewat deadline paling atas), lalu deadline terdekat, lalu nama;
 * name = A–Z; progress = progres terendah dulu; updated = terakhir diubah dulu. */
const PROJECT_SORTS = ["deadline", "name", "progress", "updated"] as const;
type ProjectSort = (typeof PROJECT_SORTS)[number];
const pct = (p: { tasks: Task[] }) => (p.tasks.length ? doneCount(p.tasks) / p.tasks.length : -1);
const byName = (a: Project, b: Project) => a.name.localeCompare(b.name, "id", { sensitivity: "base" });
function sortProjects(list: ProjectListItem[], sort: ProjectSort) {
  const groupRank = (p: Project) => (isActiveProject(p) ? (isLate(p) ? 0 : 1) : 2);
  const cmp: Record<ProjectSort, (a: ProjectListItem, b: ProjectListItem) => number> = {
    deadline: (a, b) => groupRank(a) - groupRank(b) || byDue(a, b) || byName(a, b),
    name: byName,
    progress: (a, b) => pct(a) - pct(b) || byName(a, b),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || byName(a, b),
  };
  return list.sort(cmp[sort]);
}

/** Hitungan drill-down dari tugas hidup */
const taskCounts = (live: Task[]): TaskCounts => ({
  overdue: live.filter(isLate).length,
  dueThisWeek: live.filter((t) => isDueWithin(t.dueDate, 7)).length,
  unassigned: live.filter((t) => !t.assigneeId).length,
});

/** Aksi sederhana pada satu baris (:id), lalu kembali ke halaman asal (_back / Referer / fallback).
 * fn boleh mengembalikan kode pesan sukses (mis. sesuai status baru); selain itu opts.ok.
 * fn wajib memeriksa bahwa datanya ada (found → 404 + kode "…-not-found"). */
function idAction(
  fn: (id: string, f: Fields, me: User) => Promise<OkCode | void>,
  opts: { ok?: OkCode; fallback?: string; admin?: ErrCode } = {},
): Handler {
  return async (c) => {
    const me = opts.admin ? needAdmin(c, opts.admin) : needUser(c);
    const f = await c.body();
    const ok = (await fn(c.params.id!, f, me)) || opts.ok;
    return done(c, { ok, to: backPath(c, f, opts.fallback) });
  };
}

/* ================= rute ================= */
const routes: [method: string, pattern: string, handler: Handler][] = [];
const on = (method: string, pattern: string, handler: Handler) => routes.push([method, pattern, handler]);

/* ---------- publik ---------- */
on("GET", "/api/health", () => json({ ok: true }));

on("GET", "/api/public/home", async () => {
  const [published, all] = await Promise.all([portfolio.list({ published: true }), projects.list()]);
  const clients = new Set([...all.map((p) => p.client), ...published.map((p) => p.client)].filter(Boolean));
  return json({
    featured: published.filter((p) => p.featured).slice(0, MAX_FEATURED),
    stats: {
      done: Math.max(all.filter((p) => p.status === "DONE").length, published.length),
      clients: clients.size,
    },
  } satisfies PublicHome);
});

on("GET", "/api/public/portfolio", async (c) => {
  const cat = c.url.searchParams.get("kategori");
  return json((await portfolio.list({ published: true })).filter((p) => !cat || p.category === cat));
});

on("GET", "/api/public/portfolio/:slug", async (c) => {
  const hit = await portfolio.bySlug(c.params.slug!);
  const item = found(hit?.published ? hit : null, "pf-not-found");
  const others = (await portfolio.list({ published: true })).filter((p) => p.id !== item.id).slice(0, 3);
  return json({ item, others } satisfies PublicPortfolioDetail);
});

on("POST", "/api/public/inquiries", async (c) => {
  const f = await c.body();
  const to = "/contact";
  const sent = () => done(c, { ok: "inquiry-sent", to: "/contact?terkirim=1" });
  // honeypot: balasan sama persis dengan kiriman sungguhan (bot tidak bisa membedakan), tapi tidak disimpan
  if (f.get("website")) return sent();
  const name = f.get("name");
  const email = f.get("email");
  const message = f.get("message");
  if (!name || !email || !message) return done(c, { err: "inquiry-required", to });
  if (!isEmail(email)) return done(c, { err: "inquiry-email", to });
  if (message.length > 5000) return done(c, { err: "inquiry-too-long", to });
  const d = {
    name: name.slice(0, 120),
    email: email.slice(0, 200),
    company: f.get("company").slice(0, 120),
    service: f.get("service").slice(0, 60),
    budget: f.get("budget").slice(0, 60),
    message,
  };
  const id = await inquiries.create(d);
  // Ditunggu, tapi maks. INQUIRY_NOTIFY_CAP_MS: di serverless (Vercel) instance bisa dibekukan setelah respons
  // terkirim, jadi kiriman yang tidak ditunggu bisa hilang. Lewat batas atau gagal → hanya dicatat di log,
  // form tetap sukses (notifyInquiry tidak pernah melempar error).
  await notifyInquiry({ id, ...d }, INQUIRY_NOTIFY_CAP_MS);
  return sent();
});

/* ---------- auth ---------- */
on("POST", "/api/auth/login", async (c) => {
  const f = await c.body();
  const target = safeNext(f.get("next")) ?? "/dashboard";
  const email = normEmail(f.get("email"));
  // tanpa JS, email tetap terisi setelah gagal (password tidak pernah dibawa)
  const back = `/login?next=${encodeURIComponent(target)}${email ? `&email=${encodeURIComponent(email.slice(0, 200))}` : ""}`;
  if (loginBlocked(c.ip, email)) return done(c, { err: "login-blocked", to: back });
  const password = f.get("password");
  const user = password.length <= MAX_LOGIN_PASSWORD ? await login(email, password) : null;
  if (!user) {
    loginFailed(c.ip, email);
    return done(c, { err: "login-failed", to: back });
  }
  loginFails.clear(accountKey(c.ip, email));
  return done(c, { to: target, headers: { "Set-Cookie": await startSession(user.id) } });
});

on("POST", "/api/auth/logout", async (c) =>
  done(c, { to: "/login", headers: { "Set-Cookie": await endSession(c.req) } }),
);

on("GET", "/api/me", (c) => json(needUser(c)));

/* ---------- ringkasan dashboard ---------- */
on("GET", "/api/dashboard", async (c) => {
  const me = needUser(c);
  const [allProjects, allTasks, allUsers, allInquiries, allPortfolio] = await Promise.all([
    projects.list(),
    tasks.list(),
    users.list(),
    inquiries.list(),
    portfolio.list(),
  ]);
  const byId = userById(allUsers);
  const nameOf = projectNames(allProjects);
  const live = liveTasks(allTasks, allProjects);
  const counts = taskCounts(live);
  const mine = live.filter((t) => t.assigneeId === me.id).sort(byUrgency);
  const onHold = new Set(allProjects.filter((p) => p.status === "ON_HOLD").map((p) => p.id));
  const linked = new Set(allPortfolio.map((i) => i.projectId));
  const newOnes = allInquiries.filter((q) => q.status === "NEW");
  // menunggu review: paling lama di Review dulu (updatedAt ≈ saat dipindah ke Review)
  const review = live.filter((t) => t.status === "REVIEW").sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const active = allProjects
    .filter(isActiveProject)
    .map((p) => activeProject(p, allTasks, byId))
    .sort(byHealth);
  const withName = (t: Task) => ({ ...t, projectName: nameOf(t.projectId) });
  return json({
    active,
    activeProjects: active.length,
    projectsAtRisk: active.filter((p) => p.late || p.atRisk).length,
    openTasks: live.length,
    overdue: counts.overdue,
    dueThisWeek: counts.dueThisWeek,
    dueToday: live.filter((t) => relDays(t.dueDate) === 0).length,
    unassigned: counts.unassigned,
    onHoldTasks: openTasks(allTasks).filter((t) => onHold.has(t.projectId)).length,
    doneWithoutPortfolio: allProjects.filter((p) => p.status === "DONE" && !linked.has(p.id)).length,
    newInquiries: newOnes.length,
    oldestNewInquiryAt: newOnes.reduce<string | null>((min, q) => (!min || q.createdAt < min ? q.createdAt : min), null),
    myOpenTasks: mine.length,
    myOverdue: mine.filter(isLate).length,
    myDueThisWeek: mine.filter((t) => isDueWithin(t.dueDate, 7)).length,
    myDueToday: mine.filter((t) => relDays(t.dueDate) === 0).length,
    myTasks: mine.slice(0, 8).map(withName),
    reviewTasks: review.length,
    oldestReviewAt: review[0]?.updatedAt ?? null,
    review: review.slice(0, 4).map(withName),
    inquiries: newOnes.slice(0, 4),
  } satisfies DashboardSummary);
});

on("GET", "/api/nav", async (c) => {
  needUser(c);
  return json({ newInquiries: await inquiries.countNew() } satisfies NavSummary);
});

/* ---------- proyek ---------- */
on("GET", "/api/projects", async (c) => {
  needUser(c);
  const sp = c.url.searchParams;
  // status yang tidak dikenal diabaikan (sama dengan tanpa filter)
  const rawStatus = sp.get("status") ?? "";
  const status = rawStatus === "ACTIVE" || Object.hasOwn(PROJECT_STATUS, rawStatus) ? rawStatus : "";
  const type = sp.get("type") ?? "";
  const q = (sp.get("q") ?? "").toLowerCase();
  // pf=belum: hanya proyek yang belum punya karya portofolio
  const noPortfolio = sp.get("pf") === "belum";
  const sort = (PROJECT_SORTS as readonly string[]).includes(sp.get("sort") ?? "") ? (sp.get("sort") as ProjectSort) : "deadline";
  const [allProjects, allTasks, allUsers, allPortfolio] = await Promise.all([
    projects.list(),
    tasks.list(),
    users.list(),
    portfolio.list(),
  ]);
  const byId = userById(allUsers);
  const linked = new Set(allPortfolio.map((i) => i.projectId));
  // status=ACTIVE = semua status di ACTIVE_PROJECT_STATUSES
  const statusOk = (p: Project) => !status || p.status === status || (status === "ACTIVE" && isActiveProject(p));
  const matching = allProjects
    .filter((p) => !type || p.type === type)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q))
    .filter((p) => !noPortfolio || !linked.has(p.id));
  const counts: Record<string, number> = { ALL: matching.length, ACTIVE: 0 };
  for (const k of Object.keys(PROJECT_STATUS)) counts[k] = 0;
  for (const p of matching) {
    counts[p.status] = (counts[p.status] ?? 0) + 1;
    if (ACTIVE_PROJECT_STATUSES.includes(p.status)) counts.ACTIVE!++;
  }
  const list = sortProjects(
    matching.filter(statusOk).map((p) => ({ ...projectWithTasks(p, allTasks, byId), hasPortfolio: linked.has(p.id) })),
    sort,
  );
  return json({ projects: list, users: allUsers, counts } satisfies ProjectsResponse);
});

on("POST", "/api/projects", async (c) => {
  const me = needUser(c);
  const f = await c.body();
  const d = await projectInput(f);
  const id = await projects.create(d);
  await announceLead({ ...d, id }, null, me);
  // dibuat dari inquiry (Inbox → "Jadikan proyek"): tandai inquiry-nya Jadi proyek
  const inq = f.get("inquiryId") ? await inquiries.get(f.get("inquiryId")) : null;
  if (inq) await inquiries.setStatus(inq.id, "WON");
  return done(c, { ok: inq ? "project-created-from-inquiry" : "project-created", to: `${PAGES.projects}/${id}`, data: { id } });
});

on("GET", "/api/projects/:id", async (c) => {
  needUser(c);
  const p = found(await projects.get(c.params.id!), "project-not-found");
  const [allUsers, allTasks, allProjects, linked] = await Promise.all([
    users.list(),
    tasks.list(),
    projects.list(),
    portfolio.byProject(p.id),
  ]);
  const byId = userById(allUsers);
  const projectTasks = allTasks.filter((t) => t.projectId === p.id);
  return json({
    project: { ...p, lead: byId(p.leadId), tasks: projectTasks.map((t) => taskWithRefs(t, p.name, byId)) },
    portfolio: linked,
    users: allUsers,
    load: loadByUser(liveTasks(allTasks, allProjects)),
  } satisfies ProjectDetailResponse);
});

on("POST", "/api/projects/:id", async (c) => {
  const me = needUser(c);
  const before = found(await projects.get(c.params.id!), "project-not-found");
  const f = await c.body();
  checkVersion(f, before.updatedAt);
  const d = await projectInput(f);
  await projects.update(before.id, d);
  await announceLead({ ...d, id: before.id }, before.leadId, me);
  return done(c, { ok: "project-saved", to: backPath(c, f) });
});

/** Ganti status proyek saja (tanpa membuka form edit lengkap) */
on(
  "POST",
  "/api/projects/:id/status",
  idAction(async (id, f) => {
    const p = found(await projects.get(id), "project-not-found");
    const status = pick(PROJECT_STATUS, f.get("status"), "", "status-invalid");
    if (!status) throw new HttpError(400, "status-invalid");
    if (status !== p.status) await projects.setStatus(p.id, status);
    return projectStatusOk(status);
  }),
);

on("POST", "/api/projects/:id/delete", async (c) => {
  needAdmin(c, "admin-only-delete");
  const p = found(await projects.get(c.params.id!), "project-not-found");
  await projects.remove(p.id);
  return done(c, { ok: "project-deleted", to: PAGES.projects });
});

/** Proyek → draf karya portofolio. Idempoten: bila proyek sudah punya karya, buka editornya. */
on("POST", "/api/projects/:id/portfolio", async (c) => {
  needUser(c);
  const p = found(await projects.get(c.params.id!), "project-not-found");
  const linked = await portfolio.byProject(p.id);
  if (linked[0]) return done(c, { ok: "portfolio-exists", to: `${PAGES.portfolio}/${linked[0].id}` });
  const type = PROJECT_TYPES[p.type] ?? "Website";
  const id = await portfolio.create({
    title: p.name,
    slug: await uniqueSlug(p.name),
    client: p.client,
    category: portfolioCategory(type === "UI/UX Design" ? "UI/UX" : type),
    year: Number((p.dueDate ?? today()).slice(0, 4)),
    summary: cutText(p.description, 200),
    content: p.description,
    tags: "",
    coverColor: DEFAULT_COVER,
    imageUrl: null,
    liveUrl: null,
    featured: false,
    published: false,
    sortOrder: 0,
    projectId: p.id,
  });
  return done(c, { ok: "portfolio-draft-created", to: `${PAGES.portfolio}/${id}` });
});

/* ---------- tugas ---------- */
on("GET", "/api/tasks", async (c) => {
  const me = needUser(c);
  const sp = c.url.searchParams;
  const all = sp.get("filter") === "all";
  const showDone = sp.get("done") === "1";
  // drill-down (dari tile ringkasan / tim): due=overdue|week, assignee=none|<userId>, status=<status belum selesai>.
  // Bila salah satunya ada, daftar = tugas hidup saja (belum selesai, proyek berjalan) dan `done` diabaikan;
  // assignee menggantikan cakupan filter=mine|all.
  const due = sp.get("due");
  const assignee = sp.get("assignee") ?? "";
  const rawStatus = sp.get("status") ?? "";
  const status = Object.hasOwn(TASK_STATUS, rawStatus) && rawStatus !== "DONE" ? rawStatus : "";
  const dueFilter = due === "overdue" ? isLate : due === "week" ? (t: Task) => isDueWithin(t.dueDate, 7) : null;
  const [allTasks, allProjects, allUsers] = await Promise.all([tasks.list(), projects.list(), users.list()]);
  const byId = userById(allUsers);
  const nameOf = projectNames(allProjects);
  const live = liveTasks(allTasks, allProjects);
  const activeIds = new Set(allProjects.filter(isActiveProject).map((p) => p.id));
  const inScope = (t: Task) =>
    assignee === "none" ? !t.assigneeId : assignee ? t.assigneeId === assignee : all || t.assigneeId === me.id;
  // tanpa drill-down: proyek berjalan saja (sama dengan hitungan di Ringkasan & Tim); `done=1` menambah yang selesai
  const list =
    dueFilter || assignee || status
      ? live.filter(inScope).filter((t) => (!dueFilter || dueFilter(t)) && (!status || t.status === status))
      : allTasks.filter((t) => activeIds.has(t.projectId) && inScope(t) && (showDone || !isDone(t)));
  return json({
    tasks: list.map((t) => taskWithRefs(t, nameOf(t.projectId), byId)),
    users: allUsers,
    counts: taskCounts(live),
    load: loadByUser(live),
  } satisfies TasksResponse);
});

/** Tambah tugas. `title` boleh berisi beberapa baris (daftar ditempel): satu baris = satu tugas,
 * maks. MAX_TASK_LINES, dan hanya SATU notifikasi Discord ringkasan. */
on("POST", "/api/tasks", async (c) => {
  const me = needUser(c);
  const f = await c.body();
  const back = backPath(c, f);
  const project = found(await projects.get(f.get("projectId")), "project-not-found", 400);
  const titles = f
    .get("title")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!titles.length) return done(c, { err: "task-title-required", to: back });
  if (titles.length > MAX_TASK_LINES) return done(c, { err: "task-too-many", to: back });
  for (const t of titles) within(t, MAX_LEN.taskTitle);
  const base = await taskInput(f);
  const ids: string[] = [];
  for (const title of titles) ids.push(await tasks.create({ ...base, title, projectId: project.id }));
  if (ids.length === 1) {
    await announceTask({ ...base, title: titles[0]!, id: ids[0]!, projectId: project.id }, null, me);
  } else if (shouldNotify(base.assigneeId, null, me)) {
    const assignee = await users.get(base.assigneeId);
    if (assignee) {
      await notifyTasksAssigned({
        tasks: ids.map((id, i) => ({ id, title: titles[i]!, priority: base.priority, dueDate: base.dueDate })),
        project,
        assignee,
        by: me,
      });
    }
  }
  // dari halaman Tugas: bawa id tugas baru (+ proyeknya) supaya halaman bisa menautkannya bila tidak tampil di filter
  const fromBoard = new URL(back, c.url.origin).pathname === PAGES.tasks;
  return done(c, {
    ok: ids.length > 1 ? "tasks-created" : "task-created",
    to: back,
    query: fromBoard ? { baru: ids[0]!, proyek: project.id } : undefined,
    data: { id: ids[0], ids },
  });
});

on("POST", "/api/tasks/:id", async (c) => {
  const me = needUser(c);
  const before = found(await tasks.get(c.params.id!), "task-not-found");
  const f = await c.body();
  checkVersion(f, before.updatedAt);
  const d = await taskInput(f);
  if (!d.title) return done(c, { err: "task-edit-title-required", to: backPath(c, f) });
  within(d.title, MAX_LEN.taskTitle);
  await tasks.update(before.id, d);
  await announceTask({ ...d, id: before.id, projectId: before.projectId }, before.assigneeId, me);
  return done(c, { ok: "task-saved", to: backPath(c, f) });
});

on(
  "POST",
  "/api/tasks/:id/status",
  idAction(async (id, f) => {
    const t = found(await tasks.get(id), "task-not-found");
    const status = pick(TASK_STATUS, f.get("status"), "");
    if (!status) throw new HttpError(400, "status-invalid");
    await tasks.setStatus(t.id, status);
    return taskStatusOk(status);
  }),
);
on(
  "POST",
  "/api/tasks/:id/delete",
  idAction(
    async (id) => {
      await tasks.remove(found(await tasks.get(id), "task-not-found").id);
    },
    { ok: "task-deleted" },
  ),
);

/* ---------- portofolio (dashboard) ---------- */
on("GET", "/api/portfolio", async (c) => {
  needUser(c);
  return json(await portfolio.list());
});

on("GET", "/api/portfolio/:id", async (c) => {
  needUser(c);
  const isNew = c.params.id === "new";
  const item = isNew ? null : found(await portfolio.get(c.params.id!), "pf-not-found");
  const [allProjects, published] = await Promise.all([projects.list(), portfolio.list({ published: true })]);
  return json({
    item,
    projects: allProjects.sort(byName),
    featuredCount: published.filter((p) => p.featured).length,
  } satisfies PortfolioEditResponse);
});

/** Jumlah karya unggulan yang tayang selain `id` */
const otherFeatured = async (id: string | null) =>
  (await portfolio.list({ published: true })).filter((p) => p.featured && p.id !== id).length;

async function savePortfolio(c: Ctx, id: string | null) {
  needUser(c);
  const f = await c.body();
  const back = backPath(c, f);
  const before = id ? found(await portfolio.get(id), "pf-not-found") : null;
  if (before) checkVersion(f, before.updatedAt);
  const fail = (err: ErrCode, query?: Record<string, string>) => done(c, { err, to: back, query });
  const title = f.get("title");
  if (!title) return fail("pf-title-required");
  within(title, MAX_LEN.pfTitle);

  // slug: kosong = otomatis dari judul (dibuat unik); diisi tapi sudah dipakai = error + saran (tidak diganti diam-diam)
  const rawSlug = f.get("slug");
  let slug: string;
  if (rawSlug) {
    slug = slugify(rawSlug);
    if (!slug) return fail("pf-slug-invalid");
    const taken = await portfolio.bySlug(slug);
    if (taken && taken.id !== id) return fail("pf-slug-taken", { saran: await uniqueSlug(slug, id) });
  } else {
    slug = await uniqueSlug(title, id);
  }
  const yearRaw = f.get("year");
  const year = yearRaw ? Number(yearRaw) : currentYear();
  if (yearRaw && (!/^\d{4}$/.test(yearRaw) || year < 1990 || year > currentYear() + 1)) return fail("pf-year-invalid");
  const sortRaw = f.get("sortOrder");
  if (sortRaw && !/^-?\d{1,6}$/.test(sortRaw)) return fail("pf-sort-invalid");
  const imageUrl = within(f.get("imageUrl"), MAX_LEN.url);
  if (imageUrl && !isLink(imageUrl, true)) return fail("pf-image-invalid");
  const liveUrl = within(f.get("liveUrl"), MAX_LEN.url);
  if (liveUrl && !isLink(liveUrl)) return fail("pf-live-invalid");

  const published = f.get("published") === "on";
  // unggulan hanya untuk karya yang tayang
  const wantFeatured = f.get("featured") === "on";
  const featured = wantFeatured && published;
  const d = {
    title,
    slug,
    client: within(f.get("client"), MAX_LEN.client),
    category: portfolioCategory(f.get("category")),
    year,
    summary: within(f.get("summary"), MAX_LEN.pfSummary),
    content: within(f.get("content"), MAX_LEN.pfContent),
    tags: within(f.get("tags"), MAX_LEN.pfTags),
    coverColor: coverColorOr(f.get("coverColor")),
    imageUrl: imageUrl || null,
    liveUrl: liveUrl || null,
    featured,
    published,
    sortOrder: sortRaw ? Number(sortRaw) : 0,
    projectId: await existing(orNull(f.get("projectId")), projects.get),
  };
  const over = featured && !before?.featured && (await otherFeatured(id)) >= MAX_FEATURED;
  if (id) await portfolio.update(id, d);
  const savedId = id ?? (await portfolio.create(d));
  const ok: OkCode = wantFeatured && !published ? "pf-saved-unfeatured" : over ? "pf-featured-over" : "pf-saved";
  // kembali ke editor karya ini (bukan daftar), supaya bisa lanjut mengedit
  return done(c, { ok, to: `${PAGES.portfolio}/${savedId}` });
}
on("POST", "/api/portfolio", (c) => savePortfolio(c, null));
on("POST", "/api/portfolio/:id", (c) => savePortfolio(c, c.params.id!));

/** field=published|featured; value=on|off opsional (tanpa value = dibalik). Unggulan hanya untuk karya yang tayang;
 * menyembunyikan karya juga mematikan unggulan. Boleh untuk semua anggota (desainer mengurus portofolio). */
on("POST", "/api/portfolio/:id/toggle", async (c) => {
  needUser(c);
  const f = await c.body();
  const to = backPath(c, f, PAGES.portfolio);
  const item = found(await portfolio.get(c.params.id!), "pf-not-found");
  const field = f.get("field") === "featured" ? "featured" : "published";
  const value = f.get("value");
  const on = value === "on" ? true : value === "off" ? false : !item[field];
  if (field === "published") {
    await portfolio.setPublished(item.id, on);
    return done(c, { ok: on ? "pf-published" : item.featured ? "pf-unpublished-unfeatured" : "pf-unpublished", to });
  }
  if (on && !item.published) return done(c, { err: "pf-feature-unpublished", to });
  const over = on && !item.featured && (await otherFeatured(item.id)) >= MAX_FEATURED;
  await portfolio.setFeatured(item.id, on);
  return done(c, { ok: on ? (over ? "pf-featured-over" : "pf-featured") : "pf-unfeatured", to });
});

on("POST", "/api/portfolio/:id/delete", async (c) => {
  needAdmin(c, "admin-only-delete");
  const item = found(await portfolio.get(c.params.id!), "pf-not-found");
  await portfolio.remove(item.id);
  return done(c, { ok: "pf-deleted", to: PAGES.portfolio });
});

/* ---------- inbox ---------- */
on("GET", "/api/inquiries", async (c) => {
  needUser(c);
  const status = c.url.searchParams.get("status");
  return json((await inquiries.list()).filter((q) => !status || q.status === status));
});

on("GET", "/api/inquiries/:id", async (c) => {
  needUser(c);
  return json(found(await inquiries.get(c.params.id!), "inquiry-not-found") satisfies Inquiry);
});

on(
  "POST",
  "/api/inquiries/:id/status",
  idAction(
    async (id, f) => {
      const q = found(await inquiries.get(id), "inquiry-not-found");
      const status = pick(INQUIRY_STATUS_ALL, f.get("status"), "");
      if (!status) throw new HttpError(400, "status-invalid");
      await inquiries.setStatus(q.id, status);
      return inquiryStatusOk(status);
    },
    { fallback: PAGES.inbox },
  ),
);
on(
  "POST",
  "/api/inquiries/:id/delete",
  idAction(
    async (id) => {
      await inquiries.remove(found(await inquiries.get(id), "inquiry-not-found").id);
    },
    { ok: "inquiry-deleted", fallback: PAGES.inbox, admin: "admin-only-delete" },
  ),
);

/* ---------- tim & akun ---------- */
on("GET", "/api/team", async (c) => {
  const me = needUser(c);
  const [allUsers, allTasks, allProjects] = await Promise.all([users.list(), tasks.list(), projects.list()]);
  const live = liveTasks(allTasks, allProjects);
  const open = openTasks(allTasks);
  return json({
    users: allUsers.map((u) => {
      const mine = live.filter((t) => t.assigneeId === u.id);
      return {
        ...u,
        openTasks: mine.length,
        overdue: mine.filter(isLate).length,
        ledProjects: allProjects.filter((p) => p.leadId === u.id).length,
        assignedOpenTasks: open.filter((t) => t.assigneeId === u.id).length,
      };
    }),
    // hanya nilai tersimpan: webhook cadangan dari env tidak pernah dikirim ke form (lihat settings.discordForm)
    discord: isAdmin(me) ? await settings.discordForm() : null,
    unassigned: live.filter((t) => !t.assigneeId).length,
    adminCount: allUsers.filter(isAdmin).length,
  } satisfies TeamResponse);
});

/** Discord ID dari input ("<@!123…>" atau angka) → angka, "" bila kosong, null bila tidak valid.
 * 17–20 digit, sama dengan teks bantuan ("17–20 digit") dan pattern di form Tim. */
function discordIdOf(v: string) {
  const id = v.replace(/[<@!>]/g, "");
  return !id || /^\d{17,20}$/.test(id) ? id : null;
}
/** Password baru: minimal MIN_PASSWORD, maksimal MAX_LEN.password (null = valid) */
const passwordProblem = (pw: string, short: ErrCode): ErrCode | null =>
  pw.length < MIN_PASSWORD ? short : pw.length > MAX_LEN.password ? "too-long" : null;

on("POST", "/api/users", async (c) => {
  needAdmin(c);
  const f = await c.body();
  const to = backPath(c, f, PAGES.team);
  const name = f.get("name");
  const email = normEmail(f.get("email"));
  const password = f.get("password");
  if (!name) return done(c, { err: "user-name-required", to });
  if (name.length > MAX_LEN.userName || email.length > MAX_LEN.email) return done(c, { err: "too-long", to });
  if (!isEmail(email)) return done(c, { err: "user-email-invalid", to });
  const pwErr = passwordProblem(password, "user-password-short");
  if (pwErr) return done(c, { err: pwErr, to });
  const discordId = discordIdOf(f.get("discordId"));
  if (discordId == null) return done(c, { err: "discord-id-invalid", to });
  if (await users.byEmail(email)) return done(c, { err: "email-taken", to });
  const id = await users.create({
    name,
    email,
    role: oneOf(ROLES, f.get("role"), "MEMBER"),
    passwordHash: await hashPassword(password),
    discordId,
  });
  // ?baru=<id>: halaman Tim menampilkan teks undangan siap disalin untuk akun ini
  return done(c, { ok: "user-created", to, query: { baru: id } });
});

/** Admin terakhir tidak boleh dihapus atau diturunkan */
async function isLastAdmin(u: User) {
  return isAdmin(u) && (await users.countAdmins()) <= 1;
}

on("POST", "/api/users/:id/delete", async (c) => {
  const me = needAdmin(c);
  if (c.params.id === me.id) return done(c, { err: "user-delete-self", to: PAGES.team });
  const target = found(await users.get(c.params.id!), "user-not-found");
  if (await isLastAdmin(target)) return done(c, { err: "last-admin", to: PAGES.team });
  await users.remove(target.id);
  return done(c, { ok: "user-deleted", to: PAGES.team });
});

/** Admin: set password baru untuk akun lain (min. MIN_PASSWORD) dan keluarkan akun itu dari semua sesi */
on("POST", "/api/users/:id/password", async (c) => {
  const me = needAdmin(c);
  const f = await c.body();
  const to = backPath(c, f, PAGES.team);
  const target = found(await users.get(c.params.id!), "user-not-found");
  if (target.id === me.id) return done(c, { err: "user-reset-self", to });
  const password = f.get("password");
  const pwErr = passwordProblem(password, "password-short");
  if (pwErr) return done(c, { err: pwErr, to });
  await users.resetPassword(target.id, await hashPassword(password));
  return done(c, { ok: "user-password-reset", to });
});

/** Admin: ubah peran (ADMIN/MEMBER). Admin terakhir tidak bisa diturunkan (termasuk dirinya sendiri). */
on("POST", "/api/users/:id/role", async (c) => {
  needAdmin(c);
  const f = await c.body();
  const to = backPath(c, f, PAGES.team);
  const target = found(await users.get(c.params.id!), "user-not-found");
  const role = f.get("role");
  if (!Object.hasOwn(ROLES, role)) return done(c, { err: "role-invalid", to });
  if (role === target.role) return done(c, { ok: "user-role-unchanged", to });
  if (role !== "ADMIN" && (await isLastAdmin(target))) return done(c, { err: "last-admin", to });
  await users.setRole(target.id, role);
  return done(c, { ok: "user-role-changed", to });
});

on("POST", "/api/users/:id/discord", async (c) => {
  const me = needUser(c);
  const id = c.params.id!;
  if (id !== me.id && !isAdmin(me)) throw new HttpError(403, "admin-only-other-user");
  const f = await c.body();
  const to = backPath(c, f, PAGES.team);
  found(await users.get(id), "user-not-found");
  const discordId = discordIdOf(f.get("discordId"));
  if (discordId == null) return done(c, { err: "discord-id-invalid", to });
  await users.setDiscordId(id, discordId);
  return done(c, { ok: discordId ? "discord-id-saved" : "discord-id-cleared", to });
});

on("POST", "/api/account/password", async (c) => {
  const me = needUser(c);
  const f = await c.body();
  const to = backPath(c, f, PAGES.team);
  const hash = await users.passwordHash(me.id);
  const current = f.get("current");
  if (!hash || current.length > MAX_LOGIN_PASSWORD || !(await verifyPassword(current, hash))) {
    return done(c, { err: "password-wrong", to });
  }
  const pwErr = passwordProblem(f.get("next"), "password-short");
  if (pwErr) return done(c, { err: pwErr, to });
  // sesi lain akun ini (perangkat lain, mis. yang mungkin dipakai orang lain) berakhir; perangkat ini tetap masuk
  await users.changePassword(me.id, await hashPassword(f.get("next")), sessionId(c.req));
  return done(c, { ok: "password-changed", to });
});

/** "Keluar dari semua perangkat lain": hapus semua sesi akun ini kecuali sesi request ini */
on("POST", "/api/account/logout-others", async (c) => {
  const me = needUser(c);
  const f = await c.body();
  const keep = sessionId(c.req);
  if (keep) await sessions.removeOthers(me.id, keep);
  return done(c, { ok: "sessions-ended", to: backPath(c, f, PAGES.team) });
});

/* ---------- Discord ---------- */
on("POST", "/api/settings/discord", async (c) => {
  needAdmin(c);
  const f = await c.body();
  const to = backPath(c, f, PAGES.team);
  const webhookUrl = f.get("webhookUrl");
  if (webhookUrl && !isWebhookUrl(webhookUrl)) {
    return done(c, { err: "webhook-invalid", to });
  }
  await settings.setDiscord({ webhookUrl, enabled: f.get("enabled") === "on" });
  return done(c, { ok: webhookUrl ? "discord-saved" : "discord-cleared", to });
});

/** Kirim pesan uji ke link webhook yang sedang diketik (field webhookUrl, divalidasi sama seperti saat simpan),
 * atau ke link tersimpan bila field kosong / tidak dikirim. */
on("POST", "/api/settings/discord/test", async (c) => {
  const me = needAdmin(c);
  const f = await c.body();
  const to = backPath(c, f, PAGES.team);
  const typed = f.get("webhookUrl");
  if (typed && !isWebhookUrl(typed)) return done(c, { err: "webhook-invalid", to });
  const webhookUrl = typed || (await settings.discord()).webhookUrl;
  if (!webhookUrl) return done(c, { err: "webhook-missing", to });
  try {
    await sendTest(webhookUrl, me);
    return done(c, { ok: "discord-test-sent", to });
  } catch (e) {
    console.error("[discord] pesan uji gagal:", e);
    return done(c, { err: "discord-test-failed", to, detail: (e as Error).message });
  }
});

/* ================= dispatcher ================= */
function match(pattern: string, path: string) {
  const a = pattern.split("/");
  const b = path.split("/");
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.startsWith(":")) {
      // escape % yang rusak (mis. /api/projects/%E0%A4%A) = tidak cocok → 404, bukan 500
      try {
        params[a[i]!.slice(1)] = decodeURIComponent(b[i]!);
      } catch {
        return null;
      }
    } else if (a[i] !== b[i]) return null;
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

/** Respons yang berisi data tim (semua kecuali /api/public/* dan /api/health) tidak boleh disimpan cache */
function noStore(path: string, res: Response) {
  if (path.startsWith("/api/public/") || path === "/api/health") return res;
  try {
    res.headers.set("Cache-Control", "no-store, private");
    return res;
  } catch {
    // header tidak bisa diubah (mis. Response.redirect): salin
    const h = new Headers(res.headers);
    h.set("Cache-Control", "no-store, private");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }
}

async function route(req: Request, url: URL, ip: string): Promise<Response> {
  // body dibaca sekali lalu disimpan, agar penanganan error tetap bisa memakai _back
  let body: Promise<Fields> | null = null;
  const c: Ctx = { req, url, params: {}, user: null, ip, body: () => (body ??= readBody(req)) };
  try {
    if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) {
      throw new HttpError(403, "origin-denied");
    }
    for (const [method, pattern, handler] of routes) {
      if (method !== req.method && !(method === "GET" && req.method === "HEAD")) continue;
      const params = match(pattern, url.pathname);
      if (!params) continue;
      c.params = params;
      c.user = await currentUser(req);
      return await handler(c);
    }
    throw new HttpError(404, "not-found");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    let code: ErrCode = e instanceof HttpError ? e.code : "server-error";
    if (status === 500) console.error("[api]", req.method, url.pathname, e);
    // sesi berakhir: cookie ada tapi tidak berlaku lagi (kedaluwarsa, password direset, keluar di tab lain)
    if (status === 401 && hasSessionCookie(req)) code = req.method === "GET" ? "session-expired" : "session-expired-draft";
    if (wantsJson(req) || req.method === "GET") return json({ ok: false, error: ERR[code], code }, status);
    const f = await c.body().catch(() => undefined);
    if (status === 401) {
      // kembali ke halaman asal setelah login; isian form disimpan forms.ts dan dipulihkan di sana
      const next = safeNext(backPath(c, f)) ?? "/dashboard";
      return done(c, { err: code, to: `/login?next=${encodeURIComponent(next)}` });
    }
    // kembali ke _back bila body bisa dibaca (mis. error validasi di projectInput), selain itu Referer
    return done(c, { err: code, to: backPath(c, f) });
  }
}

export async function handleApi(req: Request, ip = "unknown"): Promise<Response> {
  const url = new URL(req.url);
  return noStore(url.pathname, await route(req, url, ip));
}
