// Optimasi + pengamanan (audit perf/keamanan): batas kiriman, body, Sec-Fetch-Site, hash argon2, Inbox per
// halaman, jumlah query per endpoint, bentuk respons yang ramping, header keamanan + kompresi, util kecil.
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import "./guard";
import { handleApi, INQUIRY_LIMIT_GLOBAL, INQUIRY_LIMIT_PER_IP, MAX_BODY_BYTES } from "../../server/api";
import { createFetch } from "../../server/app";
import { hashPassword, login as authLogin, needsRehash, sessionDays } from "../../server/auth";
import { compress, pickEncoding } from "../../server/compress";
import { client } from "../../server/db";
import { envOf } from "../../server/env";
import { FALLBACK_HTML_CSP, HSTS, NON_HTML_CSP, secure } from "../../server/headers";
import { errInfo, redact } from "../../server/log";
import * as repo from "../../server/repo";
import { INBOX_PAGE_SIZE, inquiriesQuery, queryOf, readQuery, tasksQuery } from "../../shared/schemas/query";
import { fmtLongDate, today } from "../../shared/format";
import type { User } from "../../shared/types";
import { errOf, freshTeam, get, newProject, ORIGIN, post, PW, raw } from "./helpers";

const NOW = new Date("2026-11-26T18:30:00.000Z");
let t: Awaited<ReturnType<typeof freshTeam>>;
let adminUser: User;
beforeAll(async () => {
  setSystemTime(NOW);
  t = await freshTeam();
  adminUser = (await repo.users.get(t.admin))!;
});
afterAll(() => setSystemTime());

const inquiry = (name: string) => ({ name, email: "test-perf-claude@x.test", message: "TEST perf Claude" });

/* ---------------- form Kontak: batas kiriman ---------------- */
describe("public inquiry rate limit", () => {
  test(`${INQUIRY_LIMIT_PER_IP} per IP per 10 min, then 429 (JSON) / friendly flash (form), nothing stored`, async () => {
    const before = (await repo.inquiries.list()).length;
    for (let i = 0; i < INQUIRY_LIMIT_PER_IP; i++) {
      const r = await post("/api/public/inquiries", inquiry(`TEST perf Claude ${i}`), { json: true, ip: "10.0.0.1" });
      expect(r.body).toMatchObject({ ok: true, code: "inquiry-sent" });
    }
    const j = await post("/api/public/inquiries", inquiry("TEST perf Claude over"), { json: true, ip: "10.0.0.1" });
    expect(j.status).toBe(429);
    expect(j.body).toMatchObject({ ok: false, code: "inquiry-rate-limited", redirect: "/contact" });
    const f = await post("/api/public/inquiries", inquiry("TEST perf Claude over"), { ip: "10.0.0.1" });
    expect(f.status).toBe(303);
    expect(f.loc).toBe("/contact?err=inquiry-rate-limited");
    // honeypot tetap dijawab "terkirim" (tidak disimpan, tidak dihitung)
    const hp = await post("/api/public/inquiries", { ...inquiry("bot"), website: "x" }, { ip: "10.0.0.1" });
    expect(hp.loc).toBe("/contact?terkirim=1&ok=inquiry-sent");
    // IP lain tidak terpengaruh
    const other = await post("/api/public/inquiries", inquiry("TEST perf Claude other"), {
      json: true,
      ip: "10.0.0.2",
    });
    expect(other.body.code).toBe("inquiry-sent");
    expect((await repo.inquiries.list()).length).toBe(before + INQUIRY_LIMIT_PER_IP + 1);
    // jendela 10 menit lewat → boleh lagi
    setSystemTime(new Date(NOW.getTime() + 10 * 60_000 + 1000));
    const later = await post("/api/public/inquiries", inquiry("TEST perf Claude later"), {
      json: true,
      ip: "10.0.0.1",
    });
    expect(later.body.code).toBe("inquiry-sent");
    setSystemTime(NOW);
  });
  test(`invalid submissions are not counted; global cap ${INQUIRY_LIMIT_GLOBAL} per hour across IPs`, async () => {
    for (let i = 0; i < 8; i++) {
      const r = await post("/api/public/inquiries", { name: "", email: "", message: "" }, { ip: "10.1.0.1" });
      expect(errOf(r.loc)).toBe("inquiry-required");
    }
    expect(
      (await post("/api/public/inquiries", inquiry("TEST perf Claude v"), { json: true, ip: "10.1.0.1" })).body.code,
    ).toBe("inquiry-sent");
    let sent = 1;
    for (let ip = 0; sent < INQUIRY_LIMIT_GLOBAL; ip++) {
      for (let i = 0; i < INQUIRY_LIMIT_PER_IP && sent < INQUIRY_LIMIT_GLOBAL; i++, sent++) {
        const r = await post("/api/public/inquiries", inquiry("TEST perf Claude g"), {
          json: true,
          ip: `10.2.${ip}.1`,
        });
        expect(r.body.code).toBe("inquiry-sent");
      }
    }
    const r = await post("/api/public/inquiries", inquiry("TEST perf Claude g"), { json: true, ip: "10.9.9.9" });
    expect(r.body.code).toBe("inquiry-rate-limited");
  });
});

/* ---------------- password lama: batas percobaan ---------------- */
describe("current-password attempt limit", () => {
  test("10 wrong current passwords → password-blocked (even with the right one), resets after 15 min", async () => {
    const cookie = t.memberCookie;
    for (let i = 0; i < 10; i++) {
      const r = await post("/api/account/password", { current: "wrong-" + i, next: "new-password-1" }, { cookie });
      expect(errOf(r.loc)).toBe("password-wrong");
    }
    const blocked = await post(
      "/api/account/password",
      { current: PW, next: "new-password-1" },
      { cookie, json: true },
    );
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("password-blocked");
    setSystemTime(new Date(NOW.getTime() + 15 * 60_000 + 1000));
    // urutan kode tetap: password lama dicek sebelum panjang password baru
    const short = await post("/api/account/password", { current: PW, next: "short" }, { cookie });
    expect(errOf(short.loc)).toBe("password-short");
    setSystemTime(NOW);
  });
});

/* ---------------- body, origin ---------------- */
describe("request body cap and Sec-Fetch-Site", () => {
  const big = "x".repeat(MAX_BODY_BYTES + 10);
  test("declared Content-Length above the cap → 413 too-long, body never parsed", async () => {
    const r = await raw("/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "content-length": String(big.length),
        accept: "application/json",
        cookie: t.adminCookie,
      },
      body: "title=" + big,
    });
    expect(r.status).toBe(413);
    expect((await r.json()).code).toBe("too-long");
  });
  test("streamed body (no Content-Length) above the cap → 413 too-long", async () => {
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < 20; i++) c.enqueue(new TextEncoder().encode("a".repeat(64 * 1024)));
        c.close();
      },
    });
    const r = await handleApi(
      new Request(ORIGIN + "/api/tasks", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          cookie: t.adminCookie,
        },
        body: stream,
        duplex: "half",
      } as RequestInit),
    );
    expect(r.status).toBe(413);
  });
  test("unauthenticated POST: only a small part of the body is read for _back", async () => {
    const r = await post("/api/projects", { name: "x", _back: "/dashboard/projects" });
    expect(r.loc).toBe("/login?next=%2Fdashboard%2Fprojects&err=login-required");
    const huge = await raw("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "content-length": String(big.length) },
      body: "_back=%2Fdashboard%2Fprojects&x=" + big,
    });
    expect(huge.status).toBe(303);
    expect(huge.headers.get("location")).toBe("/login?next=%2Fdashboard&err=login-required");
  });
  test("Sec-Fetch-Site cross-site / same-site → origin-denied; same-origin / none allowed", async () => {
    const send = (site: string) =>
      raw("/api/auth/logout", { method: "POST", headers: { "sec-fetch-site": site, accept: "application/json" } });
    expect((await send("cross-site")).status).toBe(403);
    expect((await (await send("same-site")).json()).code).toBe("origin-denied");
    expect((await send("same-origin")).status).toBe(200);
    expect((await send("none")).status).toBe(200);
    // GET tidak dicek (tautan dari situs lain tetap bisa dibuka)
    expect((await raw("/api/health", { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(200);
  });
});

/* ---------------- argon2 ---------------- */
describe("password hashing", () => {
  test("old parameters are rehashed on successful login; wrong password keeps the hash", async () => {
    const oldHash = await Bun.password.hash(PW, { algorithm: "argon2id", memoryCost: 4096, timeCost: 3 });
    expect(needsRehash(oldHash)).toBe(true);
    const id = await repo.users.create({
      name: "Rehash T",
      email: "rehash@t.test",
      role: "MEMBER",
      passwordHash: oldHash,
    });
    expect(await authLogin("rehash@t.test", "wrong-password")).toBe(null);
    expect(await repo.users.passwordHash(id)).toBe(oldHash);
    expect((await authLogin("rehash@t.test", PW))?.id).toBe(id);
    const fresh = (await repo.users.passwordHash(id))!;
    expect(fresh).not.toBe(oldHash);
    expect(needsRehash(fresh)).toBe(false);
    expect(await Bun.password.verify(PW, fresh)).toBe(true);
    expect(needsRehash(await Bun.password.hash(PW, "bcrypt"))).toBe(true);
    await repo.users.remove(id);
  });
  test("unknown email: still runs one verify (timing), returns null", async () => {
    expect(await authLogin("nobody@t.test", PW)).toBe(null);
    expect(needsRehash(await hashPassword("x"))).toBe(false);
  });
});

/* ---------------- Inbox per halaman ---------------- */
describe("inbox pagination", () => {
  const made: string[] = [];
  beforeAll(async () => {
    for (const q of await repo.inquiries.list()) await repo.inquiries.remove(q.id);
    for (let i = 0; i < 60; i++) {
      setSystemTime(new Date(NOW.getTime() - (60 - i) * 60_000));
      const id = await repo.inquiries.create({
        name: `TEST perf Claude ${String(i).padStart(2, "0")}`,
        email: "t@x.test",
        company: "",
        service: "",
        budget: "",
        message: "m",
      });
      if (i % 3 === 0) await repo.inquiries.setStatus(id, "CONTACTED");
      made.push(id);
    }
    setSystemTime(NOW);
  });
  afterAll(async () => {
    for (const id of made) await repo.inquiries.remove(id);
  });
  test(`${INBOX_PAGE_SIZE} per page, newest first, counts for every status, page clamped`, async () => {
    const p1 = (await get("/api/inquiries", { cookie: t.adminCookie })).body;
    expect(p1).toMatchObject({ total: 60, page: 1, pages: 3, pageSize: INBOX_PAGE_SIZE });
    expect(p1.items.length).toBe(25);
    expect(p1.items[0].name).toBe("TEST perf Claude 59");
    expect(p1.counts).toEqual({ NEW: 40, CONTACTED: 20 });
    const p3 = (await get("/api/inquiries?page=3", { cookie: t.adminCookie })).body;
    expect(p3.items.length).toBe(10);
    expect(p3.items.at(-1).name).toBe("TEST perf Claude 00");
    const over = (await get("/api/inquiries?page=99", { cookie: t.adminCookie })).body;
    expect(over.page).toBe(3);
    expect(over.items.map((x: any) => x.id)).toEqual(p3.items.map((x: any) => x.id));
    for (const bad of ["0", "-1", "abc", "1.5"]) {
      expect((await get(`/api/inquiries?page=${bad}`, { cookie: t.adminCookie })).body.page).toBe(1);
    }
  });
  test("status=NEW: oldest first; inq=<id> opens the page that contains it", async () => {
    const n = (await get("/api/inquiries?status=NEW", { cookie: t.adminCookie })).body;
    expect(n).toMatchObject({ total: 40, pages: 2 });
    expect(n.items[0].name).toBe("TEST perf Claude 01");
    const target = made[58]!; // NEW, near the end in NEW order (oldest first) → page 2
    const f = (await get(`/api/inquiries?status=NEW&inq=${target}`, { cookie: t.adminCookie })).body;
    expect(f.page).toBe(2);
    expect(f.items.some((x: any) => x.id === target)).toBe(true);
    // explicit page wins over inq; unknown inq → page 1
    expect((await get(`/api/inquiries?status=NEW&inq=${target}&page=1`, { cookie: t.adminCookie })).body.page).toBe(1);
    expect((await get("/api/inquiries?status=NEW&inq=nope", { cookie: t.adminCookie })).body.page).toBe(1);
  });
  test("dashboard shows a message snippet only", async () => {
    const long = "x".repeat(2000);
    const id = await repo.inquiries.create({
      name: "TEST perf Claude long",
      email: "t@x.test",
      company: "",
      service: "",
      budget: "",
      message: long,
    });
    const d = (await get("/api/dashboard", { cookie: t.adminCookie })).body;
    const hit = d.inquiries.find((q: any) => q.id === id);
    expect(hit.message.length).toBe(300);
    expect(Object.keys(hit).sort()).toEqual(["company", "createdAt", "id", "message", "name"]);
    await repo.inquiries.remove(id);
  });
});

/* ---------------- jumlah round trip DB per endpoint ---------------- */
describe("queries per request (in-process page calls reuse the middleware user)", () => {
  let pid = "";
  let slug = "";
  let pfId = "";
  beforeAll(async () => {
    pid = await newProject("TEST perf Claude proyek");
    await repo.tasks.create({
      projectId: pid,
      title: "TEST perf Claude tugas",
      description: "d",
      status: "TODO",
      priority: "LOW",
      dueDate: null,
      assigneeId: t.admin,
    });
    slug = "test-perf-claude";
    pfId = await repo.portfolio.create({
      title: "TEST perf Claude karya",
      slug,
      client: "K",
      category: "Website",
      year: 2026,
      summary: "s",
      content: "isi panjang",
      tags: "",
      coverColor: "#123456",
      imageUrl: null,
      liveUrl: null,
      featured: true,
      published: true,
      sortOrder: 0,
      projectId: pid,
    });
  });
  afterAll(async () => {
    await repo.portfolio.remove(pfId);
    await repo.projects.remove(pid);
  });
  async function trips(path: string, user: User | null = adminUser) {
    let n = 0;
    const exec = client.execute.bind(client);
    const bat = client.batch.bind(client);
    client.execute = ((...a: Parameters<typeof exec>) => (n++, exec(...a))) as typeof exec;
    client.batch = ((...a: Parameters<typeof bat>) => (n++, bat(...a))) as typeof bat;
    try {
      const res = await handleApi(new Request(ORIGIN + path, { headers: { accept: "application/json" } }), "x", {
        user,
      });
      expect(res.status).toBe(200);
      return { n, body: (await res.json()) as any };
    } finally {
      client.execute = exec;
      client.batch = bat;
    }
  }
  test("every page endpoint = one batch; public endpoints never look up a session", async () => {
    for (const path of [
      "/api/dashboard",
      "/api/projects",
      `/api/projects/${pid}`,
      "/api/tasks",
      "/api/tasks?filter=all&due=week",
      "/api/portfolio",
      `/api/portfolio/${pfId}`,
      `/api/portfolio/${pfId}/pratinjau`,
      "/api/inquiries",
      "/api/team",
      "/api/nav",
      "/api/me",
    ]) {
      expect({ path, n: (await trips(path)).n }).toEqual({ path, n: path === "/api/me" ? 0 : 1 });
    }
    for (const path of ["/api/public/home", "/api/public/portfolio", `/api/public/portfolio/${slug}`, "/api/health"]) {
      expect({ path, n: (await trips(path, null)).n }).toEqual({ path, n: path === "/api/health" ? 0 : 1 });
    }
  });
  test("responses carry only the fields pages read", async () => {
    const tasks = (await trips("/api/tasks?filter=all")).body;
    const task = tasks.tasks.find((x: any) => x.title === "TEST perf Claude tugas");
    expect(task.createdAt).toBeUndefined();
    expect(task.assignee).toEqual({ id: t.admin, name: "Admin T" });
    expect(Object.keys(tasks.users[0]).sort()).toEqual(["id", "name"]);
    expect(tasks.projectOptions.find((p: any) => p.id === pid)).toEqual({ id: pid, name: "TEST perf Claude proyek" });
    const dash = (await trips("/api/dashboard")).body;
    expect(dash.myTasks.find((x: any) => x.title === "TEST perf Claude tugas").description).toBeUndefined();
    const ap = dash.active.find((p: any) => p.id === pid);
    expect(ap.description).toBeUndefined();
    expect(ap.budget).toBeUndefined();
    expect(ap.lead).toBeNull();
    const list = (await trips("/api/projects")).body.projects.find((p: any) => p.id === pid);
    expect(Object.keys(list).sort()).toEqual(
      [
        "client",
        "doneTasks",
        "dueDate",
        "hasPortfolio",
        "id",
        "lead",
        "name",
        "startDate",
        "status",
        "totalTasks",
        "type",
      ].sort(),
    );
    const detail = (await trips(`/api/projects/${pid}`)).body;
    expect(detail.portfolio).toEqual([{ id: pfId }]);
    expect(detail.project.tasks[0].projectName).toBeUndefined();
    const home = (await trips("/api/public/home", null)).body;
    expect(Object.keys(home.featured[0]).sort()).toEqual([
      "category",
      "client",
      "coverColor",
      "imageUrl",
      "slug",
      "title",
    ]);
    const pub = (await trips(`/api/public/portfolio/${slug}`, null)).body;
    expect(pub.item.content).toBe("isi panjang");
    expect(pub.item.id).toBeUndefined();
    expect(pub.item.published).toBeUndefined();
    expect(pub.others.every((o: any) => o.slug !== slug)).toBe(true);
    const rows = (await trips("/api/portfolio")).body;
    expect(rows[0].content).toBeUndefined();
    expect(rows[0].summary).toBeUndefined();
  });
  test("tasks page: deadline chip counts for the scope come from the same call", async () => {
    const all = (await trips("/api/tasks?filter=all")).body;
    const overdue = (await trips("/api/tasks?filter=all&due=overdue")).body;
    const week = (await trips("/api/tasks?filter=all&due=week")).body;
    expect(all.scopeCounts).toEqual({ overdue: overdue.tasks.length, week: week.tasks.length });
  });
});

/* ---------------- header keamanan, cache, kompresi ---------------- */
describe("security headers and compression", () => {
  const html = (h: Record<string, string> = {}) =>
    new Response("<!doctype html><p>hi</p>", { headers: { "content-type": "text/html", ...h } });
  test("JSON / redirects get a locked-down CSP; HTML keeps Astro's CSP plus frame-ancestors", () => {
    const u = new URL("http://localhost/api/x");
    const j = secure(new Request(u), u, Response.json({ ok: true }));
    expect(j.headers.get("content-security-policy")).toBe(NON_HTML_CSP);
    expect(j.headers.get("x-frame-options")).toBe("DENY");
    expect(j.headers.get("x-content-type-options")).toBe("nosniff");
    expect(j.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(j.headers.get("strict-transport-security")).toBe(null);
    const redirect = secure(new Request(u), u, Response.redirect("http://localhost/login", 303));
    expect(redirect.headers.get("content-security-policy")).toBe(NON_HTML_CSP);
    const p = new URL("http://localhost/dashboard");
    const a = secure(new Request(p), p, html({ "content-security-policy": "default-src 'self'" }));
    expect(a.headers.get("content-security-policy")).toBe("default-src 'self'; frame-ancestors 'none'");
    expect(secure(new Request(p), p, html()).headers.get("content-security-policy")).toBe(FALLBACK_HTML_CSP);
    const s = new URL("https://esta.test/");
    expect(secure(new Request(s), s, html()).headers.get("strict-transport-security")).toBe(HSTS);
  });
  test("public pages get a short CDN cache; dashboard, login, cookies and errors never do", () => {
    const at = (path: string, res = html()) => {
      const u = new URL("http://localhost" + path);
      return secure(new Request(u), u, res).headers;
    };
    for (const path of ["/", "/portfolio", "/portfolio/karya-a", "/contact"]) {
      expect(at(path).get("cdn-cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=60");
    }
    expect(at("/dashboard").get("cdn-cache-control")).toBe(null);
    expect(at("/login").get("cdn-cache-control")).toBe(null);
    expect(at("/", html({ "set-cookie": "a=1" })).get("cdn-cache-control")).toBe(null);
    expect(at("/", html({ "cache-control": "no-store" })).get("cache-control")).toBe("no-store");
    expect(
      at("/portfolio/x", new Response("x", { status: 404, headers: { "content-type": "text/html" } })).get(
        "cdn-cache-control",
      ),
    ).toBe(null);
  });
  test("Accept-Encoding: br > gzip, q=0 refused, small bodies and Vercel untouched", async () => {
    expect(pickEncoding("gzip, deflate, br")).toBe("br");
    expect(pickEncoding("gzip, br;q=0")).toBe("gzip");
    expect(pickEncoding("identity")).toBe(null);
    expect(pickEncoding(null)).toBe(null);
    const body = JSON.stringify({ rows: Array.from({ length: 200 }, (_, i) => ({ i, name: "baris" })) });
    const req = (enc: string) => new Request("http://localhost/api/x", { headers: { "accept-encoding": enc } });
    const br = await compress(req("br"), new Response(body, { headers: { "content-type": "application/json" } }));
    expect(br.headers.get("content-encoding")).toBe("br");
    expect(br.headers.get("vary")).toContain("Accept-Encoding");
    const gz = await compress(req("gzip"), new Response(body, { headers: { "content-type": "application/json" } }));
    expect(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await gz.arrayBuffer())))).toBe(body);
    const small = await compress(req("br"), new Response("{}", { headers: { "content-type": "application/json" } }));
    expect(small.headers.get("content-encoding")).toBe(null);
    const img = await compress(req("br"), new Response(body, { headers: { "content-type": "image/png" } }));
    expect(img.headers.get("content-encoding")).toBe(null);
    process.env.VERCEL = "1";
    try {
      const v = await compress(req("br"), new Response(body, { headers: { "content-type": "application/json" } }));
      expect(v.headers.get("content-encoding")).toBe(null);
    } finally {
      delete process.env.VERCEL;
    }
  });
  test("createFetch: every response gets the headers; static files get ETag / 304", async () => {
    const app = createFetch(async () => html());
    const r = await app(new Request("http://localhost/api/health"));
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    const p = await app(new Request("http://localhost/"));
    expect(p.headers.get("content-security-policy")).toBe(FALLBACK_HTML_CSP);
  });
});

/* ---------------- util ---------------- */
describe("small utilities", () => {
  test("log redaction hides Discord webhook tokens", () => {
    const url = "https://discord.com/api/webhooks/123456/SECRET-token_x?wait=true";
    expect(redact(`fetch failed ${url}`)).toBe("fetch failed https://discord.com/api/webhooks/123456/***?wait=true");
    const e = Object.assign(new Error(`boom ${url}`), { path: url });
    expect(errInfo(e)).not.toContain("SECRET");
  });
  test("today() is cached per minute but still follows the clock across midnight WIB", () => {
    setSystemTime(new Date("2026-11-26T16:59:59.000Z")); // 23:59:59 WIB
    expect(today()).toBe("2026-11-26");
    setSystemTime(new Date("2026-11-26T17:00:00.000Z")); // 00:00 WIB
    expect(today()).toBe("2026-11-27");
    expect(fmtLongDate(new Date("2026-11-26T17:00:00.000Z"))).toContain("27");
    setSystemTime(NOW);
  });
  test("query schemas: first value wins, unknown values ignored, filter/done mapped", () => {
    const sp = new URLSearchParams("status=NEW&status=WON&page=2&inq=abc");
    expect(queryOf(sp)).toEqual({ status: "NEW", page: "2", inq: "abc" });
    expect(readQuery(inquiriesQuery, sp)).toEqual({ status: "NEW", page: 2, inq: "abc" });
    expect(readQuery(inquiriesQuery, new URLSearchParams("status=x&page=0&inq=a%20b"))).toEqual({
      status: "",
      page: 1,
      inq: "",
    });
    expect(readQuery(tasksQuery, new URLSearchParams("filter=all&done=1&due=foo&assignee=none&status=DONE"))).toEqual({
      all: true,
      showDone: true,
      due: "",
      assignee: "none",
      status: "",
    });
  });
  test("env: defaults and bad values never crash", () => {
    expect(envOf("PORT", {})).toBe(3000);
    expect(envOf("PORT", { PORT: "abc" })).toBe(3000);
    expect(envOf("PORT", { PORT: "8080" })).toBe(8080);
    expect(envOf("DATABASE_PATH", {})).toBe("data/esta.sqlite");
    expect(envOf("INSECURE_COOKIE", { INSECURE_COOKIE: "1" })).toBe(true);
    for (const [raw, days] of [
      ["", 7],
      ["abc", 7],
      ["0", 7],
      ["-1", 7],
      ["400", 7],
      ["30", 30],
      ["0.5", 0.5],
    ] as const) {
      expect(sessionDays(raw)).toBe(days);
    }
  });
});
