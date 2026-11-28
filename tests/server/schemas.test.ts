// Skema Valibot (server/schemas/*) terhadap kasus tetap: masukan + hasil yang diharapkan (kode error atau nilai).
// Kasus di fixtures/schema-cases.json dibuat oleh tes paritas sementara yang membandingkan helper validasi lama
// (sebelum Valibot) dengan skema ini pada ±7500 masukan; hasil lama = hasil yang diharapkan di sini.
// Jam dibekukan ke waktu pembuatan fixture (tahun berjalan dipakai validasi tahun karya).
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import "./guard";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accountPasswordForm, loginForm } from "../../server/schemas/auth";
import { parseWith } from "../../server/schemas/fields";
import { inquiryForm, inquiryStatusForm } from "../../server/schemas/inquiry";
import { portfolioFormA, portfolioFormB, toggleForm } from "../../server/schemas/portfolio";
import { parseProject, projectStatusForm } from "../../server/schemas/project";
import { discordForm, discordSettingOf, discordTestForm } from "../../server/schemas/settings";
import { taskEditTitle, taskForm, taskStatusForm, taskTitles } from "../../server/schemas/task";
import { userCreateForm, userDiscordForm, userPasswordForm, userRoleForm } from "../../server/schemas/user";

type F = Record<string, string>;
type Out = { code: string } | { value: unknown };
const g = (f: F, k: string) => (f[k] ?? "").trim();

/* ---------------- sisi baru (sama dengan cara server/api.ts memakai skema) ---------------- */
const trimAll = (f: F) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()]));
const out = (r: { ok: true; value: unknown } | { ok: false; code: string }): Out =>
  r.ok ? { value: r.value } : { code: r.code };
const neu = {
  project: (f: F) => out(parseProject(trimAll(f))),
  taskCreate: (f: F) => {
    const a = trimAll(f);
    const t = parseWith(taskTitles, a.title ?? "");
    if (!t.ok) return { code: t.code };
    const b = parseWith(taskForm, a);
    return b.ok ? { value: { titles: t.value, base: b.value } } : { code: b.code };
  },
  taskEdit: (f: F) => {
    const a = trimAll(f);
    const d = parseWith(taskForm, a);
    if (!d.ok) return { code: d.code };
    const t = parseWith(taskEditTitle, d.value.title);
    return t.ok ? { value: d.value } : { code: t.code };
  },
  status: (schema: Parameters<typeof parseWith>[0]) => (f: F) => {
    const r = parseWith(schema, trimAll(f));
    return r.ok ? { value: (r.value as { status: string }).status } : { code: r.code };
  },
  portfolio: (f: F) => {
    const all = trimAll(f);
    const a = parseWith(portfolioFormA, all);
    if (!a.ok) return { code: a.code };
    const b = parseWith(portfolioFormB, all);
    if (!b.ok) return { code: b.code };
    const v = b.value;
    return {
      value: {
        title: a.value.title,
        slug: a.value.slug || "(auto)",
        client: v.client,
        category: v.category,
        year: v.year,
        summary: v.summary,
        content: v.content,
        tags: v.tags,
        coverColor: v.coverColor,
        imageUrl: v.imageUrl,
        liveUrl: v.liveUrl,
        published: v.published,
        featured: v.featured,
        sortOrder: v.sortOrder,
        projectId: v.projectId,
      },
    };
  },
  toggle: (f: F) => out(parseWith(toggleForm, trimAll(f))),
  inquiry: (f: F) => out(parseWith(inquiryForm, trimAll(f))),
  userCreate: (f: F) => out(parseWith(userCreateForm, trimAll(f))),
  password: (schema: Parameters<typeof parseWith>[0], key: string) => (f: F) => {
    const r = parseWith(schema, trimAll(f));
    return r.ok ? { value: (r.value as Record<string, string>)[key] } : { code: r.code };
  },
  role: (f: F) => {
    const r = parseWith(userRoleForm, trimAll(f));
    return r.ok ? { value: r.value.role } : { code: r.code };
  },
  discordId: (f: F) => {
    const r = parseWith(userDiscordForm, trimAll(f));
    return r.ok ? { value: r.value.discordId } : { code: r.code };
  },
  webhook: (f: F) => out(parseWith(discordForm, trimAll(f))),
  webhookTest: (f: F) => {
    const r = parseWith(discordTestForm, trimAll(f));
    return r.ok ? { value: { webhookUrl: r.value.webhookUrl, enabled: g(f, "enabled") === "on" } } : { code: r.code };
  },
  login: (f: F) => out(parseWith(loginForm, trimAll(f))),
};

const FORMS: Record<string, (f: F) => Out> = {
  project: neu.project,
  taskCreate: neu.taskCreate,
  taskEdit: neu.taskEdit,
  projectStatus: neu.status(projectStatusForm),
  taskStatus: neu.status(taskStatusForm),
  inquiryStatus: neu.status(inquiryStatusForm),
  portfolio: neu.portfolio,
  toggle: neu.toggle,
  inquiry: neu.inquiry,
  userCreate: neu.userCreate,
  userPassword: neu.password(userPasswordForm, "password"),
  accountNext: neu.password(accountPasswordForm, "next"),
  role: neu.role,
  discordId: neu.discordId,
  webhook: neu.webhook,
  webhookTest: neu.webhookTest,
  login: neu.login,
};

const raw = readFileSync(join(import.meta.dir, "fixtures", "schema-cases.json"), "utf8").replace(
  /‹a\*(\d+)›/g,
  (_, n: string) => "a".repeat(Number(n)),
);
const fixture = JSON.parse(raw) as { generatedAt: string; cases: Record<string, { input: F; expect: Out }[]> };

beforeAll(() => setSystemTime(new Date(fixture.generatedAt)));
afterAll(() => setSystemTime());

describe("Valibot schemas = old validation (fixture cases)", () => {
  test("every form has cases", () => {
    expect(Object.keys(fixture.cases).sort()).toEqual(Object.keys(FORMS).sort());
  });
  for (const [name, cases] of Object.entries(fixture.cases)) {
    test(`${name} (${cases.length} cases)`, () => {
      const run = FORMS[name]!;
      for (const c of cases)
        expect({ name, input: c.input, out: run(c.input) }).toEqual({ name, input: c.input, out: c.expect });
    });
  }
});

describe("hand-picked boundaries", () => {
  test("project: dates must be real days, due >= start, order of codes", () => {
    expect(neu.project({ name: "", client: "" })).toEqual({ code: "project-required" });
    expect(neu.project({ name: "", client: "C" })).toEqual({ code: "project-name-required" });
    expect(neu.project({ name: "P", client: "" })).toEqual({ code: "project-client-required" });
    expect(neu.project({ name: "P", client: "C", startDate: "2026-02-31" })).toEqual({ code: "date-invalid" });
    expect(neu.project({ name: "P", client: "C", startDate: "2026-05-02", dueDate: "2026-05-01" })).toEqual({
      code: "project-dates",
    });
    expect(neu.project({ name: "P", client: "C", budget: "1.500.000,50" })).toEqual({ code: "budget-invalid" });
    // status asing ditolak sebelum deskripsi terlalu panjang (urutan if lama)
    expect(neu.project({ name: "P", client: "C", status: "x", description: "a".repeat(10_001) })).toEqual({
      code: "status-invalid",
    });
  });
  test("task titles: 30 lines ok, 31 too many, 301 chars too long", () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`).join("\n");
    expect(neu.taskCreate({ title: lines(30) })).toMatchObject({ value: { titles: expect.any(Array) } });
    expect(neu.taskCreate({ title: lines(31) })).toEqual({ code: "task-too-many" });
    expect(neu.taskCreate({ title: "a".repeat(301) })).toEqual({ code: "too-long" });
    expect(neu.taskCreate({ title: " \n " })).toEqual({ code: "task-title-required" });
    expect(neu.taskEdit({ title: "" })).toEqual({ code: "task-edit-title-required" });
  });
  test("discord id 17–20 digits, mention form accepted", () => {
    expect(neu.discordId({ discordId: "<@!123456789012345678>" })).toEqual({ value: "123456789012345678" });
    expect(neu.discordId({ discordId: "1234567890123456" })).toEqual({ code: "discord-id-invalid" });
    expect(neu.discordId({ discordId: "123456789012345678901" })).toEqual({ code: "discord-id-invalid" });
  });
  test("stored Discord settings JSON: corrupt or partial values fall back to defaults", () => {
    expect(discordSettingOf("{bad")).toEqual({ webhookUrl: "", enabled: true });
    expect(discordSettingOf('{"webhookUrl":"https://x"}')).toEqual({ webhookUrl: "https://x", enabled: true });
    expect(discordSettingOf('{"webhookUrl":5,"enabled":"yes"}')).toEqual({ webhookUrl: "", enabled: true });
    expect(discordSettingOf('{"webhookUrl":"h","enabled":false}')).toEqual({ webhookUrl: "h", enabled: false });
    expect(discordSettingOf("null")).toEqual({ webhookUrl: "", enabled: true });
  });
  test("a non-ErrCode issue (e.g. wrong input type) maps to server-error, never throws", () => {
    expect(parseWith(taskTitles, { not: "a string" })).toEqual({ ok: false, code: "server-error" });
  });
});
