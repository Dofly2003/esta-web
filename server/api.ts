// Router API Bun vanilla. Semua endpoint di bawah /api.
// - Form HTML biasa → balas 303 redirect kembali ke halaman (dengan ?ok=<kode> / ?err=<kode>, teks di shared/messages.ts)
// - Request JSON (Accept: application/json) → balas JSON (teks pesan + kode)
// - Form edit (proyek, tugas, karya) mengirim `version` = updatedAt saat halaman dibuka; bila data sudah berubah
//   di tab lain / oleh orang lain, simpan ditolak dengan err=stale (tidak pernah menimpa diam-diam).
// - Hak akses: semua anggota boleh mengelola proyek/tugas/portofolio (termasuk tayang & unggulan);
//   HANYA admin yang boleh menghapus proyek, karya, inquiry, dan mengelola akun.
// - Input form divalidasi skema Valibot (server/schemas/*), query GET lewat shared/schemas/query.ts. Kode error,
//   status, dan tujuan redirect sama dengan sebelum Valibot (urutan cek = urutan kunci skema).
// - Data dibaca dengan query terarah (repo.reads) dalam satu batch per endpoint, bukan seluruh tabel.
import { parse } from "valibot";
import type {
  ActiveProject,
  DashboardSummary,
  InquiriesResponse,
  Inquiry,
  NavSummary,
  NamedRef,
  PortfolioEditResponse,
  PortfolioPreview,
  ProjectDetailResponse,
  ProjectListItem,
  ProjectSummary,
  ProjectWithCounts,
  ProjectsResponse,
  PublicHome,
  PublicPortfolioDetail,
  Task,
  TaskEditResponse,
  TasksResponse,
  TeamResponse,
  User,
} from "../shared/types";
import {
  ACTIVE_PROJECT_STATUSES,
  DEFAULT_COVER,
  isActiveProject,
  isAdmin,
  MAX_FEATURED,
  portfolioCategory,
  PROJECT_STATUS,
  PROJECT_TYPES,
} from "../shared/constants";
import {
  cutText,
  dayOffset,
  elapsed,
  FRAGMENT_RE,
  isDone,
  isDueWithin,
  isLate,
  relDays,
  safeNext,
  slugify,
  today,
} from "../shared/format";
import { ERR, inquiryStatusOk, OK, projectStatusOk, taskStatusOk, type ErrCode, type OkCode } from "../shared/messages";
import {
  INBOX_PAGE_SIZE,
  inquiriesQuery,
  projectsQuery,
  publicPortfolioQuery,
  readQuery,
  TASK_BOARD_CAP,
  TASK_COL_PAGE_SIZE,
  taskBoardQuery,
  tasksQuery,
  type ProjectSort,
} from "../shared/schemas/query";
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
import { batch } from "./db";
import {
  INQUIRY_NOTIFY_CAP_MS,
  notifyInquiry,
  notifyProjectLead,
  notifyTaskAssigned,
  notifyTasksAssigned,
  sendTest,
} from "./discord";
import { envOf } from "./env";
import { FailWindow } from "./limits";
import { logError, redact } from "./log";
import {
  fetchAll,
  inquiries,
  portfolio,
  projects,
  reads,
  sessions,
  settings,
  tasks,
  users,
  type ProjectInput,
  type TaskInput,
  type TaskScope,
  type TaskWithProjectName,
} from "./repo";
import { accountPasswordForm, loginForm, MAX_LOGIN_PASSWORD } from "./schemas/auth";
import { parseWith } from "./schemas/fields";
import { inquiryForm, inquiryStatusForm } from "./schemas/inquiry";
import { portfolioFormA, portfolioFormB, toggleForm } from "./schemas/portfolio";
import { parseProject, projectStatusForm } from "./schemas/project";
import { discordForm, discordTestForm } from "./schemas/settings";
import { taskEditTitle, taskForm, taskStatusForm, taskTitles } from "./schemas/task";
import { userCreateForm, userDiscordForm, userPasswordForm, userRoleForm } from "./schemas/user";

/* ================= util ================= */
type Fields = {
  get(k: string): string;
  has(k: string): boolean;
  /** semua field (sudah di-trim) sebagai objek, untuk skema Valibot */
  all(): Record<string, string>;
};
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

/** Batas body request (form terbesar: isi karya 50.000 karakter ≈ 600 KB setelah URL-encoding) */
export const MAX_BODY_BYTES = 1_048_576;
/** Body yang masih dibaca untuk menentukan _back saat request ditolak sebelum handler (belum login, origin) */
const ERROR_BODY_BYTES = 64 * 1024;

/** Body sebagai sumber yang bisa di-parse, paling banyak `max` byte; lebih = 413 too-long (tidak pernah dibaca utuh) */
async function bounded(req: Request, type: string, max: number): Promise<Request | Response> {
  const declared = req.headers.get("content-length");
  if (declared != null) {
    if (!(Number(declared) <= max)) throw new HttpError(413, "too-long");
    return req;
  }
  // tanpa Content-Length (chunked): baca bertahap sampai batas
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  for (;;) {
    const part = await reader?.read();
    if (!part || part.done) break;
    size += part.value.byteLength;
    if (size > max) {
      await reader!.cancel().catch(() => {});
      throw new HttpError(413, "too-long");
    }
    chunks.push(part.value);
  }
  return new Response(Buffer.concat(chunks), { headers: { "content-type": type } });
}

async function readBody(req: Request, max = MAX_BODY_BYTES): Promise<Fields> {
  const type = req.headers.get("content-type") ?? "";
  const map = new Map<string, string>();
  if (type.includes("application/json")) {
    const src = await bounded(req, type, max);
    const obj: unknown = await src.json().catch(() => ({}));
    if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) map.set(k, v === true ? "on" : v == null ? "" : String(v));
    }
  } else if (type.includes("form")) {
    const src = await bounded(req, type, max);
    // body rusak (mis. multipart tanpa boundary) = form kosong → error validasi biasa, bukan 500
    const fd = await src.formData().catch(() => null);
    for (const [k, v] of fd?.entries() ?? []) if (typeof v === "string") map.set(k, v);
  }
  let all: Record<string, string> | null = null;
  return {
    get: (k) => (map.get(k) ?? "").trim(),
    has: (k) => map.has(k),
    all: () => (all ??= Object.fromEntries([...map].map(([k, v]) => [k, v.trim()]))),
  };
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
  /** status respons JSON untuk error (bawaan 400; mis. 429 untuk batas kiriman) */
  status?: number;
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
      opts.err ? (opts.status ?? 400) : 200,
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

/** Nilai skema yang tidak pernah gagal (semua field opsional / bawaan) */
const fieldsOf = <T>(schema: Parameters<typeof parse>[0], f: Fields) => parse(schema, f.all()) as T;

/* ============ batas percobaan (memori per instance) ============
 * Login: kunci utama = IP + email (satu orang salah ketik tidak mengunci rekan satu kantor/NAT), plus batas per IP
 * yang lebih longgar. Jendela 15 menit dihitung dari kegagalan pertama dan TIDAK diperpanjang saat sudah diblokir.
 * Password lama (Ganti password): per akun, supaya sesi yang tertinggal di komputer bersama tidak bisa dipakai
 * menebak password. */
const LOGIN_WINDOW = 15 * 60_000;
const LIMIT_PER_ACCOUNT = 10;
const LIMIT_PER_IP = 50;
const loginFails = new FailWindow(LOGIN_WINDOW);
const accountKey = (ip: string, email: string) => `${ip}|${email}`;
const loginBlocked = (ip: string, email: string) =>
  loginFails.blocked(accountKey(ip, email), LIMIT_PER_ACCOUNT) || loginFails.blocked(ip, LIMIT_PER_IP);
function loginFailed(ip: string, email: string) {
  loginFails.fail(accountKey(ip, email), LIMIT_PER_ACCOUNT);
  loginFails.fail(ip, LIMIT_PER_IP);
}
const LIMIT_CURRENT_PASSWORD = 10;
const passwordFails = new FailWindow(LOGIN_WINDOW);
const passwordKey = (userId: string) => `pw|${userId}`;

/* Form Kontak publik: maks. 5 inquiry per IP per 10 menit, dan 200 per jam untuk seluruh instance (spam dari banyak
 * IP tidak bisa memenuhi Inbox / memicu ratusan notifikasi Discord). Kiriman yang ditolak tidak disimpan. */
export const INQUIRY_LIMIT_PER_IP = 5;
const INQUIRY_IP_WINDOW = 10 * 60_000;
export const INQUIRY_LIMIT_GLOBAL = 200;
const INQUIRY_GLOBAL_WINDOW = 60 * 60_000;
const inquiryByIp = new FailWindow(INQUIRY_IP_WINDOW);
const inquiryAll = new FailWindow(INQUIRY_GLOBAL_WINDOW);
const inquiryLimited = (ip: string) =>
  inquiryByIp.blocked(ip, INQUIRY_LIMIT_PER_IP) || inquiryAll.blocked("*", INQUIRY_LIMIT_GLOBAL);
function inquiryCounted(ip: string) {
  inquiryByIp.fail(ip, INQUIRY_LIMIT_PER_IP);
  inquiryAll.fail("*", INQUIRY_LIMIT_GLOBAL);
}

/** Hanya tes: kosongkan batas inquiry (tes memakai jam beku, jadi jendelanya tidak pernah lewat) */
export function resetInquiryLimits() {
  inquiryByIp.clearAll();
  inquiryAll.clearAll();
}
if (envOf("NODE_ENV") === "test") {
  (globalThis as { __ESTA_RESET_LIMITS__?: () => void }).__ESTA_RESET_LIMITS__ = resetInquiryLimits;
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
/** Isian proyek (skema schemas/project) + PJ yang benar-benar ada (selain itu tanpa PJ) */
async function projectInput(f: Fields): Promise<ProjectInput> {
  const r = parseProject(f.all());
  if (!r.ok) throw new HttpError(400, r.code);
  return { ...r.value, leadId: await validUser(r.value.leadId) };
}

/** Isian tugas. Panjang judul dicek pemanggil (tambah: per baris; ubah: seluruh judul). */
async function taskInput(f: Fields): Promise<Omit<TaskInput, "projectId">> {
  const r = parseWith(taskForm, f.all());
  if (!r.ok) throw new HttpError(400, r.code);
  return { ...r.value, assigneeId: await validUser(r.value.assigneeId) };
}

/** Status baru dari form ganti status (wajib status yang dikenal) */
function statusOf(schema: typeof projectStatusForm | typeof taskStatusForm | typeof inquiryStatusForm, f: Fields) {
  const r = parseWith(schema, f.all());
  if (!r.ok) throw new HttpError(400, r.code);
  return r.value.status;
}

/** Slug unik dari `base` (kosong = "karya"): base, lalu base-2, base-3, … (satu query untuk semua kandidat) */
async function uniqueSlug(base: string, ignoreId?: string | null) {
  const root = slugify(base) || "karya";
  const prefix = slugify(root, 56);
  const taken = await portfolio.slugsLike(root, prefix);
  const free = (slug: string) => {
    const owner = taken.get(slug);
    return owner === undefined || owner === ignoreId;
  };
  if (free(root)) return root;
  for (let i = 2; ; i++) if (free(`${prefix}-${i}`)) return `${prefix}-${i}`;
}

/* ============ bentuk respons ============ */
// Respons hanya membawa field yang dibaca halaman (lihat shared/types.ts): PJ / penanggung jawab sebagai { id, name },
// proyek tanpa deskripsi / anggaran / cap waktu, tugas tanpa createdAt.
type ById = (id: string | null) => NamedRef | null;
function userById(list: NamedRef[]): ById {
  const map = new Map(list.map((u) => [u.id, u]));
  return (id) => (id == null ? null : (map.get(id) ?? null));
}
type Totals = Map<string, { total: number; done: number }>;
const withCounts = (p: ProjectSummary, totals: Totals, byId: ById): ProjectWithCounts => {
  const t = totals.get(p.id);
  return {
    id: p.id,
    name: p.name,
    client: p.client,
    type: p.type,
    status: p.status,
    startDate: p.startDate,
    dueDate: p.dueDate,
    lead: byId(p.leadId),
    doneTasks: t?.done ?? 0,
    totalTasks: t?.total ?? 0,
  };
};
/** Jumlah tugas hidup per penanggung jawab (untuk pilihan "Budi · 2 terbuka") */
const loadOf = (byAssignee: Map<string, { open: number }>) =>
  Object.fromEntries([...byAssignee].map(([id, v]) => [id, v.open]));

/** Selisih progres di bawah waktu berjalan yang dianggap tertinggal (15 poin) */
const AT_RISK_MARGIN = 0.15;
/** Proyek berjalan + sinyal jadwal untuk ringkasan.
 * late   = lewat deadline (WIB).
 * atRisk = belum lewat & belum semua tugas selesai, dan (progres < waktu berjalan − 15 poin,
 *          atau deadline ≤ 7 hari lagi dengan progres < waktu berjalan / tanpa tugas / tanpa tanggal mulai). */
function activeProject(p: ProjectSummary, totals: Totals, byId: ById): ActiveProject {
  const base = withCounts(p, totals, byId);
  const { totalTasks, doneTasks } = base;
  const time = elapsed(p);
  const daysLeft = relDays(p.dueDate);
  const late = isLate(p);
  const frac = totalTasks ? doneTasks / totalTasks : null;
  const behind = frac != null && time != null && frac < time - AT_RISK_MARGIN;
  const dueSoon = daysLeft != null && daysLeft <= 7;
  const atRisk = !late && frac !== 1 && (behind || (dueSoon && (frac == null || time == null || frac < time)));
  return { ...base, elapsed: time, daysLeft, late, atRisk };
}
/** lewat deadline → berisiko → lainnya, lalu deadline terdekat (tanpa deadline paling bawah) */
const healthRank = (p: ActiveProject) => (p.late ? 0 : p.atRisk ? 1 : 2);
const byDue = (a: { dueDate: string | null }, b: { dueDate: string | null }) =>
  (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
const byHealth = (a: ActiveProject, b: ActiveProject) => healthRank(a) - healthRank(b) || byDue(a, b);

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
/** Urutan "tugas saya": lewat deadline dulu, lalu deadline terdekat (tanpa deadline paling bawah), lalu prioritas */
type Urgent = Pick<Task, "status" | "dueDate" | "priority">;
const byUrgency = (a: Urgent, b: Urgent) =>
  Number(isLate(b)) - Number(isLate(a)) ||
  byDue(a, b) ||
  (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);

/** Urutan daftar proyek (stabil; tidak berubah karena sekadar diedit):
 * deadline (default) = berjalan dulu (lewat deadline paling atas), lalu deadline terdekat, lalu nama;
 * name = A–Z; progress = progres terendah dulu; updated = terakhir diubah dulu. */
const collator = new Intl.Collator("id", { sensitivity: "base" });
const byName = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name);
type Sortable = Pick<ProjectSummary, "name" | "status" | "dueDate">;
const groupRank = (p: Sortable) => (isActiveProject(p) ? (isLate(p) ? 0 : 1) : 2);
const byDeadline = (a: Sortable, b: Sortable) => groupRank(a) - groupRank(b) || byDue(a, b) || byName(a, b);
type Listed = ProjectListItem & { updatedAt: string };
const pct = (p: Listed) => (p.totalTasks ? p.doneTasks / p.totalTasks : -1);
function sortProjects(list: Listed[], sort: ProjectSort) {
  const cmp: Record<ProjectSort, (a: Listed, b: Listed) => number> = {
    deadline: byDeadline,
    name: byName,
    progress: (a, b) => pct(a) - pct(b) || byName(a, b),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || byName(a, b),
  };
  return list.sort(cmp[sort]);
}

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
type Route = { method: string; parts: string[]; handler: Handler; session: boolean };
const routes: Route[] = [];
/** session=false: rute publik / login, tidak pernah mencari sesi (hemat satu query untuk pengunjung yang login) */
const on = (method: string, pattern: string, handler: Handler, session = true) =>
  routes.push({ method, parts: pattern.split("/"), handler, session });

/* ---------- publik ---------- */
on("GET", "/api/health", () => json({ ok: true }), false);

on(
  "GET",
  "/api/public/home",
  async () => {
    const [featured, st] = await fetchAll([
      reads.portfolioCards({ published: true, featured: true, limit: MAX_FEATURED }),
      reads.publicStats(),
    ]);
    return json({
      featured,
      stats: { done: Math.max(st.doneProjects, st.published), clients: st.clients },
    } satisfies PublicHome);
  },
  false,
);

on(
  "GET",
  "/api/public/portfolio",
  async (c) => {
    const { kategori } = readQuery(publicPortfolioQuery, c.url.searchParams);
    return json(await fetchAll([reads.portfolioCards({ published: true, category: kategori })]).then(([l]) => l));
  },
  false,
);

on(
  "GET",
  "/api/public/portfolio/:slug",
  async (c) => {
    // karya + "karya lainnya" (3 karya tayang pertama selain karya ini) sekaligus
    const slug = c.params.slug!;
    const [hit, others] = await fetchAll([
      reads.publicPortfolio(slug),
      reads.portfolioCards({ published: true, exceptSlug: slug, limit: 3 }),
    ]);
    return json({ item: found(hit, "pf-not-found"), others } satisfies PublicPortfolioDetail);
  },
  false,
);

on(
  "POST",
  "/api/public/inquiries",
  async (c) => {
    const f = await c.body();
    const to = "/contact";
    const sent = () => done(c, { ok: "inquiry-sent", to: "/contact?terkirim=1" });
    // honeypot: balasan sama persis dengan kiriman sungguhan (bot tidak bisa membedakan), tapi tidak disimpan
    if (f.get("website")) return sent();
    const r = parseWith(inquiryForm, f.all());
    if (!r.ok) return done(c, { err: r.code, to });
    // terlalu sering: tidak disimpan dan tidak memicu Discord; pesan jelas (form JSON maupun tanpa JS)
    if (inquiryLimited(c.ip)) return done(c, { err: "inquiry-rate-limited", to, status: 429 });
    inquiryCounted(c.ip);
    const id = await inquiries.create(r.value);
    // Ditunggu, tapi maks. INQUIRY_NOTIFY_CAP_MS: di serverless (Vercel) instance bisa dibekukan setelah respons
    // terkirim, jadi kiriman yang tidak ditunggu bisa hilang. Lewat batas atau gagal → hanya dicatat di log,
    // form tetap sukses (notifyInquiry tidak pernah melempar error).
    await notifyInquiry({ id, ...r.value }, INQUIRY_NOTIFY_CAP_MS);
    return sent();
  },
  false,
);

/* ---------- auth ---------- */
on(
  "POST",
  "/api/auth/login",
  async (c) => {
    const f = await c.body();
    const { email, password, next: target } = fieldsOf<{ email: string; password: string; next: string }>(loginForm, f);
    // tanpa JS, email tetap terisi setelah gagal (password tidak pernah dibawa)
    const back = `/login?next=${encodeURIComponent(target)}${email ? `&email=${encodeURIComponent(email.slice(0, 200))}` : ""}`;
    if (loginBlocked(c.ip, email)) return done(c, { err: "login-blocked", to: back });
    // password sangat panjang tidak di-hash sama sekali (tidak bisa dipakai membebani CPU)
    const user = password.length <= MAX_LOGIN_PASSWORD ? await login(email, password) : null;
    if (!user) {
      loginFailed(c.ip, email);
      return done(c, { err: "login-failed", to: back });
    }
    loginFails.clear(accountKey(c.ip, email));
    return done(c, { to: target, headers: { "Set-Cookie": await startSession(user.id) } });
  },
  false,
);

on("POST", "/api/auth/logout", async (c) =>
  done(c, { to: "/login", headers: { "Set-Cookie": await endSession(c.req) } }),
);

on("GET", "/api/me", (c) => json(needUser(c)));

/* ---------- ringkasan dashboard ---------- */
on("GET", "/api/dashboard", async (c) => {
  const me = needUser(c);
  const day = today();
  const [allUsers, active, totals, live, mine, review, onHoldTasks, doneWithoutPortfolio, inq, newest] = await fetchAll(
    [
      reads.userRefs(),
      reads.activeProjects(),
      reads.taskTotals(true),
      reads.liveCounts(day, dayOffset(7)),
      reads.liveTaskBriefs({ kind: "user", id: me.id }),
      // menunggu review: paling lama di Review dulu (updatedAt ≈ saat dipindah ke Review)
      reads.reviewTasks(4),
      reads.onHoldOpenTasks(),
      reads.doneWithoutPortfolio(),
      reads.newInquiryStats(),
      reads.newestNewInquiries(4),
    ],
  );
  const byId = userById(allUsers);
  const list = active.map((p) => activeProject(p, totals, byId)).sort(byHealth);
  mine.sort(byUrgency);
  return json({
    active: list,
    activeProjects: list.length,
    projectsAtRisk: list.filter((p) => p.late || p.atRisk).length,
    openTasks: live.open,
    overdue: live.overdue,
    dueThisWeek: live.dueThisWeek,
    dueToday: live.dueToday,
    unassigned: live.unassigned,
    onHoldTasks,
    doneWithoutPortfolio,
    newInquiries: inq.count,
    oldestNewInquiryAt: inq.oldest,
    myOpenTasks: mine.length,
    myOverdue: mine.filter(isLate).length,
    myDueThisWeek: mine.filter((t) => isDueWithin(t.dueDate, 7)).length,
    myDueToday: mine.filter((t) => relDays(t.dueDate) === 0).length,
    myTasks: mine.slice(0, 8),
    reviewTasks: live.review,
    oldestReviewAt: live.oldestReviewAt,
    review,
    inquiries: newest,
  } satisfies DashboardSummary);
});

on("GET", "/api/nav", async (c) => {
  needUser(c);
  return json({ newInquiries: await inquiries.countNew() } satisfies NavSummary);
});

/* ---------- proyek ---------- */
on("GET", "/api/projects", async (c) => {
  needUser(c);
  const query = readQuery(projectsQuery, c.url.searchParams);
  const { status, type, sort } = query;
  const q = query.q.toLowerCase();
  const noPortfolio = query.pf === "belum";
  const [allProjects, totals, allUsers, linked] = await fetchAll([
    reads.projectList(),
    reads.taskTotals(),
    reads.userRefs(),
    reads.linkedProjectIds(),
  ]);
  const byId = userById(allUsers);
  // status=ACTIVE = semua status di ACTIVE_PROJECT_STATUSES
  const statusOk = (p: ProjectSummary) => !status || p.status === status || (status === "ACTIVE" && isActiveProject(p));
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
  // updatedAt hanya untuk urutan "Terakhir diubah", tidak dikirim
  const list: ProjectListItem[] = sortProjects(
    matching
      .filter(statusOk)
      .map((p) => ({ ...withCounts(p, totals, byId), hasPortfolio: linked.has(p.id), updatedAt: p.updatedAt })),
    sort,
  ).map((p) => {
    const { updatedAt, ...item } = p;
    void updatedAt;
    return item;
  });
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
  return done(c, {
    ok: inq ? "project-created-from-inquiry" : "project-created",
    to: `${PAGES.projects}/${id}`,
    data: { id },
  });
});

on("GET", "/api/projects/:id", async (c) => {
  needUser(c);
  const id = c.params.id!;
  const [project, projectTasks, linked, allUsers, byAssignee] = await fetchAll([
    reads.project(id),
    reads.projectTasks(id),
    reads.portfolioByProject(id),
    reads.userRefs(),
    reads.liveByAssignee(today()),
  ]);
  const p = found(project, "project-not-found");
  const byId = userById(allUsers);
  return json({
    project: { ...p, lead: byId(p.leadId), tasks: projectTasks.map((t) => ({ ...t, assignee: byId(t.assigneeId) })) },
    portfolio: linked,
    users: allUsers,
    load: loadOf(byAssignee),
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
    const status = statusOf(projectStatusForm, f);
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
  // drill-down (dari tile ringkasan / tim): due=overdue|week, assignee=none|<userId>, status=<status belum selesai>.
  // Bila salah satunya ada, daftar = tugas hidup saja (belum selesai, proyek berjalan) dan `done` diabaikan;
  // assignee menggantikan cakupan filter=mine|all.
  const { all, showDone, due, assignee, status } = readQuery(tasksQuery, c.url.searchParams);
  const drill = Boolean(due || assignee || status);
  const scope: TaskScope =
    assignee === "none"
      ? { kind: "none" }
      : assignee
        ? { kind: "user", id: assignee }
        : all
          ? { kind: "all" }
          : { kind: "user", id: me.id };
  const day = today();
  // tanpa drill-down: proyek berjalan saja (sama dengan hitungan di Ringkasan & Tim); `done=1` menambah yang selesai
  const [rows, allUsers, live, byAssignee, active] = await fetchAll([
    drill ? reads.liveTasks(scope) : reads.activeProjectTasks(scope, showDone),
    reads.userRefs(),
    reads.liveCounts(day, dayOffset(7)),
    reads.liveByAssignee(day),
    reads.activeProjectOptions(),
  ]);
  const dueFilter =
    due === "overdue" ? isLate : due === "week" ? (t: TaskWithProjectName) => isDueWithin(t.dueDate, 7) : null;
  const list = drill ? rows.filter((t) => (!dueFilter || dueFilter(t)) && (!status || t.status === status)) : rows;
  // tugas hidup dalam cakupan ini (rows = tugas proyek berjalan dalam cakupan) → angka chip deadline
  const scoped = rows.filter((t) => !isDone(t));
  const byId = userById(allUsers);
  // papan (board=1): tiap kolom status maks. TASK_BOARD_CAP; satu kolom (col=): per halaman. Hitungan per status
  // selalu dari daftar utuh. Kartu hanya menampilkan 2 baris catatan (form ubah memuat tugas utuh sendiri), jadi
  // catatan dipotong di kedua mode. Tanpa parameter ini daftar utuh seperti dulu.
  const { board, col, page, pin } = readQuery(taskBoardQuery, c.url.searchParams);
  const statusCounts: Record<string, number> = {};
  for (const t of list) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
  let shown = list;
  let colPage: TasksResponse["colPage"];
  if (col) {
    const inCol = list.filter((t) => t.status === col);
    const pages = Math.max(1, Math.ceil(inCol.length / TASK_COL_PAGE_SIZE));
    const n = Math.min(page, pages);
    shown = inCol.slice((n - 1) * TASK_COL_PAGE_SIZE, n * TASK_COL_PAGE_SIZE);
    colPage = { page: n, pages, total: inCol.length };
  } else if (board) {
    const seen: Record<string, number> = {};
    shown = list.filter((t) => (seen[t.status] = (seen[t.status] ?? 0) + 1) <= TASK_BOARD_CAP || t.id === pin);
  }
  const brief = board || col;
  return json({
    tasks: shown.map((t) => ({
      ...t,
      description: brief ? cardNote(t.description) : t.description,
      assignee: byId(t.assigneeId),
    })),
    users: allUsers,
    counts: { overdue: live.overdue, dueThisWeek: live.dueThisWeek, unassigned: live.unassigned },
    scopeCounts: {
      overdue: scoped.filter(isLate).length,
      week: scoped.filter((t) => isDueWithin(t.dueDate, 7)).length,
    },
    load: loadOf(byAssignee),
    // sama dengan /api/projects?status=ACTIVE (urutan deadline)
    projectOptions: active.sort(byDeadline).map((p) => ({ id: p.id, name: p.name })),
    statusCounts,
    ...(colPage ? { colPage } : {}),
  } satisfies TasksResponse);
});

/** Catatan di kartu papan: 2 baris terlihat, jadi 280 karakter pertama cukup (tanpa memecah pasangan surrogate) */
const CARD_NOTE = 280;
const cardNote = (d: string) => (d.length > CARD_NOTE ? d.slice(0, CARD_NOTE).replace(/[\uD800-\uDBFF]$/, "") : d);

/** Isi form ubah satu tugas (popover "Ubah" memuatnya saat dibuka; halaman /dashboard/tasks/<id> tanpa JS) */
on("GET", "/api/tasks/:id", async (c) => {
  needUser(c);
  const [task, allUsers] = await fetchAll([reads.task(c.params.id!), reads.userRefs()]);
  return json({ task: found(task, "task-not-found"), users: allUsers } satisfies TaskEditResponse);
});

/** Tambah tugas. `title` boleh berisi beberapa baris (daftar ditempel): satu baris = satu tugas,
 * maks. MAX_TASK_LINES, disimpan atomik dalam satu batch, dan hanya SATU notifikasi Discord ringkasan. */
on("POST", "/api/tasks", async (c) => {
  const me = needUser(c);
  const f = await c.body();
  const back = backPath(c, f);
  const project = found(await projects.get(f.get("projectId")), "project-not-found", 400);
  const t = parseWith(taskTitles, f.get("title"));
  if (!t.ok) {
    if (t.code === "too-long") throw new HttpError(400, t.code);
    return done(c, { err: t.code, to: back });
  }
  const titles = t.value;
  const base = await taskInput(f);
  // satu batch = satu round trip, dan daftar tempel tersimpan semua atau tidak sama sekali
  const rows = titles.map((title) => tasks.insert({ ...base, title, projectId: project.id }));
  await batch(rows);
  const ids = rows.map((r) => r.id);
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
  const title = parseWith(taskEditTitle, d.title);
  if (!title.ok) {
    if (title.code === "task-edit-title-required") return done(c, { err: title.code, to: backPath(c, f) });
    throw new HttpError(400, title.code);
  }
  await tasks.update(before.id, d);
  await announceTask({ ...d, id: before.id, projectId: before.projectId }, before.assigneeId, me);
  return done(c, { ok: "task-saved", to: backPath(c, f) });
});

on(
  "POST",
  "/api/tasks/:id/status",
  idAction(async (id, f) => {
    const t = found(await tasks.get(id), "task-not-found");
    const status = statusOf(taskStatusForm, f);
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
  const [hit, names, featuredCount] = await fetchAll([
    reads.portfolioItem(isNew ? "" : c.params.id!),
    reads.projectNames(),
    reads.countFeatured(),
  ]);
  const item = isNew ? null : found(hit, "pf-not-found");
  return json({ item, projects: names.sort(byName), featuredCount } satisfies PortfolioEditResponse);
});

/** Pratinjau karya (juga draf) untuk tim: karya lengkap + "karya lainnya" seperti halaman publik */
on("GET", "/api/portfolio/:id/pratinjau", async (c) => {
  needUser(c);
  const [hit, cards] = await fetchAll([
    reads.portfolioItem(c.params.id!),
    reads.portfolioCards({ published: true, limit: 4 }),
  ]);
  const item = found(hit, "pf-not-found");
  const others = cards.filter((p) => p.slug !== item.slug).slice(0, 3);
  return json({ item, others } satisfies PortfolioPreview);
});

async function savePortfolio(c: Ctx, id: string | null) {
  needUser(c);
  const f = await c.body();
  const back = backPath(c, f);
  const before = id ? found(await portfolio.get(id), "pf-not-found") : null;
  if (before) checkVersion(f, before.updatedAt);
  const fail = (err: ErrCode, query?: Record<string, string>) => done(c, { err, to: back, query });
  // too-long dilempar (seperti dulu), kode lain kembali ke editor
  const failOrThrow = (code: ErrCode) => {
    if (code === "too-long") throw new HttpError(400, code);
    return fail(code);
  };
  const a = parseWith(portfolioFormA, f.all());
  if (!a.ok) return failOrThrow(a.code);
  const { title } = a.value;

  // slug: kosong = otomatis dari judul (dibuat unik); diisi tapi sudah dipakai = error + saran (tidak diganti diam-diam)
  let slug = a.value.slug;
  if (slug) {
    const taken = await portfolio.bySlug(slug);
    if (taken && taken.id !== id) return fail("pf-slug-taken", { saran: await uniqueSlug(slug, id) });
  } else {
    slug = await uniqueSlug(title, id);
  }
  const b = parseWith(portfolioFormB, f.all());
  if (!b.ok) return failOrThrow(b.code);
  const v = b.value;
  // unggulan hanya untuk karya yang tayang
  const featured = v.featured && v.published;
  const d = {
    title,
    slug,
    client: v.client,
    category: v.category,
    year: v.year,
    summary: v.summary,
    content: v.content,
    tags: v.tags,
    coverColor: v.coverColor,
    imageUrl: v.imageUrl,
    liveUrl: v.liveUrl,
    featured,
    published: v.published,
    sortOrder: v.sortOrder,
    projectId: await existing(v.projectId, projects.get),
  };
  const over = featured && !before?.featured && (await portfolio.countFeatured(id)) >= MAX_FEATURED;
  if (id) await portfolio.update(id, d);
  const savedId = id ?? (await portfolio.create(d));
  const ok: OkCode = v.featured && !v.published ? "pf-saved-unfeatured" : over ? "pf-featured-over" : "pf-saved";
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
  const { field, value } = fieldsOf<{ field: "featured" | "published"; value: boolean | null }>(toggleForm, f);
  const on = value ?? !item[field];
  if (field === "published") {
    await portfolio.setPublished(item.id, on);
    return done(c, { ok: on ? "pf-published" : item.featured ? "pf-unpublished-unfeatured" : "pf-unpublished", to });
  }
  if (on && !item.published) return done(c, { err: "pf-feature-unpublished", to });
  const over = on && !item.featured && (await portfolio.countFeatured(item.id)) >= MAX_FEATURED;
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
/** Satu halaman Inbox (INBOX_PAGE_SIZE) + hitungan per status. ?inq=<id> (tanpa ?page) = halaman yang memuat inquiry
 * itu (tautan dari Ringkasan / Discord tetap mendarat di barisnya). Halaman di atas yang terakhir = halaman terakhir. */
on("GET", "/api/inquiries", async (c) => {
  needUser(c);
  const sp = c.url.searchParams;
  const { status, page: wanted, inq } = readQuery(inquiriesQuery, sp);
  const size = INBOX_PAGE_SIZE;
  const focus = inq && !sp.has("page");
  const [counts, guess, pos] = await fetchAll([
    reads.inquiryCounts(),
    reads.inquiryPage(status, size, focus ? 0 : (wanted - 1) * size),
    reads.inquiryPosition(status, focus ? inq : ""),
  ]);
  const total = status ? (counts[status] ?? 0) : Object.values(counts).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(focus && pos != null ? Math.floor(pos / size) + 1 : focus ? 1 : wanted, pages);
  const guessed = focus ? 1 : wanted;
  const items = page === guessed ? guess : (await fetchAll([reads.inquiryPage(status, size, (page - 1) * size)]))[0];
  return json({ items, counts, total, page, pages, pageSize: size } satisfies InquiriesResponse);
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
      const status = statusOf(inquiryStatusForm, f);
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
  const day = today();
  const [allUsers, byAssignee, openAny, led, live, discord] = await fetchAll([
    reads.users(),
    reads.liveByAssignee(day),
    reads.openByAssignee(),
    reads.ledByUser(),
    reads.liveCounts(day, dayOffset(7)),
    reads.discordForm(),
  ]);
  return json({
    users: allUsers.map((u) => {
      const mine = byAssignee.get(u.id);
      return {
        ...u,
        openTasks: mine?.open ?? 0,
        overdue: mine?.overdue ?? 0,
        ledProjects: led[u.id] ?? 0,
        assignedOpenTasks: openAny[u.id] ?? 0,
      };
    }),
    // hanya nilai tersimpan: webhook cadangan dari env tidak pernah dikirim ke form (lihat settings.discordForm)
    discord: isAdmin(me) ? discord : null,
    unassigned: live.unassigned,
    adminCount: allUsers.filter(isAdmin).length,
  } satisfies TeamResponse);
});

on("POST", "/api/users", async (c) => {
  needAdmin(c);
  const f = await c.body();
  const to = backPath(c, f, PAGES.team);
  const r = parseWith(userCreateForm, f.all());
  if (!r.ok) return done(c, { err: r.code, to });
  const { name, email, password, discordId, role } = r.value;
  if (await users.byEmail(email)) return done(c, { err: "email-taken", to });
  const id = await users.create({ name, email, role, passwordHash: await hashPassword(password), discordId });
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
  const r = parseWith(userPasswordForm, f.all());
  if (!r.ok) return done(c, { err: r.code, to });
  await users.resetPassword(target.id, await hashPassword(r.value.password));
  return done(c, { ok: "user-password-reset", to });
});

/** Admin: ubah peran (ADMIN/MEMBER). Admin terakhir tidak bisa diturunkan (termasuk dirinya sendiri). */
on("POST", "/api/users/:id/role", async (c) => {
  needAdmin(c);
  const f = await c.body();
  const to = backPath(c, f, PAGES.team);
  const target = found(await users.get(c.params.id!), "user-not-found");
  const r = parseWith(userRoleForm, f.all());
  if (!r.ok) return done(c, { err: r.code, to });
  const { role } = r.value;
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
  const r = parseWith(userDiscordForm, f.all());
  if (!r.ok) return done(c, { err: r.code, to });
  await users.setDiscordId(id, r.value.discordId);
  return done(c, { ok: r.value.discordId ? "discord-id-saved" : "discord-id-cleared", to });
});

on("POST", "/api/account/password", async (c) => {
  const me = needUser(c);
  const f = await c.body();
  const to = backPath(c, f, PAGES.team);
  if (passwordFails.blocked(passwordKey(me.id), LIMIT_CURRENT_PASSWORD)) {
    return done(c, { err: "password-blocked", to, status: 429 });
  }
  const hash = await users.passwordHash(me.id);
  const current = f.get("current");
  if (!hash || current.length > MAX_LOGIN_PASSWORD || !(await verifyPassword(current, hash))) {
    passwordFails.fail(passwordKey(me.id), LIMIT_CURRENT_PASSWORD);
    return done(c, { err: "password-wrong", to });
  }
  passwordFails.clear(passwordKey(me.id));
  const r = parseWith(accountPasswordForm, f.all());
  if (!r.ok) return done(c, { err: r.code, to });
  // sesi lain akun ini (perangkat lain, mis. yang mungkin dipakai orang lain) berakhir; perangkat ini tetap masuk
  await users.changePassword(me.id, await hashPassword(r.value.next), sessionId(c.req));
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
  const r = parseWith(discordForm, f.all());
  if (!r.ok) return done(c, { err: r.code, to });
  await settings.setDiscord(r.value);
  return done(c, { ok: r.value.webhookUrl ? "discord-saved" : "discord-cleared", to });
});

/** Kirim pesan uji ke link webhook yang sedang diketik (field webhookUrl, divalidasi sama seperti saat simpan),
 * atau ke link tersimpan bila field kosong / tidak dikirim. */
on("POST", "/api/settings/discord/test", async (c) => {
  const me = needAdmin(c);
  const f = await c.body();
  const to = backPath(c, f, PAGES.team);
  const r = parseWith(discordTestForm, f.all());
  if (!r.ok) return done(c, { err: r.code, to });
  const webhookUrl = r.value.webhookUrl || (await settings.discord()).webhookUrl;
  if (!webhookUrl) return done(c, { err: "webhook-missing", to });
  try {
    await sendTest(webhookUrl, me);
    return done(c, { ok: "discord-test-sent", to });
  } catch (e) {
    logError("[discord] pesan uji gagal:", e);
    return done(c, { err: "discord-test-failed", to, detail: redact((e as Error).message) });
  }
});

/* ================= dispatcher ================= */
function match(parts: string[], path: string[]) {
  if (parts.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.startsWith(":")) {
      // escape % yang rusak (mis. /api/projects/%E0%A4%A) = tidak cocok → 404, bukan 500
      try {
        params[p.slice(1)] = decodeURIComponent(path[i]!);
      } catch {
        return null;
      }
    } else if (p !== path[i]) return null;
  }
  return params;
}

/** Tolak POST lintas situs. Cookie SameSite=Lax sudah menahan sebagian besar; ini lapisan kedua (Origin) dan ketiga
 * (Sec-Fetch-Site dari browser modern: hanya same-origin, atau none = diketik / bookmark). */
function sameOrigin(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
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

/** Panggilan dari halaman Astro di proses yang sama (src/lib/api.ts): user sudah dicari middleware, tidak dicari
 * lagi. Hanya bisa diisi lewat pemanggilan fungsi langsung, tidak lewat header request. */
export type Internal = { user: User | null };

async function route(req: Request, url: URL, ip: string, internal?: Internal): Promise<Response> {
  // body dibaca sekali lalu disimpan, agar penanganan error tetap bisa memakai _back
  let body: Promise<Fields> | null = null;
  const c: Ctx = { req, url, params: {}, user: null, ip, body: () => (body ??= readBody(req)) };
  try {
    if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) {
      throw new HttpError(403, "origin-denied");
    }
    const path = url.pathname.split("/");
    for (const r of routes) {
      if (r.method !== req.method && !(r.method === "GET" && req.method === "HEAD")) continue;
      const params = match(r.parts, path);
      if (!params) continue;
      c.params = params;
      if (r.session) c.user = internal ? internal.user : await currentUser(req);
      return await handler(r, c);
    }
    throw new HttpError(404, "not-found");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    let code: ErrCode = e instanceof HttpError ? e.code : "server-error";
    if (status === 500) logError(`[api] ${req.method} ${url.pathname}`, e);
    // sesi berakhir: cookie ada tapi tidak berlaku lagi (kedaluwarsa, password direset, keluar di tab lain)
    if (status === 401 && hasSessionCookie(req))
      code = req.method === "GET" ? "session-expired" : "session-expired-draft";
    if (wantsJson(req) || req.method === "GET") return json({ ok: false, error: ERR[code], code }, status);
    // _back dari body: yang sudah dibaca handler, atau (ditolak sebelum handler: belum login / origin) body kecil saja
    const f = await (body ?? readBody(req, ERROR_BODY_BYTES)).catch(() => undefined);
    if (status === 401) {
      // kembali ke halaman asal setelah login; isian form disimpan forms.ts dan dipulihkan di sana
      const next = safeNext(backPath(c, f)) ?? "/dashboard";
      return done(c, { err: code, to: `/login?next=${encodeURIComponent(next)}` });
    }
    // kembali ke _back bila body bisa dibaca (mis. error validasi di projectInput), selain itu Referer
    return done(c, { err: code, to: backPath(c, f) });
  }
}
const handler = (r: Route, c: Ctx) => r.handler(c);

export async function handleApi(req: Request, ip = "unknown", internal?: Internal): Promise<Response> {
  const url = new URL(req.url);
  return noStore(url.pathname, await route(req, url, ip, internal));
}
