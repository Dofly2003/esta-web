// shared/constants.ts helpers dan shared/messages.ts (kode flash).
import { describe, expect, it } from "vite-plus/test";
import * as C from "../../shared/constants";
import * as M from "../../shared/messages";

describe("constants", () => {
  it("labelOf falls back to the key", () => {
    expect(C.labelOf(C.PROJECT_TYPES, "WEB_APP")).toBe("Web App");
    expect(C.labelOf(C.TASK_STATUS, "REVIEW")).toBe("Review");
    expect(C.labelOf(C.PROJECT_TYPES, "LEGACY_X")).toBe("LEGACY_X");
  });
  it("portfolioCategory / isAdmin / isActiveProject", () => {
    expect(C.portfolioCategory("UI/UX")).toBe("UI/UX");
    expect(C.portfolioCategory("Branding")).toBe("Website");
    expect(C.isAdmin({ role: "ADMIN" })).toBe(true);
    expect(C.isAdmin({ role: "MEMBER" })).toBe(false);
    expect(C.isActiveProject({ status: "REVIEW" })).toBe(true);
    expect(C.isActiveProject({ status: "ON_HOLD" })).toBe(false);
  });
  it("isHexColor / coverColorOr", () => {
    expect(C.isHexColor(C.DEFAULT_COVER)).toBe(true);
    expect(C.coverColorOr("#ABCDEF")).toBe("#ABCDEF");
    expect(C.coverColorOr("blue")).toBe(C.DEFAULT_COVER);
  });
  it("INQUIRY_STATUS_ALL = selectable + legacy", () => {
    expect(Object.keys(C.INQUIRY_STATUS_ALL)).toEqual(["NEW", "CONTACTED", "WON", "LOST", "CLOSED"]);
  });
  it("every option has a tone class", () => {
    for (const map of [C.PROJECT_STATUS, C.TASK_STATUS, C.PRIORITY, C.INQUIRY_STATUS_ALL])
      for (const o of Object.values(map)) expect(o.cls).toMatch(/^tone-(neutral|info|accent|warn|ok|crit)$/);
  });
  it("MAX_LEN values are positive integers", () => {
    for (const v of Object.values(C.MAX_LEN)) expect(Number.isInteger(v) && v > 0).toBe(true);
  });
});

describe("flash messages", () => {
  it("flashText: only known codes, kinds separate, prototype keys refused", () => {
    expect(M.flashText("ok", "task-saved")).toBe("Tugas disimpan.");
    expect(M.flashText("err", "too-long")).toBe(M.ERR["too-long"]);
    expect(M.flashText("ok", "too-long")).toBe(null);
    expect(M.flashText("err", "Teks bebas")).toBe(null);
    for (const k of ["__proto__", "constructor", "toString"]) expect(M.flashText("err", k)).toBe(null);
    expect(M.flashText("ok", "")).toBe(null);
    expect(M.flashText("ok", undefined)).toBe(null);
  });
  it("readFlash reads ?ok= and ?err=", () => {
    expect(M.readFlash(new URL("http://x/?ok=sessions-ended&err=stale"))).toEqual({
      ok: M.OK["sessions-ended"],
      err: M.ERR.stale,
    });
    expect(M.readFlash(new URL("http://x/"))).toEqual({ ok: null, err: null });
  });
  it("status → code helpers", () => {
    expect(M.taskStatusOk("DONE")).toBe("task-status-done");
    expect(M.projectStatusOk("ON_HOLD")).toBe("project-status-on-hold");
    expect(M.projectStatusOk("X")).toBe("project-status");
    expect(M.inquiryStatusOk("WON")).toBe("inquiry-status-won");
    expect(M.inquiryStatusOk("CLOSED")).toBe("inquiry-status-closed");
  });
  it("there is a status message for every status", () => {
    for (const k of Object.keys(C.TASK_STATUS)) expect(M.taskStatusOk(k)).not.toBe("task-status");
    for (const k of Object.keys(C.PROJECT_STATUS)) expect(M.projectStatusOk(k)).not.toBe("project-status");
    for (const k of Object.keys(C.INQUIRY_STATUS_ALL)) expect(M.inquiryStatusOk(k)).not.toBe("inquiry-status");
  });
  it("texts are non-empty and follow the constants", () => {
    for (const v of [...Object.values(M.OK), ...Object.values(M.ERR)]) expect(v.trim().length).toBeGreaterThan(3);
    expect(M.ERR["password-short"]).toContain(String(C.MIN_PASSWORD));
    expect(M.ERR["task-too-many"]).toContain(String(C.MAX_TASK_LINES));
    expect(M.OK["pf-featured-over"]).toContain(String(C.MAX_FEATURED));
  });
  it("AUTH_INFO_ERRS are real error codes", () => {
    for (const k of M.AUTH_INFO_ERRS) expect(Object.hasOwn(M.ERR, k)).toBe(true);
  });
});
