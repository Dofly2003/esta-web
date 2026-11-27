// Sesi, cookie, password, dan rate limit login.
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import "./guard";
import { hasSessionCookie, readCookie, sessionDays, sessionId } from "../../server/auth";
import * as repo from "../../server/repo";
import { OK as M_ok } from "../../shared/messages";
import { errOf, freshTeam, get, login, okOf, post, PW, raw } from "./helpers";

let t: Awaited<ReturnType<typeof freshTeam>>;
beforeAll(async () => {
  setSystemTime(new Date("2026-11-26T18:30:00.000Z"));
  t = await freshTeam();
});
afterAll(() => setSystemTime());

const reqWith = (cookie: string) => new Request("http://localhost/x", { headers: { cookie } });

describe("cookies", () => {
  test("readCookie: value, missing, malformed % escape → null (no throw)", () => {
    expect(readCookie(reqWith("a=1; esta_session=abc; b=2"), "esta_session")).toBe("abc");
    expect(readCookie(reqWith("a=1"), "esta_session")).toBe(null);
    expect(readCookie(reqWith("esta_session=%E0%A4%A"), "esta_session")).toBe(null);
    expect(readCookie(reqWith("esta_session=%"), "esta_session")).toBe(null);
    expect(readCookie(reqWith("esta_session="), "esta_session")).toBe(null);
    expect(readCookie(reqWith("esta_session=a%20b"), "esta_session")).toBe("a b");
    expect(readCookie(new Request("http://localhost/x"), "esta_session")).toBe(null);
  });
  test("malformed session cookie = no session (401 login-required, not 500)", async () => {
    for (const cookie of ["esta_session=%E0%A4%A", "esta_session=%", "x=1; esta_session=%zz"]) {
      const g = await get("/api/dashboard", { cookie });
      expect(g.status).toBe(401);
      expect(g.body.code).toBe("login-required");
      const p = await post("/api/projects", { name: "x", client: "y" }, { cookie });
      expect(p.status).toBe(303);
      expect(errOf(p.loc)).toBe("login-required");
    }
    expect(hasSessionCookie(reqWith("esta_session=%E0%A4%A"))).toBe(false);
  });
  test("malformed cookie does not break public routes either", async () => {
    const g = await get("/api/public/home", { cookie: "esta_session=%E0%A4%A" });
    expect(g.status).toBe(200);
    expect(g.body.stats).toBeDefined();
  });
  test("logout with a malformed cookie still clears the cookie", async () => {
    const r = await post("/api/auth/logout", {}, { cookie: "esta_session=%" });
    expect(r.loc).toBe("/login");
    expect(r.setCookie).toContain("Max-Age=0");
  });
});

describe("session lifetime (SESSION_DAYS)", () => {
  const prev = process.env.SESSION_DAYS;
  afterAll(() => {
    if (prev == null) delete process.env.SESSION_DAYS;
    else process.env.SESSION_DAYS = prev;
  });
  test("sessionDays: invalid / empty / out of range → 7", () => {
    expect(sessionDays(undefined)).toBe(7);
    expect(sessionDays("")).toBe(7);
    expect(sessionDays("abc")).toBe(7);
    expect(sessionDays("0")).toBe(7);
    expect(sessionDays("-3")).toBe(7);
    expect(sessionDays("NaN")).toBe(7);
    expect(sessionDays("Infinity")).toBe(7);
    expect(sessionDays("1000")).toBe(7);
    expect(sessionDays("14")).toBe(14);
    expect(sessionDays("0.5")).toBe(0.5);
  });
  test("login cookie Max-Age follows SESSION_DAYS and is never NaN", async () => {
    process.env.SESSION_DAYS = "nonsense";
    const a = await post("/api/auth/login", { email: "member@t.test", password: PW });
    expect(a.setCookie).toContain(`Max-Age=${7 * 86400}`);
    process.env.SESSION_DAYS = "2";
    const b = await post("/api/auth/login", { email: "member@t.test", password: PW });
    expect(b.setCookie).toContain(`Max-Age=${2 * 86400}`);
    expect(b.setCookie).toContain("HttpOnly");
    expect(b.setCookie).toContain("SameSite=Lax");
    expect(a.setCookie).not.toContain("NaN");
  });
  test("an expired session is refused with session-expired", async () => {
    const cookie = await login("member@t.test");
    const id = sessionId(reqWith(cookie))!;
    expect((await get("/api/me", { cookie })).status).toBe(200);
    setSystemTime(new Date("2027-01-30T00:00:00.000Z")); // past 7 days
    const g = await get("/api/me", { cookie });
    expect(g.status).toBe(401);
    expect(g.body.code).toBe("session-expired");
    setSystemTime(new Date("2026-11-26T18:30:00.000Z"));
    await repo.sessions.remove(id);
  });
});

describe("own password change ends other sessions", () => {
  test("other devices are logged out, this device stays logged in", async () => {
    const here = await login("member@t.test");
    const phone = await login("member@t.test");
    const laptop = await login("member@t.test");
    const adminSession = t.adminCookie;
    const r = await post(
      "/api/account/password",
      { current: PW, next: "member-new-pass-1", _back: "/dashboard/team#h-pass" },
      { cookie: here },
    );
    expect(r.loc).toBe("/dashboard/team?ok=password-changed#h-pass");
    expect(M_ok["password-changed"]).toContain("Perangkat lain");
    expect((await get("/api/me", { cookie: here })).status).toBe(200);
    expect((await get("/api/me", { cookie: phone })).status).toBe(401);
    expect((await get("/api/me", { cookie: laptop })).status).toBe(401);
    expect((await get("/api/me", { cookie: t.memberCookie })).status).toBe(401);
    // other accounts are untouched
    expect((await get("/api/me", { cookie: adminSession })).status).toBe(200);
    // the new password works, the old one does not
    expect(
      errOf((await post("/api/auth/login", { email: "member@t.test", password: PW }, { ip: "10.9.0.1" })).loc),
    ).toBe("login-failed");
    t.memberCookie = await login("member@t.test", "member-new-pass-1");
  });
  test("wrong current password / too short / too long change nothing", async () => {
    const other = await login("member@t.test", "member-new-pass-1");
    const c = t.memberCookie;
    expect(
      errOf((await post("/api/account/password", { current: "nope", next: "whatever123" }, { cookie: c })).loc),
    ).toBe("password-wrong");
    expect(
      errOf((await post("/api/account/password", { current: "member-new-pass-1", next: "short" }, { cookie: c })).loc),
    ).toBe("password-short");
    expect(
      errOf(
        (await post("/api/account/password", { current: "member-new-pass-1", next: "x".repeat(257) }, { cookie: c }))
          .loc,
      ),
    ).toBe("too-long");
    expect((await get("/api/me", { cookie: other })).status).toBe(200);
  });
  test("POST /api/account/logout-others keeps only this session", async () => {
    const a = await login("member@t.test", "member-new-pass-1");
    const b = await login("member@t.test", "member-new-pass-1");
    const r = await post("/api/account/logout-others", { _back: "/dashboard/team#h-pass" }, { cookie: a });
    expect(r.loc).toBe("/dashboard/team?ok=sessions-ended#h-pass");
    expect((await get("/api/me", { cookie: a })).status).toBe(200);
    expect((await get("/api/me", { cookie: b })).status).toBe(401);
    expect(await repo.sessions.countFor(t.member)).toBe(1);
    expect((await post("/api/account/logout-others", {})).loc).toBe("/login?next=%2Fdashboard&err=login-required");
    t.memberCookie = a;
  });
  test("admin reset of another account still ends all its sessions", async () => {
    const r = await post(
      `/api/users/${t.member}/password`,
      { password: "reset-by-admin-1" },
      { cookie: t.adminCookie },
    );
    expect(okOf(r.loc)).toBe("user-password-reset");
    expect(await repo.sessions.countFor(t.member)).toBe(0);
    expect(
      errOf(
        (await post(`/api/users/${t.member}/password`, { password: "y".repeat(300) }, { cookie: t.adminCookie })).loc,
      ),
    ).toBe("too-long");
    t.memberCookie = await login("member@t.test", "reset-by-admin-1");
  });
});

describe("login", () => {
  test("very long passwords fail without hashing, and count as a failure", async () => {
    const r = await post("/api/auth/login", { email: "admin@t.test", password: "p".repeat(5000) }, { ip: "10.8.0.1" });
    expect(errOf(r.loc)).toBe("login-failed");
  });
  test("successful login clears the per-account failures", async () => {
    const ip = "10.8.0.2";
    for (let i = 0; i < 9; i++) await post("/api/auth/login", { email: "admin@t.test", password: "bad" }, { ip });
    await login("admin@t.test", PW, ip);
    for (let i = 0; i < 9; i++) {
      expect(errOf((await post("/api/auth/login", { email: "admin@t.test", password: "bad" }, { ip })).loc)).toBe(
        "login-failed",
      );
    }
  }, 30_000);
  test("the lock lasts 15 minutes from the first failure", async () => {
    const ip = "10.8.0.3";
    const at = (iso: string) => setSystemTime(new Date(iso));
    at("2026-11-26T18:30:00.000Z");
    const tryBad = async () =>
      errOf(
        (
          await raw("/api/auth/login", {
            method: "POST",
            ip,
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ email: "admin@t.test", password: "bad" }),
          })
        ).headers.get("location"),
      );
    for (let i = 0; i < 10; i++) expect(await tryBad()).toBe("login-failed");
    expect(await tryBad()).toBe("login-blocked");
    at("2026-11-26T18:44:00.000Z");
    expect(await tryBad()).toBe("login-blocked");
    at("2026-11-26T18:45:01.000Z");
    expect(await tryBad()).toBe("login-failed");
    at("2026-11-26T18:30:00.000Z");
  }, 30_000);
});
