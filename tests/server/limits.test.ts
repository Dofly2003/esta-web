// FailWindow: rate limit login di memori, dengan jendela tetap dan memori terbatas.
import { describe, expect, test } from "bun:test";
import { FailWindow } from "../../server/limits";

const MIN = 60_000;

describe("FailWindow", () => {
  test("blocks at the limit inside the window; the window is not extended while blocked", () => {
    const w = new FailWindow(15 * MIN);
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) w.fail("k", 3, t0 + i);
    expect(w.blocked("k", 3, t0 + 10)).toBe(true);
    w.fail("k", 3, t0 + 14 * MIN); // attempt while blocked
    expect(w.blocked("k", 3, t0 + 15 * MIN - 1)).toBe(true);
    expect(w.blocked("k", 3, t0 + 15 * MIN + 1)).toBe(false);
    w.fail("k", 3, t0 + 15 * MIN + 2); // new window, count 1
    expect(w.blocked("k", 3, t0 + 15 * MIN + 3)).toBe(false);
  });
  test("keys are independent; clear() resets one key", () => {
    const w = new FailWindow(MIN);
    w.fail("a", 1, 0);
    expect(w.blocked("a", 1, 1)).toBe(true);
    expect(w.blocked("b", 1, 1)).toBe(false);
    w.clear("a");
    expect(w.blocked("a", 1, 1)).toBe(false);
  });
  test("expired entries are swept, so memory does not grow without bound", () => {
    const w = new FailWindow(MIN, 10_000, 1000);
    for (let i = 0; i < 500; i++) w.fail(`ip${i}`, 10, i);
    expect(w.size).toBe(500);
    w.fail("late", 10, 2 * MIN); // sweep runs: all 500 expired
    expect(w.size).toBe(1);
  });
  test("hard cap: under a flood of fresh keys the oldest are dropped first", () => {
    const w = new FailWindow(15 * MIN, 100);
    for (let i = 0; i < 1000; i++) w.fail(`ip${i}`, 10, 1000 + i);
    expect(w.size).toBe(100);
    expect(w.blocked("ip999", 1, 2000)).toBe(true);
    expect(w.blocked("ip0", 1, 2000)).toBe(false);
  });
});
