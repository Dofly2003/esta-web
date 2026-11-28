// In-process API tests (handleApi) against the throwaway SQLite DB from tests/server/setup.ts.
// Ported from the phase-1 / audit-2 scratch suite. Clock frozen at 2026-11-26T18:30:00Z = 27 Nov 2026 01:30 WIB
// (the window where server-local UTC used to give the wrong day). Runs under several TZ values (bun run test:server);
// every expectation is TZ-independent.
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import "./guard";
import * as repo from "../../server/repo";
import { hashPassword } from "../../server/auth";
import * as F from "../../shared/format";
import * as M from "../../shared/messages";
import * as C from "../../shared/constants";
import { errOf, get, login, net, okOf, ORIGIN, post, PW, q, raw } from "./helpers";
import { TASK_BOARD_CAP as C_TASK_BOARD_CAP } from "../../shared/schemas/query";

const NOW = new Date("2026-11-26T18:30:00.000Z");

/** Network calls recorded since the start of this file (setup.ts answers every fetch locally) */
const netCalls = {
  get length() {
    return net.calls.length;
  },
  slice: (n: number) => net.calls.slice(n),
};
const tick = () => new Promise((r) => setTimeout(r, 30));
async function loginAt(ip: string, email: string, password: string) {
  const res = await raw("/api/auth/login", {
    method: "POST",
    ip,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password, next: "/dashboard" }),
  });
  return q(res.headers.get("location")).searchParams.get("err");
}

/* ---------------- fixture ---------------- */
const day = F.dayOffset;
let admin = "",
  member = "",
  adminCookie = "",
  memberCookie = "";
const ids: Record<string, string> = {};

beforeAll(async () => {
  setSystemTime(NOW);
  await repo.wipeAll();
  const hash = await hashPassword(PW);
  admin = await repo.users.create({ name: "Admin T", email: "admin@t.test", role: "ADMIN", passwordHash: hash });
  member = await repo.users.create({ name: "Member T", email: "member@t.test", role: "MEMBER", passwordHash: hash });
  const P = (
    name: string,
    status: string,
    startDate: string | null,
    dueDate: string | null,
    leadId: string | null = admin,
  ) =>
    repo.projects.create({
      name,
      client: "Klien",
      type: "WEBSITE",
      status,
      description: "",
      budget: null,
      startDate,
      dueDate,
      leadId,
    });
  const T = (
    projectId: string,
    title: string,
    dueDate: string | null,
    assigneeId: string | null,
    status = "TODO",
    priority = "MEDIUM",
  ) => repo.tasks.create({ projectId, title, description: "", status, priority, dueDate, assigneeId });

  // A: in progress, project deadline passed → late
  ids.A = await P("A late", "IN_PROGRESS", day(-10), day(-1));
  ids.a1 = await T(ids.A, "a1 overdue unassigned", day(-2), null);
  ids.a2 = await T(ids.A, "a2 due today mine", day(0), admin, "TODO", "LOW");
  ids.a3 = await T(ids.A, "a3 done", day(-5), admin, "DONE");
  // B: on hold → its tasks are not live
  ids.B = await P("B on hold", "ON_HOLD", day(-30), day(-3));
  ids.b1 = await T(ids.B, "b1 overdue on hold", day(-4), null);
  // C: done, no portfolio → not live; doneWithoutPortfolio
  ids.C = await P("C done", "DONE", day(-60), day(-20));
  ids.c1 = await T(ids.C, "c1 forgotten todo", day(-25), admin);
  // E: done, with portfolio item linked
  ids.E = await P("E done linked", "DONE", null, null);
  // D: planning, 50% time elapsed, 0/1 done → at risk (behind)
  ids.D = await P("D behind", "PLANNING", day(-10), day(10), member);
  ids.d1 = await T(ids.D, "d1 week edge", day(7), admin, "TODO", "HIGH");
  ids.d2 = await T(ids.D, "d2 outside week", day(8), member);
  // G: review, healthy (no dates on project)
  ids.G = await P("G healthy", "REVIEW", null, day(30), null);
  ids.g1 = await T(ids.G, "g1 same day as a2 but HIGH", day(0), admin, "IN_PROGRESS", "HIGH");
  ids.g2 = await T(ids.G, "g2 no date mine", null, admin);

  ids.pfE = await repo.portfolio.create({
    title: "E karya",
    slug: "e-karya",
    client: "",
    category: "Website",
    year: 2026,
    summary: "",
    content: "",
    tags: "",
    coverColor: "#6d5efc",
    imageUrl: null,
    liveUrl: null,
    featured: false,
    published: false,
    sortOrder: 0,
    projectId: ids.E,
  });
  await repo.inquiries.create({
    name: "Q1",
    email: "q1@x.test",
    company: "",
    service: "",
    budget: "",
    message: "m",
    createdAt: "2026-11-20T03:00:00.000Z",
  });
  await repo.inquiries.create({
    name: "Q2",
    email: "q2@x.test",
    company: "",
    service: "",
    budget: "",
    message: "m",
    createdAt: "2026-11-25T03:00:00.000Z",
  });
  await repo.inquiries.create({
    name: "Q3",
    email: "q3@x.test",
    company: "",
    service: "",
    budget: "",
    message: "m",
    status: "CLOSED",
    createdAt: "2026-11-01T03:00:00.000Z",
  });
  for (let i = 0; i < 5; i++)
    await repo.inquiries.create({
      name: "N" + i,
      email: "n@x.test",
      company: "",
      service: "",
      budget: "",
      message: "m",
      createdAt: `2026-11-26T0${i}:00:00.000Z`,
    });

  adminCookie = await login("admin@t.test", PW);
  memberCookie = await login("member@t.test", PW);
});

afterAll(() => {
  setSystemTime();
  net.reset();
});

/* ---------------- 2. timezone ---------------- */
describe("timezone (APP_TZ)", () => {
  test("runs with TZ=" + (process.env.TZ ?? "(local)"), () => {
    expect(C.APP_TZ).toBe("Asia/Jakarta");
  });
  test("today() is the WIB day, not the server day", () => {
    expect(F.today()).toBe("2026-11-27");
    expect(F.isoDay(new Date("2026-11-26T16:59:59Z"))).toBe("2026-11-26");
    expect(F.isoDay(new Date("2026-11-26T17:00:00Z"))).toBe("2026-11-27");
    expect(F.currentYear()).toBe(2026);
  });
  test("dayOffset crosses months/years", () => {
    expect(F.dayOffset(1)).toBe("2026-11-28");
    expect(F.dayOffset(4)).toBe("2026-12-01");
    expect(F.dayOffset(-27)).toBe("2026-10-31");
    expect(F.dayOffset(35)).toBe("2027-01-01");
  });
  test("fmtDate: date-only never shifts, timestamps shown as WIB day", () => {
    expect(F.fmtDate("2026-11-27")).toBe("27 Nov 2026");
    expect(F.fmtDate("2026-01-01")).toBe("1 Jan 2026");
    expect(F.fmtDate("2026-11-25T19:00:00.000Z")).toBe("26 Nov 2026");
    expect(F.fmtDate(new Date("2026-11-26T18:30:00Z"))).toBe("27 Nov 2026");
    expect(F.fmtDate(null)).toBe("—");
    expect(F.fmtDate("")).toBe("—");
    expect(F.fmtDate("bukan tanggal")).toBe("—");
  });
  test("isOverdue / relDays / isDueWithin", () => {
    expect(F.isOverdue("2026-11-26")).toBe(true);
    expect(F.isOverdue("2026-11-27")).toBe(false);
    expect(F.isOverdue("2026-11-26", true)).toBe(false);
    expect(F.isOverdue(new Date("2026-11-25T12:00:00Z"))).toBe(true); // Date input bug fixed
    expect(F.isOverdue(null)).toBe(false);
    expect(F.relDays("2026-11-27")).toBe(0);
    expect(F.relDays("2026-11-30")).toBe(3);
    expect(F.relDays("2026-11-24")).toBe(-3);
    expect(F.relDays("2026-11-26T18:00:00Z")).toBe(0); // 01:00 WIB on the 27th
    expect(F.relDays(null)).toBe(null);
    expect(F.isDueWithin(day(0))).toBe(true);
    expect(F.isDueWithin(day(7))).toBe(true);
    expect(F.isDueWithin(day(8))).toBe(false);
    expect(F.isDueWithin(day(-1))).toBe(false);
  });
  test("elapsed()", () => {
    expect(F.elapsed({ startDate: day(-10), dueDate: day(10) })).toBe(0.5);
    expect(F.elapsed({ startDate: day(5), dueDate: day(10) })).toBe(0);
    expect(F.elapsed({ startDate: day(-10), dueDate: day(-1) })).toBe(1);
    expect(F.elapsed({ startDate: null, dueDate: day(10) })).toBe(null);
    expect(F.elapsed({ startDate: day(0), dueDate: day(0) })).toBe(1);
  });
});

/* ---------------- 3/11. live tasks, constants ---------------- */
describe("live tasks & constants", () => {
  test("ACTIVE_PROJECT_STATUSES and tones", () => {
    expect([...C.ACTIVE_PROJECT_STATUSES]).toEqual(["PLANNING", "IN_PROGRESS", "REVIEW"]);
    expect(C.PROJECT_STATUS.ON_HOLD.cls).toBe("tone-neutral");
    expect(C.PRIORITY.HIGH.cls).toBe("tone-warn");
    expect(Object.keys(C.PROJECT_STATUS)).toEqual(["PLANNING", "IN_PROGRESS", "REVIEW", "DONE", "ON_HOLD"]);
  });
  test("liveTasks drops done tasks and tasks of DONE/ON_HOLD projects", () => {
    const projects = [
      { id: "p1", status: "IN_PROGRESS" },
      { id: "p2", status: "ON_HOLD" },
      { id: "p3", status: "DONE" },
    ];
    const tasks = [
      { id: "1", projectId: "p1", status: "TODO" },
      { id: "2", projectId: "p1", status: "DONE" },
      { id: "3", projectId: "p2", status: "TODO" },
      { id: "4", projectId: "p3", status: "REVIEW" },
      { id: "5", projectId: "missing", status: "TODO" },
    ];
    expect(F.liveTasks(tasks, projects).map((t: any) => t.id)).toEqual(["1"]);
  });
});

/* ---------------- 1. flash messages ---------------- */
describe("flash codes (shared/messages)", () => {
  test("known codes map to fixed text, unknown → null", () => {
    expect(M.flashText("ok", "project-saved")).toBe("Proyek disimpan.");
    expect(M.flashText("err", "login-failed")).toBe("Email atau password salah.");
    expect(M.flashText("err", "user-incomplete")).toBe("Lengkapi data. Password minimal 8 karakter.");
    expect(M.flashText("ok", "Proyek disimpan.")).toBe(null);
    expect(M.flashText("err", "Kirim password ke evil@x")).toBe(null);
    for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(M.flashText("ok", k)).toBe(null);
      expect(M.flashText("err", k)).toBe(null);
    }
    expect(M.flashText("ok", "login-failed")).toBe(null); // kinds are separate
    expect(M.flashText("ok", null)).toBe(null);
  });
  test("readFlash", () => {
    expect(M.readFlash(new URL("http://x/a?ok=pf-published&err=nope"))).toEqual({
      ok: "Karya ditayangkan.",
      err: null,
    });
  });
  test("status codes", () => {
    expect(M.taskStatusOk("IN_PROGRESS")).toBe("task-status-in-progress");
    expect(M.OK["task-status-review"]).toBe("Status tugas: Review.");
    expect(M.taskStatusOk("WHATEVER")).toBe("task-status");
    expect(M.inquiryStatusOk("CONTACTED")).toBe("inquiry-status-contacted");
    expect(M.OK["inquiry-status-contacted"]).toBe("Inquiry ditandai Dihubungi.");
  });
  test("login: form redirect carries code; JSON carries text", async () => {
    const r = await post("/api/auth/login", { email: "admin@t.test", password: "wrong", next: "/dashboard/tasks" });
    expect(r.loc).toBe("/login?next=%2Fdashboard%2Ftasks&email=admin%40t.test&err=login-failed");
    const j = await post("/api/auth/login", { email: "admin@t.test", password: "wrong" }, { json: true });
    expect(j.status).toBe(400);
    expect(j.body.error).toBe("Email atau password salah.");
    expect(j.body.code).toBe("login-failed");
  });
  test("public inquiry form: codes for redirects, text for JSON (ContactForm)", async () => {
    expect((await post("/api/public/inquiries", { name: "", email: "", message: "" })).loc).toBe(
      "/contact?err=inquiry-required",
    );
    expect((await post("/api/public/inquiries", { name: "a", email: "bad", message: "m" })).loc).toBe(
      "/contact?err=inquiry-email",
    );
    // hardening: the honeypot answers exactly like a real submission (was /contact?ok=inquiry-thanks), nothing stored
    expect(
      (await post("/api/public/inquiries", { website: "bot", name: "Bot", email: "b@x.test", message: "m" })).loc,
    ).toBe("/contact?terkirim=1&ok=inquiry-sent");
    expect((await repo.inquiries.list()).some((x) => x.name === "Bot")).toBe(false);
    const bad = await post("/api/public/inquiries", { name: "a", email: "bad", message: "m" }, { json: true });
    expect(bad.body).toMatchObject({ ok: false, error: "Format email tidak valid." });
    const ok = await post("/api/public/inquiries", { name: "Web", email: "w@x.test", message: "halo" }, { json: true });
    expect(ok.body).toMatchObject({
      ok: true,
      message: "Pesan terkirim. Kami akan menghubungimu dalam 1×24 jam kerja.",
    });
    const form = await post("/api/public/inquiries", { name: "Web2", email: "w@x.test", message: "halo" });
    expect(form.loc).toBe("/contact?terkirim=1&ok=inquiry-sent");
  });
  test("thrown errors: GET JSON keeps text (+code); POST form gets code", async () => {
    const g = await get("/api/projects/nope", { cookie: adminCookie });
    expect(g.status).toBe(404);
    expect(g.body).toEqual({ ok: false, error: "Proyek tidak ditemukan.", code: "project-not-found" });
    expect((await get("/api/nope")).body.error).toBe("Endpoint tidak ditemukan.");
    expect((await get("/api/dashboard")).body.error).toBe("Silakan masuk dulu.");
    const o = await post(
      "/api/tasks/x/status",
      { status: "DONE", _back: "/dashboard/tasks" },
      { cookie: adminCookie, origin: "https://evil.test" },
    );
    expect(o.loc).toBe("/dashboard/tasks?err=origin-denied");
    const nouser = await post("/api/projects", { name: "x", client: "y" });
    expect(nouser.loc).toBe("/login?next=%2Fdashboard&err=login-required");
  });
  test("thrown validation error returns to _back (body memoised)", async () => {
    const r = await post(
      `/api/projects/${ids.G}`,
      { name: "", client: "", _back: `/dashboard/projects/${ids.G}#edit` },
      { cookie: adminCookie },
    );
    expect(r.loc).toBe(`/dashboard/projects/${ids.G}?err=project-required#edit`);
  });
  test("every redirect query value is a known code (no free text)", async () => {
    const r = await post("/api/users", { name: "", email: "", password: "" }, { cookie: adminCookie });
    expect(q(r.loc).searchParams.get("err")).toBe("user-name-required");
  });
});

/* ---------------- 9. _back fragment ---------------- */
describe("_back #fragment", () => {
  test("simple id fragment kept, ok code added before it", async () => {
    const r = await post(
      `/api/tasks/${ids.g1}/status`,
      { status: "REVIEW", _back: `/dashboard/tasks?filter=all&ok=old#task-${ids.g1}` },
      { cookie: adminCookie },
    );
    expect(r.loc).toBe(`/dashboard/tasks?filter=all&ok=task-status-review#task-${ids.g1}`);
    expect((await repo.tasks.get(ids.g1))!.status).toBe("REVIEW");
    await repo.tasks.setStatus(ids.g1, "IN_PROGRESS");
  });
  test("unsafe fragments are dropped", async () => {
    for (const frag of ["#a b", '#"><img>', "#1abc", "#" + "x".repeat(150), "#a/b", "#"]) {
      const r = await post(
        `/api/tasks/${ids.g1}/status`,
        { status: "IN_PROGRESS", _back: `/dashboard/tasks${frag}` },
        { cookie: adminCookie },
      );
      expect(r.loc).toBe("/dashboard/tasks?ok=task-status-in-progress");
    }
  });
  test("external / protocol-relative _back still ignored", async () => {
    const r = await post(
      `/api/tasks/${ids.g1}/status`,
      { status: "IN_PROGRESS", _back: "https://evil.test/x#a" },
      { cookie: adminCookie },
    );
    // existing behaviour: only the path of an absolute URL is used, so the redirect stays on this site
    expect(r.loc).toBe("/x?ok=task-status-in-progress#a");
    const r2 = await post(
      `/api/tasks/${ids.g1}/status`,
      { status: "IN_PROGRESS", _back: "//evil.test/x" },
      { cookie: adminCookie },
    );
    expect(r2.loc).toBe("/x?ok=task-status-in-progress");
  });
  test("inquiry status → code per status, fragment kept, fallback inbox", async () => {
    const list = (await get("/api/inquiries", { cookie: adminCookie })).body.items;
    const id = list.find((x: any) => x.name === "N0").id;
    const r = await post(
      `/api/inquiries/${id}/status`,
      { status: "CONTACTED", _back: `/dashboard/inbox?status=NEW#inq-${id}` },
      { cookie: adminCookie },
    );
    expect(r.loc).toBe(`/dashboard/inbox?status=NEW&ok=inquiry-status-contacted#inq-${id}`);
    const r2 = await post(`/api/inquiries/${id}/status`, { status: "NEW" }, { cookie: adminCookie });
    expect(r2.loc).toBe("/dashboard/inbox?ok=inquiry-status-new");
  });
  test("task create/save keep fragment", async () => {
    const r = await post(
      "/api/tasks",
      { projectId: ids.G, title: "tmp", _back: `/dashboard/projects/${ids.G}#tasks` },
      { cookie: adminCookie },
    );
    expect(r.loc).toBe(`/dashboard/projects/${ids.G}?ok=task-created#tasks`);
    const tmp = (await repo.tasks.byProject(ids.G)).find((t: any) => t.title === "tmp")!;
    const s = await post(
      `/api/tasks/${tmp.id}`,
      { title: "", _back: `/dashboard/projects/${ids.G}#task-${tmp.id}` },
      { cookie: adminCookie },
    );
    expect(s.loc).toBe(`/dashboard/projects/${ids.G}?err=task-edit-title-required#task-${tmp.id}`);
    const d = await post(
      `/api/tasks/${tmp.id}/delete`,
      { _back: `/dashboard/projects/${ids.G}#tasks` },
      { cookie: adminCookie },
    );
    expect(d.loc).toBe(`/dashboard/projects/${ids.G}?ok=task-deleted#tasks`);
  });
});

/* ---------------- 4/5. dashboard ---------------- */
describe("/api/dashboard", () => {
  test("live counts, true totals, new metrics", async () => {
    const { body: d } = await get("/api/dashboard", { cookie: adminCookie });
    // live = a1, a2, d1, d2, g1, g2 (b1 on-hold, c1 done-project, a3 done excluded)
    expect(d.openTasks).toBe(6);
    expect(d.overdue).toBe(1); // a1 only (b1/c1 excluded)
    expect(d.dueThisWeek).toBe(3); // a2, g1 (today), d1 (+7)
    expect(d.dueToday).toBe(2);
    expect(d.unassigned).toBe(1); // a1
    expect(d.onHoldTasks).toBe(1);
    expect(d.doneWithoutPortfolio).toBe(1); // C (E is linked)
    expect(d.newInquiries).toBe(9); // Q1, Q2, N0..N4, Web, Web2 (Q3 is CLOSED)
    expect(d.inquiries.length).toBe(4);
    expect(d.oldestNewInquiryAt).toBe("2026-11-20T03:00:00.000Z");
    expect(d.myOpenTasks).toBe(4); // a2, d1, g1, g2
    expect(d.myOverdue).toBe(0);
    expect(d.myTasks.map((t: any) => t.title)).toEqual([
      "g1 same day as a2 but HIGH",
      "a2 due today mine",
      "d1 week edge",
      "g2 no date mine",
    ]);
    expect(d.myTasks[0].projectName).toBe("G healthy");
    expect(d.activeProjects).toBe(3);
    expect(d.projectsAtRisk).toBe(2);
    expect(d.active.map((p: any) => p.name)).toEqual(["A late", "D behind", "G healthy"]);
    const [A, D, G] = d.active;
    expect(A).toMatchObject({ late: true, atRisk: false, doneTasks: 1, totalTasks: 3, elapsed: 1, daysLeft: -1 });
    expect(D).toMatchObject({ late: false, atRisk: true, doneTasks: 0, totalTasks: 2, elapsed: 0.5, daysLeft: 10 });
    expect(G).toMatchObject({ late: false, atRisk: false, elapsed: null, daysLeft: 30, totalTasks: 2 });
    expect(D.lead.id).toBe(member);
    // hanya hitungan, bukan daftar tugas per proyek (ringkasan tidak memuat semua tugas)
    expect(A.tasks).toBeUndefined();
    expect(A.description).toBeUndefined();
  });
  test("myTasks capped at 8 but myOpenTasks is the true total", async () => {
    const extra: string[] = [];
    for (let i = 0; i < 7; i++)
      extra.push(
        await repo.tasks.create({
          projectId: ids.G,
          title: "cap" + i,
          description: "",
          status: "TODO",
          priority: "LOW",
          dueDate: null,
          assigneeId: admin,
        }),
      );
    const { body: d } = await get("/api/dashboard", { cookie: adminCookie });
    expect(d.myTasks.length).toBe(8);
    expect(d.myOpenTasks).toBe(11);
    for (const id of extra) await repo.tasks.remove(id);
  });
});

/* ---------------- 6. drill-down filters ---------------- */
describe("drill-down filters", () => {
  const titles = (b: any) => b.tasks.map((t: any) => t.title).sort();
  test("/api/tasks without new params = old behaviour", async () => {
    const mine = (await get("/api/tasks", { cookie: adminCookie })).body;
    // audit 2 (M: member counts consistent): default list = my open tasks in ACTIVE projects only (c1 in a DONE project excluded)
    expect(titles(mine)).toEqual([
      "a2 due today mine",
      "d1 week edge",
      "g1 same day as a2 but HIGH",
      "g2 no date mine",
    ]);
    const all = (await get("/api/tasks?filter=all&done=1", { cookie: adminCookie })).body;
    // active projects only (b1 on-hold, c1 done-project excluded); done=1 adds a3
    expect(all.tasks.length).toBe(7);
    expect(all.counts).toEqual({ overdue: 1, dueThisWeek: 3, unassigned: 1 });
    // no board/col params: no colPage, full list (statusCounts is extra, additive)
    expect(all.colPage).toBeUndefined();
    const sum = Object.values(all.statusCounts as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(sum).toBe(all.tasks.length);
    expect(all.statusCounts.DONE).toBe(1);
  });
  test("board=1 caps each status column, col= pages one column, pin keeps a task", async () => {
    // 35 extra TODO tasks of mine with long notes (deadline far → sorted after the fixture tasks)
    const extra: string[] = [];
    for (let i = 0; i < 35; i++)
      extra.push(
        await repo.tasks.create({
          projectId: ids.G,
          title: `cap ${String(i).padStart(2, "0")}`,
          description: "x".repeat(400),
          status: "TODO",
          priority: "LOW",
          dueDate: day(100 + i),
          assigneeId: admin,
        }),
      );
    try {
      const full = (await get("/api/tasks", { cookie: adminCookie })).body;
      const todo = full.tasks.filter((t: any) => t.status === "TODO");
      expect(full.tasks.length).toBe(39);
      expect(full.tasks.find((t: any) => t.id === extra[0]).description.length).toBe(400);

      const b = (await get("/api/tasks?board=1", { cookie: adminCookie })).body;
      expect(b.tasks.filter((t: any) => t.status === "TODO").length).toBe(C_TASK_BOARD_CAP);
      // same order as the full list, just cut
      const ids_ = (l: any[]) => l.map((t: any) => t.id);
      const kept = new Set(ids_(todo.slice(0, C_TASK_BOARD_CAP)));
      expect(ids_(b.tasks)).toEqual(ids_(full.tasks.filter((t: any) => t.status !== "TODO" || kept.has(t.id))));
      expect(b.statusCounts.TODO).toBe(todo.length);
      expect(b.tasks.find((t: any) => t.id === extra[0]).description.length).toBe(280);
      expect(b.counts).toEqual(full.counts);

      // pin: a task beyond the cap is kept (at its sorted position)
      const last = todo[todo.length - 1].id;
      const pinned = (await get(`/api/tasks?board=1&pin=${last}`, { cookie: adminCookie })).body;
      expect(pinned.tasks.length).toBe(b.tasks.length + 1);
      expect(pinned.tasks.filter((t: any) => t.status === "TODO").at(-1).id).toBe(last);

      // one column, paged; page past the end is clamped; junk params ignored
      const p1 = (await get("/api/tasks?col=TODO", { cookie: adminCookie })).body;
      expect(p1.colPage).toEqual({ page: 1, pages: 1, total: todo.length });
      expect(p1.tasks.map((t: any) => t.id)).toEqual(todo.map((t: any) => t.id));
      const p9 = (await get("/api/tasks?col=TODO&page=9", { cookie: adminCookie })).body;
      expect(p9.colPage.page).toBe(1);
      const empty = (await get("/api/tasks?col=REVIEW", { cookie: adminCookie })).body;
      expect(empty.tasks).toEqual([]);
      expect(empty.colPage).toEqual({ page: 1, pages: 1, total: 0 });
      const junk = (await get("/api/tasks?board=2&col=NOPE&page=-1&pin=a%20b", { cookie: adminCookie })).body;
      expect(junk.tasks.length).toBe(39);
      expect(junk.colPage).toBeUndefined();
    } finally {
      for (const id of extra) await repo.tasks.remove(id);
    }
  });
  test("GET /api/tasks/:id = edit form data; unknown id 404; needs login", async () => {
    const r = await get(`/api/tasks/${ids.g1}`, { cookie: adminCookie });
    expect(r.status).toBe(200);
    expect(r.body.task.id).toBe(ids.g1);
    expect(Object.keys(r.body.task).sort()).toEqual(
      ["assigneeId", "description", "dueDate", "id", "priority", "projectId", "status", "title", "updatedAt"].sort(),
    );
    expect(r.body.users.map((u: any) => u.name).sort()).toEqual(["Admin T", "Member T"]);
    expect(r.body.users[0].passwordHash).toBeUndefined();
    expect((await get("/api/tasks/nope", { cookie: adminCookie })).status).toBe(404);
    expect((await get(`/api/tasks/${ids.g1}`)).status).toBe(401);
  });
  test("due=overdue|week, assignee=none|<id>", async () => {
    expect(titles((await get("/api/tasks?filter=all&due=overdue", { cookie: adminCookie })).body)).toEqual([
      "a1 overdue unassigned",
    ]);
    expect(titles((await get("/api/tasks?filter=all&due=week", { cookie: adminCookie })).body)).toEqual([
      "a2 due today mine",
      "d1 week edge",
      "g1 same day as a2 but HIGH",
    ]);
    expect(titles((await get("/api/tasks?due=week", { cookie: adminCookie })).body).length).toBe(3); // mine scope, all 3 are mine
    expect(titles((await get("/api/tasks?filter=all&assignee=none", { cookie: adminCookie })).body)).toEqual([
      "a1 overdue unassigned",
    ]);
    expect(titles((await get(`/api/tasks?assignee=${member}`, { cookie: adminCookie })).body)).toEqual([
      "d2 outside week",
    ]);
    expect(titles((await get(`/api/tasks?assignee=${member}&due=overdue`, { cookie: adminCookie })).body)).toEqual([]);
    // unknown due value → ignored (old behaviour)
    expect((await get("/api/tasks?due=foo", { cookie: adminCookie })).body.tasks.length).toBe(4);
  });
  test("/api/projects status=ACTIVE + counts; old params unchanged", async () => {
    const act = (await get("/api/projects?status=ACTIVE", { cookie: adminCookie })).body;
    expect(act.projects.map((p: any) => p.name).sort()).toEqual(["A late", "D behind", "G healthy"]);
    expect(act.counts).toEqual({ ALL: 6, ACTIVE: 3, PLANNING: 1, IN_PROGRESS: 1, REVIEW: 1, DONE: 2, ON_HOLD: 1 });
    expect((await get("/api/projects?status=DONE", { cookie: adminCookie })).body.projects.length).toBe(2);
    expect((await get("/api/projects", { cookie: adminCookie })).body.projects.length).toBe(6);
    const qd = (await get("/api/projects?status=ACTIVE&q=behind", { cookie: adminCookie })).body;
    expect(qd.projects.length).toBe(1);
    expect(qd.counts.ALL).toBe(1);
  });
  test("/api/inquiries?status still works", async () => {
    const n = (await get("/api/inquiries?status=CLOSED", { cookie: adminCookie })).body.items;
    expect(n.map((x: any) => x.name)).toEqual(["Q3"]);
  });
});

/* ---------------- 8. portfolio ---------------- */
describe("portfolio publish/featured rules", () => {
  let id = "";
  const item = async () => (await repo.portfolio.get(id))!;
  test("draft from project, then featured refused while unpublished", async () => {
    const r = await post(`/api/projects/${ids.C}/portfolio`, {}, { cookie: adminCookie });
    expect(r.loc).toMatch(/^\/dashboard\/portfolio\/[\w-]+\?ok=portfolio-draft-created$/);
    id = q(r.loc).pathname.split("/").pop()!;
    expect((await item()).year).toBe(Number(day(-20).slice(0, 4)));
    const f = await post(
      `/api/portfolio/${id}/toggle`,
      { field: "featured", _back: `/dashboard/portfolio#pf-${id}` },
      { cookie: adminCookie },
    );
    expect(f.loc).toBe(`/dashboard/portfolio?err=pf-feature-unpublished#pf-${id}`);
    expect((await item()).featured).toBe(false);
  });
  test("publish → feature → unpublish clears featured", async () => {
    expect(
      (
        await post(
          `/api/portfolio/${id}/toggle`,
          { field: "published" },
          { cookie: adminCookie, referer: ORIGIN + "/dashboard/portfolio" },
        )
      ).loc,
    ).toBe("/dashboard/portfolio?ok=pf-published");
    expect((await post(`/api/portfolio/${id}/toggle`, { field: "featured" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/portfolio?ok=pf-featured",
    );
    expect(await item()).toMatchObject({ published: true, featured: true });
    expect((await post(`/api/portfolio/${id}/toggle`, { field: "published" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/portfolio?ok=pf-unpublished-unfeatured",
    );
    expect(await item()).toMatchObject({ published: false, featured: false });
    expect(
      (await post(`/api/portfolio/${id}/toggle`, { field: "published", value: "off" }, { cookie: adminCookie })).loc,
    ).toBe("/dashboard/portfolio?ok=pf-unpublished");
  });
  test("explicit value=on is idempotent; unfeature", async () => {
    await post(`/api/portfolio/${id}/toggle`, { field: "published", value: "on" }, { cookie: adminCookie });
    await post(`/api/portfolio/${id}/toggle`, { field: "published", value: "on" }, { cookie: adminCookie });
    expect((await item()).published).toBe(true);
    await post(`/api/portfolio/${id}/toggle`, { field: "featured", value: "on" }, { cookie: adminCookie });
    expect((await post(`/api/portfolio/${id}/toggle`, { field: "featured" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/portfolio?ok=pf-unfeatured",
    );
  });
  test("save: featured without published is dropped with its own code", async () => {
    const r = await post(`/api/portfolio/${id}`, { title: "C karya", featured: "on" }, { cookie: adminCookie });
    expect(r.loc).toBe(`/dashboard/portfolio/${id}?ok=pf-saved-unfeatured`);
    expect(await item()).toMatchObject({ published: false, featured: false });
    const r2 = await post(
      `/api/portfolio/${id}`,
      { title: "C karya", featured: "on", published: "on" },
      { cookie: adminCookie },
    );
    expect(r2.loc).toBe(`/dashboard/portfolio/${id}?ok=pf-saved`);
    expect(await item()).toMatchObject({ published: true, featured: true });
    const r3 = await post(
      "/api/portfolio",
      { title: "" },
      { cookie: adminCookie, referer: ORIGIN + "/dashboard/portfolio/new" },
    );
    expect(r3.loc).toBe("/dashboard/portfolio/new?err=pf-title-required");
  });
  test("toggle on missing item → pf-not-found", async () => {
    const r = await post(
      "/api/portfolio/nope/toggle",
      { field: "published", _back: "/dashboard/portfolio" },
      { cookie: adminCookie },
    );
    expect(r.loc).toBe("/dashboard/portfolio?err=pf-not-found");
  });
  test("delete", async () => {
    expect((await post(`/api/portfolio/${id}/delete`, {}, { cookie: adminCookie })).loc).toBe(
      "/dashboard/portfolio?ok=pf-deleted",
    );
  });
});

/* ---------------- 7. team & admin ---------------- */
describe("team & admin features", () => {
  test("/api/team exposes workload, led projects, unassigned, adminCount", async () => {
    const t = (await get("/api/team", { cookie: adminCookie })).body;
    const a = t.users.find((u: any) => u.id === admin);
    const m = t.users.find((u: any) => u.id === member);
    expect(a).toMatchObject({ openTasks: 4, overdue: 0, ledProjects: 4, assignedOpenTasks: 5 });
    expect(m).toMatchObject({ openTasks: 1, overdue: 0, ledProjects: 1, assignedOpenTasks: 1 });
    expect(t.unassigned).toBe(1);
    expect(t.adminCount).toBe(1);
    expect(t.discord).not.toBe(null);
    expect((await get("/api/team", { cookie: memberCookie })).body.discord).toBe(null);
  });
  test("reset password: admin only, min length, not self, sessions invalidated", async () => {
    expect(
      (await post(`/api/users/${member}/password`, { password: "x".repeat(12) }, { cookie: memberCookie })).loc,
    ).toBe("/dashboard?err=admin-only");
    expect((await post(`/api/users/${member}/password`, { password: "short" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?err=password-short",
    );
    expect(
      (await post(`/api/users/${admin}/password`, { password: "x".repeat(12) }, { cookie: adminCookie })).loc,
    ).toBe("/dashboard/team?err=user-reset-self");
    expect(
      (
        await post(
          `/api/users/nope/password`,
          { password: "x".repeat(12), _back: "/dashboard/team#u-nope" },
          { cookie: adminCookie },
        )
      ).loc,
    ).toBe("/dashboard/team?err=user-not-found#u-nope");
    expect((await get("/api/me", { cookie: memberCookie })).status).toBe(200);
    const r = await post(
      `/api/users/${member}/password`,
      { password: "new-password-456", _back: `/dashboard/team#user-${member}` },
      { cookie: adminCookie },
    );
    expect(r.loc).toBe(`/dashboard/team?ok=user-password-reset#user-${member}`);
    expect((await get("/api/me", { cookie: memberCookie })).status).toBe(401);
    expect((await get("/api/me", { cookie: adminCookie })).status).toBe(200);
    memberCookie = await login("member@t.test", "new-password-456");
    const j = await post(`/api/users/${member}/password`, { password: "short" }, { cookie: adminCookie, json: true });
    expect(j.body).toMatchObject({ ok: false, error: "Password baru minimal 8 karakter.", code: "password-short" });
  });
  test("role change & last-admin protection", async () => {
    expect((await post(`/api/users/${member}/role`, { role: "OWNER" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?err=role-invalid",
    );
    expect((await post(`/api/users/${member}/role`, { role: "constructor" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?err=role-invalid",
    );
    expect((await post(`/api/users/${member}/role`, { role: "ADMIN" }, { cookie: memberCookie })).loc).toBe(
      "/dashboard?err=admin-only",
    );
    // only admin cannot demote themselves
    expect((await post(`/api/users/${admin}/role`, { role: "MEMBER" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?err=last-admin",
    );
    expect((await repo.users.get(admin))!.role).toBe("ADMIN");
    // promote member
    expect((await post(`/api/users/${member}/role`, { role: "ADMIN" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?ok=user-role-changed",
    );
    expect((await get("/api/team", { cookie: adminCookie })).body.adminCount).toBe(2);
    // with 2 admins, admin may demote self
    expect((await post(`/api/users/${admin}/role`, { role: "MEMBER" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?ok=user-role-changed",
    );
    // now member is the last admin: cannot demote self; former admin is no longer admin
    expect((await post(`/api/users/${member}/role`, { role: "MEMBER" }, { cookie: memberCookie })).loc).toBe(
      "/dashboard/team?err=last-admin",
    );
    expect((await post(`/api/users/${member}/role`, { role: "MEMBER" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard?err=admin-only",
    );
    // restore
    expect((await post(`/api/users/${admin}/role`, { role: "ADMIN" }, { cookie: memberCookie })).loc).toBe(
      "/dashboard/team?ok=user-role-changed",
    );
    expect((await post(`/api/users/${member}/role`, { role: "MEMBER" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?ok=user-role-changed",
    );
    expect((await repo.users.get(member))!.role).toBe("MEMBER");
  });
  test("create user / discord id / own password codes", async () => {
    expect(
      (await post("/api/users", { name: "X", email: "member@t.test", password: PW }, { cookie: adminCookie })).loc,
    ).toBe("/dashboard/team?err=email-taken");
    const created = await post(
      "/api/users",
      { name: "Tmp", email: "tmp@t.test", password: PW },
      { cookie: adminCookie },
    );
    const tmpUser = (await repo.users.byEmail("tmp@t.test"))!;
    expect(created.loc).toBe(`/dashboard/team?baru=${tmpUser.id}&ok=user-created`);
    expect((await post(`/api/users/${member}/discord`, { discordId: "abc" }, { cookie: memberCookie })).loc).toBe(
      "/dashboard/team?err=discord-id-invalid",
    );
    expect(
      (await post(`/api/users/${member}/discord`, { discordId: "123456789012345678" }, { cookie: memberCookie })).loc,
    ).toBe("/dashboard/team?ok=discord-id-saved");
    expect((await post(`/api/users/${member}/discord`, { discordId: "" }, { cookie: memberCookie })).loc).toBe(
      "/dashboard/team?ok=discord-id-cleared",
    );
    expect((await post(`/api/users/${admin}/discord`, { discordId: "" }, { cookie: memberCookie })).loc).toBe(
      "/dashboard?err=admin-only-other-user",
    );
    expect(
      (await post("/api/account/password", { current: "nope", next: "whatever123" }, { cookie: memberCookie })).loc,
    ).toBe("/dashboard/team?err=password-wrong");
    expect(
      (await post("/api/account/password", { current: "new-password-456", next: "short" }, { cookie: memberCookie }))
        .loc,
    ).toBe("/dashboard/team?err=password-short");
  });
  test("delete user: unchanged effect (unassigns work), self refused", async () => {
    expect((await post(`/api/users/${admin}/delete`, {}, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?err=user-delete-self",
    );
    const tmp = (await repo.users.byEmail("tmp@t.test"))!;
    const tid = await repo.tasks.create({
      projectId: ids.G,
      title: "tmp-del",
      description: "",
      status: "TODO",
      priority: "LOW",
      dueDate: null,
      assigneeId: tmp.id,
    });
    expect((await post(`/api/users/${tmp.id}/delete`, {}, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?ok=user-deleted",
    );
    expect((await repo.tasks.get(tid))!.assigneeId).toBe(null);
    await repo.tasks.remove(tid);
  });
});

/* ---------------- 10. Discord test ---------------- */
describe("Discord test endpoint", () => {
  let start = 0;
  const calls = {
    get length() {
      return net.calls.length - start;
    },
    at: (i: number) => net.calls.slice(start).at(i)?.url,
  };
  let fail = false;
  beforeAll(() => {
    start = net.calls.length;
    net.respond = () => (fail ? new Response("Unknown Webhook", { status: 404 }) : new Response("{}", { status: 200 }));
  });
  afterAll(() => net.reset());
  const SAVED = "https://discord.com/api/webhooks/111/saved-token";
  const TYPED = "https://discord.com/api/webhooks/222/typed-token";
  test("nothing saved & nothing typed → webhook-missing", async () => {
    if (process.env.DISCORD_WEBHOOK_URL) return;
    expect((await post("/api/settings/discord/test", {}, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?err=webhook-missing",
    );
  });
  test("typed invalid → webhook-invalid (same rule as save)", async () => {
    expect(
      (await post("/api/settings/discord/test", { webhookUrl: "https://evil.test/hook" }, { cookie: adminCookie })).loc,
    ).toBe("/dashboard/team?err=webhook-invalid");
    expect(
      (await post("/api/settings/discord", { webhookUrl: "https://evil.test/hook" }, { cookie: adminCookie })).loc,
    ).toBe("/dashboard/team?err=webhook-invalid");
    expect(calls.length).toBe(0);
  });
  test("typed valid → tests the typed URL; empty → saved URL", async () => {
    expect(
      (await post("/api/settings/discord", { webhookUrl: SAVED, enabled: "on" }, { cookie: adminCookie })).loc,
    ).toBe("/dashboard/team?ok=discord-saved");
    expect((await post("/api/settings/discord/test", { webhookUrl: TYPED }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?ok=discord-test-sent",
    );
    expect(calls.at(-1)).toStartWith(TYPED);
    expect((await post("/api/settings/discord/test", { webhookUrl: "" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?ok=discord-test-sent",
    );
    expect(calls.at(-1)).toStartWith(SAVED);
    expect((await post("/api/settings/discord/test", {}, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?ok=discord-test-sent",
    );
    expect(calls.at(-1)).toStartWith(SAVED);
  });
  test("failure → fixed code in URL, detail only in JSON", async () => {
    fail = true;
    const r = await post("/api/settings/discord/test", { webhookUrl: TYPED }, { cookie: adminCookie });
    expect(r.loc).toBe("/dashboard/team?err=discord-test-failed");
    const j = await post("/api/settings/discord/test", { webhookUrl: TYPED }, { cookie: adminCookie, json: true });
    expect(j.body).toMatchObject({ ok: false, code: "discord-test-failed", error: M.ERR["discord-test-failed"] });
    expect(j.body.detail).toContain("Discord 404");
    fail = false;
  });
  test("clear webhook", async () => {
    expect((await post("/api/settings/discord", { webhookUrl: "" }, { cookie: adminCookie })).loc).toBe(
      "/dashboard/team?ok=discord-cleared",
    );
  });
});

/* ---------------- other ok codes ---------------- */
describe("project ok codes", () => {
  test("create / save / delete", async () => {
    const c = await post("/api/projects", { name: "Tmp P", client: "K" }, { cookie: adminCookie });
    expect(c.loc).toMatch(/^\/dashboard\/projects\/[\w-]+\?ok=project-created$/);
    const id = q(c.loc).pathname.split("/").pop()!;
    expect(
      (
        await post(
          `/api/projects/${id}`,
          { name: "Tmp P2", client: "K", _back: `/dashboard/projects/${id}` },
          { cookie: adminCookie },
        )
      ).loc,
    ).toBe(`/dashboard/projects/${id}?ok=project-saved`);
    expect((await post(`/api/projects/${id}/delete`, {}, { cookie: adminCookie })).loc).toBe(
      "/dashboard/projects?ok=project-deleted",
    );
  });
  test("inquiry delete", async () => {
    const list = (await get("/api/inquiries", { cookie: adminCookie })).body.items;
    const id = list.find((x: any) => x.name === "Web2").id;
    expect((await post(`/api/inquiries/${id}/delete`, {}, { cookie: adminCookie })).loc).toBe(
      "/dashboard/inbox?ok=inquiry-deleted",
    );
  });
});

/* ================= audit 2 — fix A (functional) ================= */

/* ================= audit 2 — fix A (functional) ================= */

describe("audit2: shared helpers", () => {
  test("safeNext only allows /dashboard paths", () => {
    expect(F.safeNext("/dashboard")).toBe("/dashboard");
    expect(F.safeNext("/dashboard/tasks?filter=all#task-x1")).toBe("/dashboard/tasks?filter=all#task-x1");
    expect(F.safeNext("/dashboard/tasks#a b")).toBe("/dashboard/tasks");
    for (const bad of [
      null,
      "",
      "//evil.test",
      "https://evil.test/dashboard",
      "/login",
      "/dashboardx",
      "/dashboard/../login",
      "/\\evil",
      "dashboard",
    ])
      expect(F.safeNext(bad as any)).toBe(null);
  });
  test("slugify cuts on a word boundary and never ends in a hyphen", () => {
    const s = F.slugify("Proyek dengan nama yang sangat panjang sekali untuk menguji pemotongan teks", 30);
    expect(s.length).toBeLessThanOrEqual(30);
    expect(s.endsWith("-")).toBe(false);
    expect("proyek-dengan-nama-yang-sangat-panjang-sekali".startsWith(s)).toBe(true);
    expect(["-", undefined]).toContain("proyek-dengan-nama-yang-sangat-panjang"[s.length]);
    expect(F.slugify("  Halo, Dunia!  ")).toBe("halo-dunia");
  });
  test("cutText adds an ellipsis on a word boundary", () => {
    expect(F.cutText("pendek", 200)).toBe("pendek");
    const t = F.cutText("satu dua tiga empat lima enam tujuh delapan", 20);
    expect(t.endsWith("…")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(20);
    expect("satu dua tiga empat lima".startsWith(t.slice(0, -1))).toBe(true);
    expect(F.cutText("Kalimat pertama selesai. Kalimat kedua yang panjang sekali", 36)).toBe(
      "Kalimat pertama selesai.",
    );
  });
  test("parseRupiah accepts thousand dots, rejects decimals", () => {
    expect(F.parseRupiah("")).toBe(null);
    expect(F.parseRupiah("1500000")).toBe(1500000);
    expect(F.parseRupiah("1.500.000")).toBe(1500000);
    expect(F.parseRupiah("Rp 2.000.000")).toBe(2000000);
    for (const bad of ["1,5", "1.500.000,50", "1.5 juta", "15.00", "abc", "-5"])
      expect(F.parseRupiah(bad)).toBe("invalid");
  });
  test("new codes have fixed messages", () => {
    for (const k of [
      "session-expired",
      "session-expired-draft",
      "admin-only-delete",
      "stale",
      "status-invalid",
      "project-dates",
      "budget-invalid",
      "pf-slug-taken",
      "pf-year-invalid",
      "pf-sort-invalid",
      "pf-image-invalid",
      "pf-live-invalid",
      "task-too-many",
      "inquiry-not-found",
    ])
      expect(typeof (M.ERR as Record<string, string>)[k]).toBe("string");
    for (const k of [
      "portfolio-exists",
      "tasks-created",
      "pf-featured-over",
      "inquiry-status-won",
      "inquiry-status-lost",
      "project-status-done",
      "project-created-from-inquiry",
    ])
      expect(typeof (M.OK as Record<string, string>)[k]).toBe("string");
  });
});

describe("audit2: session, cache, login", () => {
  test("H2: authenticated API responses are no-store", async () => {
    const res = await raw("/api/dashboard", { headers: { accept: "application/json", cookie: adminCookie } });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  test("C1: expired session on a form POST goes to login with next and the draft code", async () => {
    const r = await post(
      `/api/projects/${ids.G}`,
      { name: "x", client: "y", _back: `/dashboard/projects/${ids.G}#edit` },
      { cookie: "esta_session=expired-or-bogus" },
    );
    const u = q(r.loc);
    expect(u.pathname).toBe("/login");
    expect(u.searchParams.get("next")).toBe(`/dashboard/projects/${ids.G}#edit`);
    expect(u.searchParams.get("err")).toBe("session-expired-draft");
    expect((await repo.projects.get(ids.G))!.name).toBe("G healthy");
    const g = await get("/api/dashboard", { cookie: "esta_session=expired-or-bogus" });
    expect(g.status).toBe(401);
    expect(g.body.code).toBe("session-expired");
  });
  test("login honours a safe next, ignores an unsafe one", async () => {
    const ok = await post("/api/auth/login", {
      email: "admin@t.test",
      password: PW,
      next: "/dashboard/tasks?filter=all",
    });
    expect(ok.loc).toBe("/dashboard/tasks?filter=all");
    const evil = await post("/api/auth/login", { email: "admin@t.test", password: PW, next: "//evil.test" });
    expect(evil.loc).toBe("/dashboard");
  });
  test("rate limit is keyed on ip+email, with a per-IP ceiling", async () => {
    for (let i = 0; i < 10; i++) expect(await loginAt("10.0.0.1", "rl@t.test", "x")).toBe("login-failed");
    expect(await loginAt("10.0.0.1", "rl@t.test", "x")).toBe("login-blocked");
    expect(await loginAt("10.0.0.1", "other@t.test", "x")).toBe("login-failed"); // colleague behind the same NAT
    expect(await loginAt("10.0.0.2", "rl@t.test", "x")).toBe("login-failed");
    for (let i = 0; i < 50; i++) await loginAt("10.0.0.3", `spray${i}@t.test`, "x");
    expect(await loginAt("10.0.0.3", "fresh@t.test", "x")).toBe("login-blocked");
  }, 30000);
});

describe("audit2: optimistic concurrency (C2)", () => {
  test("project edit: stale version refused, current version saves", async () => {
    const p = (await repo.projects.get(ids.G))!;
    const base = {
      name: "G healthy",
      client: "Klien",
      status: "REVIEW",
      dueDate: p.dueDate ?? "",
      _back: `/dashboard/projects/${ids.G}#edit`,
    };
    const stale = await post(
      `/api/projects/${ids.G}`,
      { ...base, name: "G other tab", version: "2000-01-01T00:00:00.000Z" },
      { cookie: adminCookie },
    );
    expect(stale.loc).toBe(`/dashboard/projects/${ids.G}?err=stale#edit`);
    expect((await repo.projects.get(ids.G))!.name).toBe("G healthy");
    const fresh = await post(`/api/projects/${ids.G}`, { ...base, version: p.updatedAt }, { cookie: adminCookie });
    expect(okOf(fresh.loc)).toBe("project-saved");
    // adding a task does not bump the project version (an open edit form stays valid)
    const v = (await repo.projects.get(ids.G))!.updatedAt;
    const t = await post("/api/tasks", { projectId: ids.G, title: "ver tmp" }, { cookie: adminCookie, json: true });
    expect((await repo.projects.get(ids.G))!.updatedAt).toBe(v);
    await repo.tasks.remove(t.body.data?.id ?? t.body.id);
  });
  test("task + portfolio edit: stale version refused", async () => {
    const s = await post(
      `/api/tasks/${ids.g2}`,
      { title: "g2 renamed", version: "old", _back: `/dashboard/projects/${ids.G}#task-${ids.g2}` },
      { cookie: adminCookie },
    );
    expect(s.loc).toBe(`/dashboard/projects/${ids.G}?err=stale#task-${ids.g2}`);
    expect((await repo.tasks.get(ids.g2))!.title).toBe("g2 no date mine");
    const pf = await post(
      `/api/portfolio/${ids.pfE}`,
      { title: "E other", version: "old" },
      { cookie: adminCookie, referer: `${ORIGIN}/dashboard/portfolio/${ids.pfE}` },
    );
    expect(errOf(pf.loc)).toBe("stale");
    expect((await repo.portfolio.get(ids.pfE))!.title).toBe("E karya");
  });
  test("status-invalid instead of silently defaulting", async () => {
    const r = await post(
      `/api/tasks/${ids.g2}/status`,
      { status: "BOGUS", _back: "/dashboard/tasks" },
      { cookie: adminCookie },
    );
    expect(r.loc).toBe("/dashboard/tasks?err=status-invalid");
    expect((await repo.tasks.get(ids.g2))!.status).toBe("TODO");
  });
});

describe("audit2: permissions (F4) and missing records", () => {
  test("member cannot delete projects, portfolio items or inquiries", async () => {
    const pr = await post(
      `/api/projects/${ids.G}/delete`,
      { _back: `/dashboard/projects/${ids.G}` },
      { cookie: memberCookie },
    );
    expect(errOf(pr.loc)).toBe("admin-only-delete");
    expect(await repo.projects.get(ids.G)).not.toBe(null);
    const j = await post(`/api/projects/${ids.G}/delete`, {}, { cookie: memberCookie, json: true });
    expect(j.status).toBe(403);
    expect(errOf((await post(`/api/portfolio/${ids.pfE}/delete`, {}, { cookie: memberCookie })).loc)).toBe(
      "admin-only-delete",
    );
    expect(await repo.portfolio.get(ids.pfE)).not.toBe(null);
    const inq = (await get("/api/inquiries", { cookie: adminCookie })).body.items.find((x: any) => x.name === "Q1");
    expect(errOf((await post(`/api/inquiries/${inq.id}/delete`, {}, { cookie: memberCookie })).loc)).toBe(
      "admin-only-delete",
    );
    expect(await repo.inquiries.get(inq.id)).not.toBe(null);
  });
  test("member may still publish/feature (confirm is client-side)", async () => {
    const r = await post(
      `/api/portfolio/${ids.pfE}/toggle`,
      { field: "published", value: "on" },
      { cookie: memberCookie },
    );
    expect(okOf(r.loc)).toBe("pf-published");
    await post(`/api/portfolio/${ids.pfE}/toggle`, { field: "published", value: "off" }, { cookie: memberCookie });
  });
  test("actions on missing records return an error code", async () => {
    expect(
      errOf(
        (await post("/api/tasks/nope/status", { status: "DONE", _back: "/dashboard/tasks" }, { cookie: adminCookie }))
          .loc,
      ),
    ).toBe("task-not-found");
    expect(
      errOf((await post("/api/tasks/nope/delete", { _back: "/dashboard/tasks" }, { cookie: adminCookie })).loc),
    ).toBe("task-not-found");
    expect(errOf((await post("/api/projects/nope/delete", {}, { cookie: adminCookie })).loc)).toBe("project-not-found");
    expect(
      errOf((await post("/api/inquiries/nope/status", { status: "CONTACTED" }, { cookie: adminCookie })).loc),
    ).toBe("inquiry-not-found");
    expect(errOf((await post("/api/inquiries/nope/delete", {}, { cookie: adminCookie })).loc)).toBe(
      "inquiry-not-found",
    );
    expect((await get("/api/inquiries/nope", { cookie: adminCookie })).status).toBe(404);
  });
});

describe("audit2: validation instead of silent rewriting", () => {
  test("project: budget with thousand dots, decimals rejected, deadline before start", async () => {
    const c = await post(
      "/api/projects",
      { name: "Bud", client: "K", budget: "Rp 1.500.000" },
      { cookie: adminCookie },
    );
    const id = q(c.loc).pathname.split("/").pop()!;
    expect((await repo.projects.get(id))!.budget).toBe(1500000);
    expect(
      errOf((await post("/api/projects", { name: "Bud2", client: "K", budget: "1,5" }, { cookie: adminCookie })).loc),
    ).toBe("budget-invalid");
    expect(
      errOf(
        (
          await post(
            "/api/projects",
            { name: "Bud3", client: "K", startDate: day(0), dueDate: day(-1) },
            { cookie: adminCookie },
          )
        ).loc,
      ),
    ).toBe("project-dates");
    expect(
      errOf(
        (await post("/api/projects", { name: "Bud4", client: "K", dueDate: "2026-13-45" }, { cookie: adminCookie }))
          .loc,
      ),
    ).toBe("date-invalid");
    expect(errOf((await post("/api/projects", { name: "", client: "K" }, { cookie: adminCookie })).loc)).toBe(
      "project-name-required",
    );
    expect(errOf((await post("/api/projects", { name: "N", client: "" }, { cookie: adminCookie })).loc)).toBe(
      "project-client-required",
    );
    expect(errOf((await post("/api/projects", { name: "", client: "" }, { cookie: adminCookie })).loc)).toBe(
      "project-required",
    );
    await repo.projects.remove(id);
  });
  test("portfolio: slug taken gives an error and a suggestion; bad slug/year/sort/URLs give field codes", async () => {
    const a = await post("/api/portfolio", { title: "Slug A", slug: "slug-a" }, { cookie: adminCookie });
    const aId = q(a.loc).pathname.split("/").pop()!;
    const back = `${ORIGIN}/dashboard/portfolio/new`;
    const t = await post("/api/portfolio", { title: "Slug B", slug: "Slug A" }, { cookie: adminCookie, referer: back });
    expect(errOf(t.loc)).toBe("pf-slug-taken");
    expect(q(t.loc).searchParams.get("saran")).toBe("slug-a-2");
    expect(
      errOf((await post("/api/portfolio", { title: "X", slug: "!!!" }, { cookie: adminCookie, referer: back })).loc),
    ).toBe("pf-slug-invalid");
    expect(
      errOf((await post("/api/portfolio", { title: "X", year: "20x6" }, { cookie: adminCookie, referer: back })).loc),
    ).toBe("pf-year-invalid");
    expect(
      errOf(
        (await post("/api/portfolio", { title: "X", sortOrder: "1.5" }, { cookie: adminCookie, referer: back })).loc,
      ),
    ).toBe("pf-sort-invalid");
    expect(
      errOf(
        (
          await post(
            "/api/portfolio",
            { title: "X", imageUrl: "javascript:alert(1)" },
            { cookie: adminCookie, referer: back },
          )
        ).loc,
      ),
    ).toBe("pf-image-invalid");
    expect(
      errOf(
        (await post("/api/portfolio", { title: "X", liveUrl: "ftp://x.test" }, { cookie: adminCookie, referer: back }))
          .loc,
      ),
    ).toBe("pf-live-invalid");
    // relative cover path on this site stays allowed
    const rel = await post(
      "/api/portfolio",
      { title: "Rel", imageUrl: "/images/rel.jpg" },
      { cookie: adminCookie, referer: back },
    );
    expect(okOf(rel.loc)).toBe("pf-saved");
    await repo.portfolio.remove(q(rel.loc).pathname.split("/").pop()!);
    // the item keeps its own slug on re-save
    expect(
      okOf((await post(`/api/portfolio/${aId}`, { title: "Slug A", slug: "slug-a" }, { cookie: adminCookie })).loc),
    ).toBe("pf-saved");
    await repo.portfolio.remove(aId);
  });
  test("task: too many lines, invalid date, blank lines only", async () => {
    const many = Array.from({ length: C.MAX_TASK_LINES + 1 }, (_, i) => "line " + i).join("\n");
    expect(
      errOf(
        (
          await post(
            "/api/tasks",
            { projectId: ids.G, title: many, _back: `/dashboard/projects/${ids.G}#tambah` },
            { cookie: adminCookie },
          )
        ).loc,
      ),
    ).toBe("task-too-many");
    expect(
      errOf(
        (
          await post(
            "/api/tasks",
            { projectId: ids.G, title: "x", dueDate: "2026-02-31", _back: `/dashboard/projects/${ids.G}#tambah` },
            { cookie: adminCookie },
          )
        ).loc,
      ),
    ).toBe("task-date-invalid");
    expect(
      errOf(
        (
          await post(
            "/api/tasks",
            { projectId: ids.G, title: " \n \n", _back: `/dashboard/projects/${ids.G}#tambah` },
            { cookie: adminCookie },
          )
        ).loc,
      ),
    ).toBe("task-title-required");
  });
});

describe("audit2: workflow", () => {
  test("convert to portfolio is idempotent", async () => {
    const r = await post(`/api/projects/${ids.E}/portfolio`, {}, { cookie: adminCookie });
    expect(r.loc).toBe(`/dashboard/portfolio/${ids.pfE}?ok=portfolio-exists`);
    expect((await repo.portfolio.byProject(ids.E)).length).toBe(1);
  });
  test("quick project status route", async () => {
    const r = await post(
      `/api/projects/${ids.D}/status`,
      { status: "IN_PROGRESS", _back: `/dashboard/projects/${ids.D}` },
      { cookie: memberCookie },
    );
    expect(r.loc).toBe(`/dashboard/projects/${ids.D}?ok=project-status-in-progress`);
    expect((await repo.projects.get(ids.D))!.status).toBe("IN_PROGRESS");
    expect(errOf((await post(`/api/projects/${ids.D}/status`, { status: "BOGUS" }, { cookie: adminCookie })).loc)).toBe(
      "status-invalid",
    );
    await repo.projects.setStatus(ids.D, "PLANNING");
  });
  test("F2: project from inquiry marks it Jadi proyek (WON)", async () => {
    const inq = (await get("/api/inquiries", { cookie: adminCookie })).body.items.find((x: any) => x.name === "Q2");
    expect((await get(`/api/inquiries/${inq.id}`, { cookie: adminCookie })).body.name).toBe("Q2");
    const r = await post(
      "/api/projects",
      { name: "From Q2", client: "Q2", inquiryId: inq.id },
      { cookie: adminCookie },
    );
    expect(okOf(r.loc)).toBe("project-created-from-inquiry");
    expect((await repo.inquiries.get(inq.id))!.status).toBe("WON");
    await repo.projects.remove(q(r.loc).pathname.split("/").pop()!);
    // the split statuses are accepted
    expect(okOf((await post(`/api/inquiries/${inq.id}/status`, { status: "LOST" }, { cookie: adminCookie })).loc)).toBe(
      "inquiry-status-lost",
    );
    expect(okOf((await post(`/api/inquiries/${inq.id}/status`, { status: "NEW" }, { cookie: adminCookie })).loc)).toBe(
      "inquiry-status-new",
    );
  });
  test("task added from the Tugas page carries baru and proyek so the page can link it", async () => {
    const r = await post(
      "/api/tasks",
      { projectId: ids.G, title: "from board", assigneeId: member, _back: "/dashboard/tasks?filter=all" },
      { cookie: adminCookie },
    );
    const u = q(r.loc);
    expect(u.pathname).toBe("/dashboard/tasks");
    expect(u.searchParams.get("filter")).toBe("all");
    expect(u.searchParams.get("proyek")).toBe(ids.G);
    const id = u.searchParams.get("baru")!;
    expect((await repo.tasks.get(id))!.title).toBe("from board");
    await repo.tasks.remove(id);
  });
  test("F7: dashboard review queue + my due counts", async () => {
    await repo.tasks.setStatus(ids.g2, "REVIEW");
    const { body: d } = await get("/api/dashboard", { cookie: adminCookie });
    expect(d.reviewTasks).toBe(1);
    expect(d.review[0].id).toBe(ids.g2);
    expect(d.review[0].projectName).toBe("G healthy");
    expect(typeof d.oldestReviewAt).toBe("string");
    expect(d.myDueToday).toBe(2); // a2, g1
    expect(d.myDueThisWeek).toBe(3); // a2, g1, d1
    await repo.tasks.setStatus(ids.g2, "TODO");
  });
  test("featured above the Beranda limit is saved with a warning code", async () => {
    const extra: string[] = [];
    for (let i = 0; i < C.MAX_FEATURED; i++)
      extra.push(
        await repo.portfolio.create({
          title: "F" + i,
          slug: "f-" + i,
          client: "",
          category: "Website",
          year: 2026,
          summary: "",
          content: "",
          tags: "",
          coverColor: "#6d5efc",
          imageUrl: null,
          liveUrl: null,
          featured: true,
          published: true,
          sortOrder: i,
          projectId: null,
        }),
      );
    await post(`/api/portfolio/${ids.pfE}/toggle`, { field: "published", value: "on" }, { cookie: adminCookie });
    expect(
      okOf(
        (await post(`/api/portfolio/${ids.pfE}/toggle`, { field: "featured", value: "on" }, { cookie: adminCookie }))
          .loc,
      ),
    ).toBe("pf-featured-over");
    expect((await get(`/api/portfolio/${ids.pfE}`, { cookie: adminCookie })).body.featuredCount).toBe(
      C.MAX_FEATURED + 1,
    );
    await post(`/api/portfolio/${ids.pfE}/toggle`, { field: "published", value: "off" }, { cookie: adminCookie });
    for (const id of extra) await repo.portfolio.remove(id);
  });
});

describe("audit2: Discord notifications (mocked fetch, test DB only)", () => {
  const HOOK = "https://discord.com/api/webhooks/999/test-only-token";
  beforeAll(async () => {
    expect(
      (await post("/api/settings/discord", { webhookUrl: HOOK, enabled: "on" }, { cookie: adminCookie })).loc,
    ).toBe("/dashboard/team?ok=discord-saved");
  });
  afterAll(async () => {
    await post("/api/settings/discord", { webhookUrl: "" }, { cookie: adminCookie });
  });
  test("F9: multi-line paste creates one task per line and ONE Discord summary", async () => {
    const before = netCalls.length;
    const r = await post(
      "/api/tasks",
      {
        projectId: ids.G,
        title: "m1\r\n  m2  \n\nm3",
        assigneeId: member,
        priority: "HIGH",
        _back: `/dashboard/projects/${ids.G}#tambah`,
      },
      { cookie: adminCookie, json: true },
    );
    expect(r.body.ok).toBe(true);
    await tick();
    const created = (await repo.tasks.byProject(ids.G)).filter((t: any) => ["m1", "m2", "m3"].includes(t.title));
    expect(created.length).toBe(3);
    expect(created.every((t: any) => t.assigneeId === member && t.priority === "HIGH")).toBe(true);
    const sent = netCalls.slice(before);
    expect(sent.length).toBe(1);
    expect(sent[0]!.url).toStartWith(HOOK);
    expect(JSON.stringify(sent[0]!.body)).toContain("m2");
    const form = await post(
      "/api/tasks",
      { projectId: ids.G, title: "n1\nn2", _back: `/dashboard/projects/${ids.G}#tambah` },
      { cookie: adminCookie },
    );
    expect(form.loc).toBe(`/dashboard/projects/${ids.G}?ok=tasks-created#tambah`);
    for (const t of await repo.tasks.byProject(ids.G))
      if (["m1", "m2", "m3", "n1", "n2"].includes(t.title)) await repo.tasks.remove(t.id);
  });
  test("single task notification links to the task anchor", async () => {
    const before = netCalls.length;
    const r = await post(
      "/api/tasks",
      { projectId: ids.G, title: "single", assigneeId: member },
      { cookie: adminCookie, json: true },
    );
    await tick();
    const sent = netCalls.slice(before);
    expect(sent.length).toBe(1);
    const id = r.body.data?.id ?? r.body.id;
    expect(JSON.stringify(sent[0]!.body)).toContain(`#task-${id}`);
    await repo.tasks.remove(id);
  });
  test("F8: a new public inquiry notifies the team (awaited before the response, hardening)", async () => {
    const before = netCalls.length;
    const r = await post("/api/public/inquiries", {
      name: "Notif Sender",
      email: "n@x.test",
      company: "PT N",
      service: "Website",
      message: "halo **tim**",
    });
    expect(r.loc).toBe("/contact?terkirim=1&ok=inquiry-sent");
    // no tick(): the send happened before the response (serverless instances may freeze right after it)
    const sent = netCalls.slice(before);
    expect(sent.length).toBe(1);
    const body = JSON.stringify(sent[0]!.body);
    expect(body).toContain("Notif Sender");
    expect(body).toContain("/dashboard/inbox?status=NEW&inq=");
    expect(sent[0]!.body.allowed_mentions).toEqual({ parse: [], users: [] });
  });
  test("a failing webhook never breaks the public form", async () => {
    net.respond = () => {
      throw new Error("network down");
    };
    const r = await post("/api/public/inquiries", { name: "Notif Fail", email: "n@x.test", message: "m" });
    expect(r.loc).toBe("/contact?terkirim=1&ok=inquiry-sent");
    await tick();
    net.reset();
  });
});
