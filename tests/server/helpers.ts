// Bantuan bersama tes server: request in-process ke handleApi, login, dan perekam jaringan dari setup.ts.
import "./guard";
import { expect } from "bun:test";
import { handleApi } from "../../server/api";
import { hashPassword } from "../../server/auth";
import * as repo from "../../server/repo";
import type { ProjectInput } from "../../server/repo";
import type { NetCall } from "./setup";

type Net = {
  calls: NetCall[];
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>;
  reset(): void;
};
export const net = (globalThis as unknown as { __ESTA_NET__: Net }).__ESTA_NET__;

export const ORIGIN = "http://localhost:4321";
/** Password khusus tes (bukan password sungguhan); setiap file tes membuat akunnya sendiri */
export const PW = "test-password-123";

export type Opts = { cookie?: string; json?: boolean; origin?: string; referer?: string; ip?: string };

export async function get(path: string, o: Opts = {}) {
  const h = new Headers({ accept: "application/json" });
  if (o.cookie) h.set("cookie", o.cookie);
  const res = await handleApi(new Request(ORIGIN + path, { headers: h }), o.ip);
  return { status: res.status, body: (await res.json()) as any, headers: res.headers };
}

export async function post(path: string, fields: Record<string, string>, o: Opts = {}) {
  const h = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (o.json) h.set("accept", "application/json");
  if (o.cookie) h.set("cookie", o.cookie);
  if (o.origin) h.set("origin", o.origin);
  if (o.referer) h.set("referer", o.referer);
  const res = await handleApi(
    new Request(ORIGIN + path, { method: "POST", headers: h, body: new URLSearchParams(fields) }),
    o.ip,
  );
  const loc = res.headers.get("location");
  const body = o.json ? ((await res.json()) as any) : null;
  return { status: res.status, loc, body, setCookie: res.headers.get("set-cookie") };
}

export async function raw(path: string, init: RequestInit & { ip?: string } = {}) {
  const { ip, ...rest } = init;
  return handleApi(new Request(ORIGIN + path, rest), ip);
}

/** Login lewat form; kembalikan header Cookie sesi */
export async function login(email: string, password = PW, ip?: string) {
  const r = await post("/api/auth/login", { email, password, next: "/dashboard" }, { ip });
  expect(r.status).toBe(303);
  const m = /esta_session=([^;]+)/.exec(r.setCookie ?? "");
  if (!m) throw new Error("login failed for " + email + " → " + r.loc);
  return `esta_session=${m[1]}`;
}

/** Database kosong + satu admin dan satu anggota yang sudah login */
export async function freshTeam() {
  await repo.wipeAll();
  const hash = await hashPassword(PW);
  const admin = await repo.users.create({ name: "Admin T", email: "admin@t.test", role: "ADMIN", passwordHash: hash });
  const member = await repo.users.create({
    name: "Member T",
    email: "member@t.test",
    role: "MEMBER",
    passwordHash: hash,
  });
  return {
    admin,
    member,
    adminCookie: await login("admin@t.test"),
    memberCookie: await login("member@t.test"),
  };
}

export const newProject = (name = "Proyek T", extra: Partial<ProjectInput> = {}) =>
  repo.projects.create({
    name,
    client: "Klien",
    type: "WEBSITE",
    status: "IN_PROGRESS",
    description: "",
    budget: null,
    startDate: null,
    dueDate: null,
    leadId: null,
    ...extra,
  });

export const q = (loc: string | null) => new URL(loc!, ORIGIN);
export const errOf = (loc: string | null) => q(loc).searchParams.get("err");
export const okOf = (loc: string | null) => q(loc).searchParams.get("ok");
export const idOf = (loc: string | null) => q(loc).pathname.split("/").pop()!;
