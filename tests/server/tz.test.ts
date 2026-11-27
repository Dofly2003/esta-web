// Helper tanggal (APP_TZ = WIB) harus sama di zona waktu server mana pun. `bun run test:server` menjalankan
// semua tes server di beberapa TZ (scripts/test-server.ts → ESTA_TEST_TZ → process.env.TZ di setup.ts).
import { afterAll, describe, expect, setSystemTime, test } from "bun:test";
import { agoText, dayOffset, dueText, fmtDate, isOverdue, relDays, today } from "../../shared/format";

afterAll(() => setSystemTime());

describe("TZ matrix", () => {
  test(`server TZ is the requested one (${process.env.ESTA_TEST_TZ ?? "default"})`, () => {
    const want = process.env.ESTA_TEST_TZ;
    if (!want) return;
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(want);
    const jul = new Date("2026-07-01T12:00:00Z").getTimezoneOffset();
    const expected: Record<string, number> = {
      UTC: 0,
      "Asia/Jakarta": -420,
      "America/Los_Angeles": 420,
      "Pacific/Kiritimati": -840,
    };
    if (want in expected) expect(jul).toBe(expected[want]!);
  });
});

describe("WIB day boundaries, whatever the server TZ", () => {
  const at = (iso: string) => setSystemTime(new Date(iso));
  test("16:59:59Z is still today in WIB, 17:00Z is tomorrow", () => {
    at("2026-12-31T16:59:59.000Z");
    expect(today()).toBe("2026-12-31");
    expect(isOverdue("2026-12-30")).toBe(true);
    expect(isOverdue("2026-12-31")).toBe(false);
    at("2026-12-31T17:00:00.000Z");
    expect(today()).toBe("2027-01-01");
    expect(dayOffset(-1)).toBe("2026-12-31");
    expect(isOverdue("2026-12-31")).toBe(true);
  });
  test("relative texts", () => {
    at("2026-11-26T18:30:00.000Z"); // 27 Nov 01:30 WIB
    expect(dueText("2026-11-27", false)).toBe("hari ini");
    expect(dueText("2026-11-28", false)).toBe("besok");
    expect(dueText("2026-12-01", false)).toBe("4 hari lagi");
    expect(dueText("2026-12-30", false)).toBe(null);
    expect(dueText("2026-11-24", true)).toBe("lewat 3 hari");
    expect(dueText(null, false)).toBe(null);
    expect(agoText("2026-11-26T17:30:00.000Z")).toBe("hari ini"); // 00:30 WIB on the 27th
    expect(agoText("2026-11-26T16:30:00.000Z")).toBe("kemarin"); // 23:30 WIB on the 26th
    expect(agoText("2026-11-20T03:00:00.000Z")).toBe("7 hari lalu");
    expect(relDays("2026-02-28")).toBe(-272);
  });
  test("fmtDate around midnight and leap day", () => {
    expect(fmtDate("2028-02-29")).toBe("29 Feb 2028");
    expect(fmtDate("2026-11-26T16:59:00Z")).toBe("26 Nov 2026");
    expect(fmtDate("2026-11-26T17:00:00Z")).toBe("27 Nov 2026");
  });
});
