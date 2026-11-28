// @vitest-environment happy-dom
// src/scripts/loops.ts — loop tanpa henti (marquee, dot-matrix, orb) hanya jalan saat terlihat; tab tersembunyi = jeda.
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

type Cfg = {
  trigger: Element;
  start: string;
  end: string;
  onToggle: (s: { isActive: boolean }) => void;
  onRefresh: (s: { isActive: boolean }) => void;
};
const created: Cfg[] = [];
vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: { create: (cfg: Cfg) => (created.push(cfg), cfg) },
}));
const { pauseWhileHidden, shown, whileVisible } = await import("../../src/scripts/loops");

const anim = () => ({ pause: vi.fn(), resume: vi.fn() });
const box = (visible: boolean) => {
  const el = document.createElement("div");
  el.getClientRects = () => (visible ? [new DOMRect(0, 0, 10, 10)] : []) as unknown as DOMRectList;
  return el;
};

beforeEach(() => {
  created.length = 0;
});

describe("whileVisible", () => {
  it("starts paused; plays only while the trigger is on screen", () => {
    const a = anim();
    const el = box(true);
    whileVisible(el, a);
    expect(a.pause).toHaveBeenCalledTimes(1);
    expect(a.resume).not.toHaveBeenCalled();
    const cfg = created[0]!;
    expect(cfg).toMatchObject({ trigger: el, start: "top bottom", end: "bottom top" });
    cfg.onToggle({ isActive: true });
    expect(a.resume).toHaveBeenCalledTimes(1);
    cfg.onToggle({ isActive: false });
    expect(a.pause).toHaveBeenCalledTimes(2);
    // refresh (resize / breakpoint) re-evaluates the same way
    cfg.onRefresh({ isActive: true });
    expect(a.resume).toHaveBeenCalledTimes(2);
  });
  it("blocked() (e.g. marquee hovered) or a target without a box (display:none) never plays", () => {
    let hovered = true;
    const a = anim();
    whileVisible(box(true), a, () => hovered);
    created[0]!.onToggle({ isActive: true });
    expect(a.resume).not.toHaveBeenCalled();
    hovered = false;
    created[0]!.onToggle({ isActive: true });
    expect(a.resume).toHaveBeenCalledTimes(1);

    const b = anim();
    whileVisible(box(false), b);
    created[1]!.onToggle({ isActive: true });
    expect(b.resume).not.toHaveBeenCalled();
  });
  it("a separate trigger element (orb parent) can drive the target", () => {
    const parent = box(true);
    const orb = box(true);
    whileVisible(orb, anim(), undefined, parent);
    expect(created[0]!.trigger).toBe(parent);
  });
  it("shown() = has client rects", () => {
    expect(shown(box(true))).toBe(true);
    expect(shown(box(false))).toBe(false);
  });
});

describe("pauseWhileHidden", () => {
  it("pauses on hidden, resumes on visible", () => {
    const tl = anim();
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    pauseWhileHidden(tl);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(tl.pause).toHaveBeenCalledTimes(1);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(tl.resume).toHaveBeenCalledTimes(1);
  });
});
