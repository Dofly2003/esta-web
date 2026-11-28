// Notifikasi Discord tanpa jaringan: isi pesan, cadangan env vs dikosongkan, dan batas waktu di dalam request.
import { afterAll, afterEach, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import "./guard";
import * as repo from "../../server/repo";
import {
  INQUIRY_NOTIFY_CAP_MS,
  isWebhookUrl,
  notifyInquiry,
  notifyTaskAssigned,
  NOTIFY_TIMEOUT_MS,
} from "../../server/discord";
import { freshTeam, get, net, newProject, post } from "./helpers";

const HOOK = "https://discord.com/api/webhooks/123/saved-test-token";
const ENV_HOOK = "https://discord.com/api/webhooks/456/env-test-token";

let t: Awaited<ReturnType<typeof freshTeam>>;
let project = "";
const since = (n: number) => net.calls.slice(n);
const restoreEnv: Record<string, string | undefined> = {};
const setEnv = (k: string, v: string | undefined) => {
  if (!(k in restoreEnv)) restoreEnv[k] = process.env[k];
  if (v == null) delete process.env[k];
  else process.env[k] = v;
};

beforeAll(async () => {
  setSystemTime(new Date("2026-11-26T18:30:00.000Z"));
  t = await freshTeam();
  project = await newProject("Proyek Notif", { client: "PT Klien" });
  await repo.users.setDiscordId(t.member, "123456789012345678");
});
afterEach(() => net.reset());
afterAll(() => {
  setSystemTime();
  for (const [k, v] of Object.entries(restoreEnv)) {
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("webhook URL rule", () => {
  test("isWebhookUrl", () => {
    expect(isWebhookUrl(HOOK)).toBe(true);
    expect(isWebhookUrl("https://canary.discord.com/api/webhooks/1/a-b_c")).toBe(true);
    expect(isWebhookUrl("https://discordapp.com/api/webhooks/1/x")).toBe(true);
    for (const bad of [
      "http://discord.com/api/webhooks/1/x",
      "https://evil.test/api/webhooks/1/x",
      "https://discord.com.evil.test/api/webhooks/1/x",
      `${HOOK}?x=1`,
    ])
      expect(isWebhookUrl(bad)).toBe(false);
  });
});

describe("env fallback vs. cleared webhook (audit B1)", () => {
  test("never configured: env webhook is used, but never sent to the admin form", async () => {
    setEnv("DISCORD_WEBHOOK_URL", ENV_HOOK);
    expect(await repo.settings.discord()).toEqual({ webhookUrl: ENV_HOOK, enabled: true });
    const team = (await get("/api/team", { cookie: t.adminCookie })).body;
    expect(team.discord).toEqual({ webhookUrl: "", enabled: true, fromEnv: true });
    expect(JSON.stringify(team)).not.toContain("env-test-token");
    const n = net.calls.length;
    await post("/api/tasks", { projectId: project, title: "via env", assigneeId: t.member }, { cookie: t.adminCookie });
    expect(since(n).map((c) => c.url)).toEqual([`${ENV_HOOK}?wait=true`]);
  });
  test("saving the (empty) form does not copy the env secret into the database", async () => {
    expect(
      (await post("/api/settings/discord", { webhookUrl: "", enabled: "on" }, { cookie: t.adminCookie })).loc,
    ).toBe("/dashboard/team?ok=discord-cleared");
    const row = await repo.settings.discordForm();
    expect(row).toEqual({ webhookUrl: "", enabled: true, fromEnv: false });
  });
  test("after clearing, notifications are really off even though the env var is set", async () => {
    const n = net.calls.length;
    await post(
      "/api/tasks",
      { projectId: project, title: "no notif", assigneeId: t.member },
      { cookie: t.adminCookie },
    );
    await post("/api/public/inquiries", { name: "Q", email: "q@x.test", message: "m" });
    expect(since(n)).toEqual([]);
    expect((await post("/api/settings/discord/test", {}, { cookie: t.adminCookie })).loc).toBe(
      "/dashboard/team?err=webhook-missing",
    );
    expect((await get("/api/team", { cookie: t.adminCookie })).body.discord.fromEnv).toBe(false);
  });
  test("saved webhook wins over env; members never see settings", async () => {
    await post("/api/settings/discord", { webhookUrl: HOOK, enabled: "on" }, { cookie: t.adminCookie });
    expect((await get("/api/team", { cookie: t.adminCookie })).body.discord).toEqual({
      webhookUrl: HOOK,
      enabled: true,
      fromEnv: false,
    });
    expect((await get("/api/team", { cookie: t.memberCookie })).body.discord).toBe(null);
    const n = net.calls.length;
    await post(
      "/api/tasks",
      { projectId: project, title: "via saved", assigneeId: t.member },
      { cookie: t.adminCookie },
    );
    expect(since(n).map((c) => c.url)).toEqual([`${HOOK}?wait=true`]);
  });
  test("disabled = nothing sent; corrupt settings JSON falls back to defaults instead of failing", async () => {
    await post("/api/settings/discord", { webhookUrl: HOOK }, { cookie: t.adminCookie });
    const n = net.calls.length;
    await post(
      "/api/tasks",
      { projectId: project, title: "disabled", assigneeId: t.member },
      { cookie: t.adminCookie },
    );
    expect(since(n)).toEqual([]);
    const { client } = await import("../../server/db");
    await client.execute("UPDATE settings SET value = '{not json' WHERE key = 'discord'");
    expect(await repo.settings.discord()).toEqual({ webhookUrl: "", enabled: true });
    expect((await get("/api/team", { cookie: t.adminCookie })).status).toBe(200);
    await post("/api/settings/discord", { webhookUrl: HOOK, enabled: "on" }, { cookie: t.adminCookie });
    setEnv("DISCORD_WEBHOOK_URL", undefined);
  });
});

describe("message building (no network)", () => {
  const admin = { id: "a", name: "Admin T", email: "", role: "ADMIN", discordId: "", createdAt: "" };
  const member = {
    id: "m",
    name: "Member T",
    email: "",
    role: "MEMBER",
    discordId: "123456789012345678",
    createdAt: "",
  };
  test("task assigned: mention only the assignee, link to the task row, fields", async () => {
    setEnv("SITE_URL", "https://esta.test/");
    const n = net.calls.length;
    await notifyTaskAssigned({
      task: { id: "t1", title: "Desain beranda", priority: "HIGH", dueDate: "2026-12-01", description: "Detail" },
      project: { id: "p1", name: "Proyek X", client: "PT X" },
      assignee: member,
      by: admin,
    });
    const [call] = since(n);
    expect(call!.url).toBe(`${HOOK}?wait=true`);
    const b = call!.body;
    expect(b.content).toBe("📌 <@123456789012345678>, ada tugas baru untuk Anda.");
    expect(b.allowed_mentions).toEqual({ parse: [], users: ["123456789012345678"] });
    const e = b.embeds[0];
    expect(e.title).toBe("Desain beranda");
    expect(e.url).toBe("https://esta.test/dashboard/projects/p1#task-t1");
    expect(e.color).toBe(0xe11d48);
    expect(e.fields).toEqual([
      { name: "📁 Proyek", value: "Proyek X\nPT X", inline: true },
      { name: "📅 Deadline", value: "1 Des 2026", inline: true },
      { name: "⚡ Prioritas", value: "Tinggi", inline: true },
    ]);
    expect(e.footer).toEqual({ text: "Ditugaskan oleh Admin T" });
    expect(e.timestamp).toBe("2026-11-26T18:30:00.000Z");
  });
  test("no Discord ID → bold name, no mentions", async () => {
    const n = net.calls.length;
    await notifyTaskAssigned({
      task: { id: "t2", title: "x", priority: "LOW", dueDate: null },
      project: { id: "p1", name: "P", client: "C" },
      assignee: { ...member, discordId: "" },
      by: admin,
    });
    const b = since(n)[0]!.body;
    expect(b.content).toContain("**Member T**");
    expect(b.allowed_mentions.users).toEqual([]);
    expect(b.embeds[0].fields[1].value).toBe("Tidak ada");
  });
  test("inquiry: markdown stripped, no mentions, link to the inbox row; Vercel URL fallback", async () => {
    setEnv("SITE_URL", undefined);
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", "esta-web.vercel.app");
    const n = net.calls.length;
    await notifyInquiry({
      id: "i1",
      name: "**Bos** `x`",
      email: "b@x.test",
      company: "PT *Y*",
      service: "",
      budget: "",
      message: "@everyone halo",
    });
    const b = since(n)[0]!.body;
    expect(b.content).toBe("📨 Inquiry baru dari **Bos x**. Website menjanjikan balasan maks. 1×24 jam.");
    expect(b.allowed_mentions).toEqual({ parse: [], users: [] });
    expect(b.embeds[0].title).toBe("Inquiry: Bos x · PT Y");
    expect(b.embeds[0].url).toBe("https://esta-web.vercel.app/dashboard/inbox?status=NEW&inq=i1#inq-i1");
    expect(b.embeds[0].fields.map((f: { value: string }) => f.value)).toEqual(["PT Y", "—", "—"]);
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
  });
  test("multi-line paste: one summary message listing each task", async () => {
    const n = net.calls.length;
    const r = await post(
      "/api/tasks",
      { projectId: project, title: "satu\ndua\ntiga", assigneeId: t.member },
      { cookie: t.adminCookie, json: true },
    );
    const sent = since(n);
    expect(sent.length).toBe(1);
    expect(sent[0]!.body.content).toContain("ada 3 tugas baru");
    expect(sent[0]!.body.embeds[0].description.split("\n").length).toBe(3);
    expect(sent[0]!.body.embeds[0].description).toContain(`#task-${r.body.data.ids[1]}`);
  });
  test("no notification for assigning yourself or keeping the same assignee", async () => {
    const n = net.calls.length;
    const mine = await post(
      "/api/tasks",
      { projectId: project, title: "sendiri", assigneeId: t.admin },
      { cookie: t.adminCookie, json: true },
    );
    expect(since(n)).toEqual([]);
    const toMember = await post(
      "/api/tasks",
      { projectId: project, title: "ke anggota", assigneeId: t.member },
      { cookie: t.adminCookie, json: true },
    );
    const id = toMember.body.data.id;
    const m = net.calls.length;
    await post(`/api/tasks/${id}`, { title: "ke anggota (ubah)", assigneeId: t.member }, { cookie: t.adminCookie });
    expect(since(m)).toEqual([]);
    expect(mine.body.ok).toBe(true);
  });
  test("project lead notification on create", async () => {
    const n = net.calls.length;
    await post(
      "/api/projects",
      { name: "Baru", client: "K", leadId: t.member, type: "WEB_APP" },
      { cookie: t.adminCookie },
    );
    const b = since(n)[0]!.body;
    expect(b.content).toContain("PJ (penanggung jawab)");
    expect(b.embeds[0].fields.map((f: { value: string }) => f.value)).toEqual([
      "K",
      "Web App",
      "Tidak ada",
      "Perencanaan",
    ]);
  });
});

describe("serverless: sends are awaited inside the request, with short caps (never thrown)", () => {
  test("caps are short", () => {
    expect(NOTIFY_TIMEOUT_MS).toBeLessThanOrEqual(4000);
    expect(INQUIRY_NOTIFY_CAP_MS).toBeLessThanOrEqual(2500);
  });
  test("task notification has finished when the response is returned", async () => {
    let finished = false;
    net.respond = async () => {
      await new Promise((r) => setTimeout(r, 50));
      finished = true;
      return new Response("{}");
    };
    await post(
      "/api/tasks",
      { projectId: project, title: "ditunggu", assigneeId: t.member },
      { cookie: t.adminCookie },
    );
    expect(finished).toBe(true);
  });
  test("public inquiry waits for a quick webhook…", async () => {
    let finished = false;
    net.respond = async () => {
      await new Promise((r) => setTimeout(r, 50));
      finished = true;
      return new Response("{}");
    };
    const r = await post("/api/public/inquiries", { name: "Cepat", email: "c@x.test", message: "m" });
    expect(r.loc).toBe("/contact?terkirim=1&ok=inquiry-sent");
    expect(finished).toBe(true);
  });
  test("…but a hanging webhook delays the contact form by at most the cap", async () => {
    net.respond = () => new Promise<Response>(() => {}); // never answers, ignores the abort signal
    const start = performance.now();
    const r = await post("/api/public/inquiries", { name: "Lambat", email: "l@x.test", message: "m" }, { json: true });
    const ms = performance.now() - start;
    expect(r.body).toMatchObject({ ok: true, code: "inquiry-sent" });
    expect(ms).toBeGreaterThanOrEqual(INQUIRY_NOTIFY_CAP_MS - 100);
    expect(ms).toBeLessThan(INQUIRY_NOTIFY_CAP_MS + 1500);
    expect((await repo.inquiries.list()).some((q) => q.name === "Lambat")).toBe(true);
  }, 10_000);
  test("a failing webhook (HTTP 500 / network error) never fails the save", async () => {
    net.respond = () => new Response("boom", { status: 500 });
    const a = await post(
      "/api/tasks",
      { projectId: project, title: "gagal 500", assigneeId: t.member },
      { cookie: t.adminCookie, json: true },
    );
    expect(a.body.ok).toBe(true);
    net.respond = () => {
      throw new Error("network down");
    };
    const b = await post(
      "/api/projects",
      { name: "Gagal net", client: "K", leadId: t.member },
      { cookie: t.adminCookie, json: true },
    );
    expect(b.body.ok).toBe(true);
  });
});
