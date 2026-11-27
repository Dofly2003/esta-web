// Validasi input server: panjang maksimum, link, warna sampul, tahun/urutan, Discord ID, path & body rusak.
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import "./guard";
import * as repo from "../../server/repo";
import { client } from "../../server/db";
import { coverColorOr, DEFAULT_COVER, isHexColor, MAX_LEN, MAX_TASK_LINES } from "../../shared/constants";
import { isLink } from "../../shared/format";
import { ERR } from "../../shared/messages";
import { errOf, freshTeam, get, idOf, newProject, okOf, ORIGIN, post, raw } from "./helpers";

let t: Awaited<ReturnType<typeof freshTeam>>;
let project = "";
beforeAll(async () => {
  setSystemTime(new Date("2026-11-26T18:30:00.000Z"));
  t = await freshTeam();
  project = await newProject("Validasi");
});
afterAll(() => setSystemTime());

const back = `${ORIGIN}/dashboard/portfolio/new`;
const pf = (fields: Record<string, string>) =>
  post("/api/portfolio", { title: "Karya V", ...fields }, { cookie: t.adminCookie, referer: back });

describe("routing robustness", () => {
  test("bad % escape in a path param → 404 not-found, not 500", async () => {
    for (const p of ["/api/projects/%E0%A4%A", "/api/inquiries/%", "/api/public/portfolio/%zz"]) {
      const g = await get(p, { cookie: t.adminCookie });
      expect(g.status).toBe(404);
      expect(g.body.code).toBe("not-found");
    }
    const r = await post(
      "/api/tasks/%E0%A4%A/status",
      { status: "DONE", _back: "/dashboard/tasks" },
      { cookie: t.adminCookie },
    );
    expect(r.loc).toBe("/dashboard/tasks?err=not-found");
  });
  test("a valid percent-encoded id still matches", async () => {
    const g = await get(`/api/projects/${encodeURIComponent(project)}`, { cookie: t.adminCookie });
    expect(g.status).toBe(200);
  });
  test("malformed multipart body → validation error, not 500", async () => {
    const res = await raw("/api/projects", {
      method: "POST",
      headers: { "content-type": "multipart/form-data", cookie: t.adminCookie, accept: "application/json" },
      body: "garbage",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("project-required");
  });
  test("unknown route → 404; origin check on POST", async () => {
    expect((await get("/api/nope")).status).toBe(404);
    const r = await post(
      "/api/projects",
      { name: "x", client: "y" },
      { cookie: t.adminCookie, origin: "https://evil.test", json: true },
    );
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("origin-denied");
  });
});

describe("max lengths (err=too-long, nothing saved)", () => {
  test("project name / client / description", async () => {
    const long = "n".repeat(MAX_LEN.projectName + 1);
    const r = await post(
      "/api/projects",
      { name: long, client: "K", _back: "/dashboard/projects#proyek-baru" },
      { cookie: t.adminCookie },
    );
    expect(r.loc).toBe("/dashboard/projects?err=too-long#proyek-baru");
    expect(
      errOf(
        (await post("/api/projects", { name: "N", client: "c".repeat(MAX_LEN.client + 1) }, { cookie: t.adminCookie }))
          .loc,
      ),
    ).toBe("too-long");
    expect(
      errOf(
        (
          await post(
            "/api/projects",
            { name: "N", client: "K", description: "d".repeat(MAX_LEN.description + 1) },
            { cookie: t.adminCookie },
          )
        ).loc,
      ),
    ).toBe("too-long");
    expect((await repo.projects.list()).length).toBe(1);
    // exactly at the limit is fine
    const ok = await post(
      "/api/projects",
      { name: "n".repeat(MAX_LEN.projectName), client: "K" },
      { cookie: t.adminCookie },
    );
    expect(okOf(ok.loc)).toBe("project-created");
    await repo.projects.remove(idOf(ok.loc));
    expect(ERR["too-long"]).toBeString();
  });
  test("task title: per line on create, whole title on edit", async () => {
    const backT = `/dashboard/projects/${project}#tambah`;
    expect(
      errOf(
        (
          await post(
            "/api/tasks",
            { projectId: project, title: "t".repeat(MAX_LEN.taskTitle + 1), _back: backT },
            { cookie: t.adminCookie },
          )
        ).loc,
      ),
    ).toBe("too-long");
    // many lines that are each within the limit are fine even if the whole text is long
    const lines = Array.from({ length: MAX_TASK_LINES }, (_, i) => `${i} ${"x".repeat(MAX_LEN.taskTitle - 4)}`).join(
      "\n",
    );
    const ok = await post(
      "/api/tasks",
      { projectId: project, title: lines, _back: backT },
      { cookie: t.adminCookie, json: true },
    );
    expect(ok.body.code).toBe("tasks-created");
    expect((await repo.tasks.byProject(project)).length).toBe(MAX_TASK_LINES);
    const id = ok.body.data.ids[0];
    const e = await post(
      `/api/tasks/${id}`,
      { title: "t".repeat(MAX_LEN.taskTitle + 1) },
      { cookie: t.adminCookie, json: true },
    );
    expect(e.status).toBe(400);
    expect(e.body.code).toBe("too-long");
    for (const x of await repo.tasks.byProject(project)) await repo.tasks.remove(x.id);
  });
  test("portfolio fields", async () => {
    expect(errOf((await pf({ title: "t".repeat(MAX_LEN.pfTitle + 1) })).loc)).toBe("too-long");
    expect(errOf((await pf({ summary: "s".repeat(MAX_LEN.pfSummary + 1) })).loc)).toBe("too-long");
    expect(errOf((await pf({ content: "c".repeat(MAX_LEN.pfContent + 1) })).loc)).toBe("too-long");
    expect(errOf((await pf({ tags: "g".repeat(MAX_LEN.pfTags + 1) })).loc)).toBe("too-long");
    expect(errOf((await pf({ imageUrl: "https://x.test/" + "a".repeat(MAX_LEN.url) })).loc)).toBe("too-long");
    expect((await repo.portfolio.list()).length).toBe(0);
  });
  test("user name / email", async () => {
    const base = { email: "long@t.test", password: "long-password-1" };
    expect(
      errOf(
        (await post("/api/users", { ...base, name: "u".repeat(MAX_LEN.userName + 1) }, { cookie: t.adminCookie })).loc,
      ),
    ).toBe("too-long");
    expect(
      errOf(
        (
          await post(
            "/api/users",
            { name: "U", email: `${"e".repeat(200)}@t.test`, password: "long-password-1" },
            { cookie: t.adminCookie },
          )
        ).loc,
      ),
    ).toBe("too-long");
    expect(
      errOf(
        (
          await post(
            "/api/users",
            { ...base, name: "U", password: "p".repeat(MAX_LEN.password + 1) },
            { cookie: t.adminCookie },
          )
        ).loc,
      ),
    ).toBe("too-long");
    expect(await repo.users.byEmail("long@t.test")).toBe(null);
  });
});

describe("links (isLink / portfolio URLs)", () => {
  test("isLink accepts http(s) and local paths, rejects protocol-relative and other schemes", () => {
    for (const ok of ["https://x.test", "http://x.test/a?b=1", "https://x.test/a b"]) expect(isLink(ok)).toBe(true);
    for (const ok of ["/images/a.jpg", "/a"]) expect(isLink(ok, true)).toBe(true);
    for (const bad of [
      "//evil.test/x.png",
      "/\\evil.test/x.png",
      "/a b.jpg",
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:image/png;base64,AAAA",
      "ftp://x.test",
      "mailto:a@b.test",
      "x.test/a",
      "https://",
      "",
    ]) {
      expect(isLink(bad, true)).toBe(false);
    }
    expect(isLink("/images/a.jpg")).toBe(false); // relative only where allowed
    expect(isLink("//evil.test")).toBe(false);
  });
  test("portfolio save refuses protocol-relative and non-http image/live links", async () => {
    for (const imageUrl of [
      "//evil.test/x.png",
      "/\\evil.test/x.png",
      "data:image/png;base64,AA",
      "javascript:alert(1)",
    ]) {
      expect(errOf((await pf({ imageUrl })).loc)).toBe("pf-image-invalid");
    }
    for (const liveUrl of ["//evil.test", "/relative", "javascript:alert(1)", "ftp://x.test"]) {
      expect(errOf((await pf({ liveUrl })).loc)).toBe("pf-live-invalid");
    }
    expect((await repo.portfolio.list()).length).toBe(0);
  });
});

describe("cover colour", () => {
  test("isHexColor / coverColorOr", () => {
    expect(isHexColor("#a1B2c3")).toBe(true);
    for (const bad of ["red", "#abc", "#abcdef0", "#ggg000", "#000000;background:url(x)", "", null, 5])
      expect(isHexColor(bad)).toBe(false);
    expect(coverColorOr("#123456")).toBe("#123456");
    expect(coverColorOr("expression(alert(1))")).toBe(DEFAULT_COVER);
    expect(coverColorOr(undefined, "#000000")).toBe("#000000");
  });
  test("API save stores a valid colour, replaces an invalid one with the default", async () => {
    const a = await pf({ title: "Warna A", coverColor: "#0a0b0c" });
    expect((await repo.portfolio.get(idOf(a.loc)))!.coverColor).toBe("#0a0b0c");
    const b = await pf({ title: "Warna B", coverColor: "#000;background:url(//evil.test)" });
    expect(okOf(b.loc)).toBe("pf-saved");
    expect((await repo.portfolio.get(idOf(b.loc)))!.coverColor).toBe(DEFAULT_COVER);
    await repo.portfolio.remove(idOf(a.loc));
    await repo.portfolio.remove(idOf(b.loc));
  });
  test("repo writes (import/seed path) and reads never carry an invalid colour", async () => {
    const id = await repo.portfolio.create({
      title: "Impor",
      slug: "impor-warna",
      client: "",
      category: "Website",
      year: 2026,
      summary: "",
      content: "",
      tags: "",
      coverColor: "red;}</style><script>",
      imageUrl: null,
      liveUrl: null,
      featured: false,
      published: false,
      sortOrder: 0,
      projectId: null,
    });
    const row = await client.execute({ sql: "SELECT cover_color FROM portfolio WHERE id = ?", args: [id] });
    expect(row.rows[0]!.cover_color).toBe(DEFAULT_COVER);
    // a bad value already in the database (older import) is cleaned when read
    await client.execute({ sql: "UPDATE portfolio SET cover_color = 'url(x)' WHERE id = ?", args: [id] });
    expect((await repo.portfolio.get(id))!.coverColor).toBe(DEFAULT_COVER);
    await repo.portfolio.remove(id);
  });
});

describe("year / sortOrder are rejected, never mangled", () => {
  test("year", async () => {
    for (const year of ["-2026", "2026.5", "1.5", "20x6", "+2026", "12026", "1989", "2028"]) {
      expect(errOf((await pf({ year })).loc)).toBe("pf-year-invalid");
    }
    const ok = await pf({ title: "Tahun", year: "2027" });
    expect((await repo.portfolio.get(idOf(ok.loc)))!.year).toBe(2027);
    await repo.portfolio.remove(idOf(ok.loc));
  });
  test("sortOrder", async () => {
    for (const sortOrder of ["1.5", "-1.5", "1e3", "abc", "--1", "1234567"]) {
      expect(errOf((await pf({ sortOrder })).loc)).toBe("pf-sort-invalid");
    }
    const neg = await pf({ title: "Urut", sortOrder: "-5" });
    expect((await repo.portfolio.get(idOf(neg.loc)))!.sortOrder).toBe(-5);
    await repo.portfolio.remove(idOf(neg.loc));
  });
});

describe("Discord ID (17–20 digits, same as the help text)", () => {
  test("lengths and mention syntax", async () => {
    const save = (discordId: string) =>
      post(`/api/users/${t.member}/discord`, { discordId }, { cookie: t.memberCookie });
    expect(ERR["discord-id-invalid"]).toContain("17–20");
    for (const bad of ["1".repeat(16), "1".repeat(21), "abc", "12345678901234567x"])
      expect(errOf((await save(bad)).loc)).toBe("discord-id-invalid");
    for (const good of ["1".repeat(17), "1".repeat(20), "<@!123456789012345678>"])
      expect(okOf((await save(good)).loc)).toBe("discord-id-saved");
    expect((await repo.users.get(t.member))!.discordId).toBe("123456789012345678");
    expect(okOf((await save("")).loc)).toBe("discord-id-cleared");
    // also on the add-member form
    const r = await post(
      "/api/users",
      { name: "D", email: "d@t.test", password: "long-password-1", discordId: "1".repeat(16) },
      { cookie: t.adminCookie },
    );
    expect(errOf(r.loc)).toBe("discord-id-invalid");
  });
});
