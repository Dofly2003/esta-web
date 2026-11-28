// shared/format.ts — dipakai halaman (Astro) dan server. Dijalankan dengan TZ=America/Los_Angeles (vite.config.ts):
// tanggal tetap mengikuti WIB (APP_TZ).
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as F from "../../shared/format";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-26T18:30:00.000Z")); // 27 Nov 2026 01:30 WIB, 26 Nov 10:30 di Los Angeles
});
afterEach(() => vi.useRealTimers());

describe("dates in APP_TZ", () => {
  it("runs in a non-WIB server zone", () => {
    expect(new Date().getTimezoneOffset()).toBe(480);
  });
  it("today / dayOffset / currentYear / isoDay", () => {
    expect(F.today()).toBe("2026-11-27");
    expect(F.dayOffset(5)).toBe("2026-12-02");
    expect(F.dayOffset(-27)).toBe("2026-10-31");
    expect(F.currentYear()).toBe(2026);
    expect(F.isoDay(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01-01");
  });
  it("fmtDate / relDays / isOverdue / isDueWithin / elapsed", () => {
    expect(F.fmtDate("2026-11-27")).toBe("27 Nov 2026");
    expect(F.fmtDate("2026-11-26T18:30:00Z")).toBe("27 Nov 2026");
    expect(F.fmtDate(undefined)).toBe("—");
    expect(F.fmtDate("nope")).toBe("—");
    expect(F.relDays("2026-11-30")).toBe(3);
    expect(F.isOverdue("2026-11-26")).toBe(true);
    expect(F.isOverdue("2026-11-26", true)).toBe(false);
    expect(F.isDueWithin("2026-12-04")).toBe(true);
    expect(F.isDueWithin("2026-12-05")).toBe(false);
    expect(F.isDueWithin("2026-12-05", 8)).toBe(true);
    expect(F.elapsed({ startDate: "2026-11-17", dueDate: "2026-12-07" })).toBe(0.5);
    expect(F.elapsed({ startDate: "bad", dueDate: "2026-12-07" })).toBe(null);
  });
  it("dueText / agoText / hoursSince", () => {
    expect(F.dueText("2026-11-28", false)).toBe("besok");
    expect(F.dueText("2026-11-20", true)).toBe("lewat 7 hari");
    expect(F.dueText("2026-11-27", true)).toBe("lewat 1 hari");
    expect(F.agoText("2026-11-25T05:00:00Z")).toBe("2 hari lalu");
    expect(F.agoText(null)).toBe("");
    expect(F.hoursSince("2026-11-26T16:30:00.000Z")).toBe(2);
    expect(F.hoursSince("2026-11-27T00:00:00.000Z")).toBe(0);
    expect(F.hoursSince("nope")).toBe(0);
    expect(F.hoursSince(null)).toBe(0);
  });
});

describe("status helpers", () => {
  const tasks = [{ status: "DONE" }, { status: "TODO" }, { status: "DONE" }, { status: "REVIEW" }];
  it("isDone / openTasks / doneCount / progress / isLate", () => {
    expect(F.doneCount(tasks)).toBe(2);
    expect(F.openTasks(tasks).length).toBe(2);
    expect(F.progress(tasks)).toBe(50);
    expect(F.progress([])).toBe(0);
    expect(F.isLate({ status: "TODO", dueDate: "2026-11-01" })).toBe(true);
    expect(F.isLate({ status: "DONE", dueDate: "2026-11-01" })).toBe(false);
    expect(F.isLate({ status: "TODO", dueDate: null })).toBe(false);
  });
  it("liveTasks keeps open tasks of active projects only", () => {
    const projects = [
      { id: "a", status: "REVIEW" },
      { id: "b", status: "ON_HOLD" },
    ];
    const list = [
      { id: "1", projectId: "a", status: "TODO" },
      { id: "2", projectId: "a", status: "DONE" },
      { id: "3", projectId: "b", status: "TODO" },
    ];
    expect(F.liveTasks(list, projects).map((t) => t.id)).toEqual(["1"]);
  });
});

describe("text helpers", () => {
  it("fmtRupiah / parseRupiah", () => {
    expect(F.fmtRupiah(15_000_000).replace(/\s/g, " ")).toBe("Rp 15.000.000");
    expect(F.fmtRupiah(null)).toBe("—");
    expect(F.parseRupiah(" Rp. 1.500.000 ")).toBe(1_500_000);
    expect(F.parseRupiah("1.500.000,50")).toBe("invalid");
    expect(F.parseRupiah("1234567890123456")).toBe("invalid");
    expect(F.parseRupiah("")).toBe(null);
  });
  it("slugify / cutText / firstName / initials", () => {
    expect(F.slugify("Café Déjà-Vu  2026!")).toBe("cafe-deja-vu-2026");
    expect(F.slugify("---")).toBe("");
    expect(F.slugify("a".repeat(80)).length).toBe(60);
    expect(F.cutText("  banyak   spasi  ", 50)).toBe("banyak spasi");
    expect(F.cutText("satu dua tiga empat", 10)).toBe("satu dua…");
    expect(F.firstName("  Budi Santoso ")).toBe("Budi");
    expect(F.initials("budi santoso wijaya")).toBe("BS");
    expect(F.initials("")).toBe("");
  });
  it("safeNext / FRAGMENT_RE", () => {
    expect(F.safeNext("/dashboard/projects/1?x=1#task-2")).toBe("/dashboard/projects/1?x=1#task-2");
    expect(F.safeNext("/dashboard/x#bad hash")).toBe("/dashboard/x");
    for (const bad of [
      "//evil.test/dashboard",
      "/\\evil",
      "https://evil.test/dashboard",
      "/dashboard/../login",
      "/dash",
    ])
      expect(F.safeNext(bad)).toBe(null);
    expect(F.FRAGMENT_RE.test("#task-1")).toBe(true);
    expect(F.FRAGMENT_RE.test("#1task")).toBe(false);
  });
  it("isEmail / normEmail / isLink", () => {
    expect(F.isEmail("a@b.co")).toBe(true);
    expect(F.isEmail("a@b")).toBe(false);
    expect(F.isEmail("a b@c.co")).toBe(false);
    expect(F.normEmail("  A@B.Co ")).toBe("a@b.co");
    expect(F.isLink("https://x.test")).toBe(true);
    expect(F.isLink("//x.test")).toBe(false);
    expect(F.isLink("/\\x.test", true)).toBe(false);
    expect(F.isLink("/img.png", true)).toBe(true);
    expect(F.isLink("javascript:alert(1)")).toBe(false);
  });
});
