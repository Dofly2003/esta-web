// src/components/dash/ui.ts dan src/lib/api.ts (pemanggil API dari halaman Astro).
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as ui from "../../src/components/dash/ui";
import { api, ApiError, apiOrNull, apiPath, withFlash } from "../../src/lib/api";

describe("ui.ts", () => {
  it("current()", () => {
    expect(ui.current(true)).toBe("true");
    expect(ui.current(true, "page")).toBe("page");
    expect(ui.current(false, "page")).toBe(undefined);
  });
  it("here(): drops ok/err, keeps the rest, adds an anchor", () => {
    const url = new URL("http://x/dashboard/tasks?filter=all&ok=task-saved&err=stale&status=REVIEW");
    expect(ui.here(url)).toBe("/dashboard/tasks?filter=all&status=REVIEW");
    expect(ui.here(url, "task-1")).toBe("/dashboard/tasks?filter=all&status=REVIEW#task-1");
    expect(ui.here(url, "edit", false)).toBe("/dashboard/tasks#edit");
    expect(ui.here(new URL("http://x/dashboard?ok=a"))).toBe("/dashboard");
  });
  it("errIn()", () => {
    const url = new URL("http://x/p?err=pf-slug-taken");
    expect(ui.errIn(url, ["pf-slug-taken", "pf-year-invalid"])).toBe("pf-slug-taken");
    expect(ui.errIn(url, ["pf-year-invalid"])).toBe(null);
    expect(ui.errIn(new URL("http://x/p"), ["x"])).toBe(null);
  });
  it("invalid() / confirmAttr() / coverBg() / withLoad()", () => {
    expect(ui.invalid("f-name", "Wajib")).toEqual({ "aria-invalid": "true", "aria-describedby": "f-name-err" });
    expect(ui.invalid("f-name", null)).toEqual({});
    expect(ui.confirmAttr('Hapus "X"?').onclick).toBe('return confirm("Hapus \\"X\\"?")');
    expect(ui.coverBg("#123456")).toBe("linear-gradient(140deg, #123456 0%, var(--cover-ink) 115%)");
    expect(
      ui.withLoad(
        [
          { id: "a", name: "Budi" },
          { id: "b", name: "Rina" },
        ],
        { a: 2 },
      ),
    ).toEqual([
      { id: "a", name: "Budi · 2 terbuka" },
      { id: "b", name: "Rina · 0 terbuka" },
    ]);
    expect(ui.externalAttrs).toEqual({ target: "_blank", rel: "noopener noreferrer" });
    expect(ui.autoSubmit).toEqual({ "data-autosubmit": "" });
  });
});

describe("api.ts helpers", () => {
  it("apiPath skips empty values and encodes the rest", () => {
    expect(apiPath("/api/tasks", {})).toBe("/api/tasks");
    expect(apiPath("/api/tasks", { filter: "all", due: "", assignee: null, x: undefined, done: false })).toBe(
      "/api/tasks?filter=all",
    );
    expect(apiPath("/api/projects", { q: "a&b c", page: 2, flag: true })).toBe(
      "/api/projects?q=a%26b+c&page=2&flag=true",
    );
    expect(apiPath("/api/inquiries", { status: "NEW#x" })).toBe("/api/inquiries?status=NEW%23x");
  });
  it("withFlash appends codes with ? or &", () => {
    expect(withFlash("/dashboard", {})).toBe("/dashboard");
    expect(withFlash("/dashboard", { ok: "project-saved" })).toBe("/dashboard?ok=project-saved");
    expect(withFlash("/dashboard/tasks?filter=all", { err: "stale" })).toBe("/dashboard/tasks?filter=all&err=stale");
    expect(withFlash("/x", { ok: "task-saved", err: "stale" })).toBe("/x?ok=task-saved&err=stale");
  });
});

describe("api() / apiOrNull()", () => {
  const g = globalThis as { __ESTA_API__?: (req: Request) => Promise<Response> };
  afterEach(() => {
    delete g.__ESTA_API__;
    vi.unstubAllGlobals();
  });
  const ctx = (cookie?: string) => ({ request: new Request("http://site/x", { headers: cookie ? { cookie } : {} }) });

  it("calls the in-process handler directly, forwarding only the cookie", async () => {
    const seen: Request[] = [];
    g.__ESTA_API__ = async (req) => {
      seen.push(req);
      return Response.json({ hello: 1 });
    };
    expect(await api(ctx("esta_session=abc"), "/api/me?x=1")).toEqual({ hello: 1 });
    expect(seen[0]!.url).toBe("http://internal/api/me?x=1");
    expect(seen[0]!.headers.get("cookie")).toBe("esta_session=abc");
    expect(seen[0]!.headers.get("accept")).toBe("application/json");
  });
  it("throws ApiError with the server text; apiOrNull turns 404 into null only", async () => {
    g.__ESTA_API__ = async (req) =>
      new URL(req.url).pathname === "/api/missing"
        ? Response.json({ ok: false, error: "Proyek tidak ditemukan." }, { status: 404 })
        : Response.json({ ok: false, error: "Silakan masuk dulu." }, { status: 401 });
    await expect(api(ctx(), "/api/missing")).rejects.toMatchObject({ status: 404, message: "Proyek tidak ditemukan." });
    expect(await apiOrNull(ctx(), "/api/missing")).toBe(null);
    const e = await apiOrNull(ctx(), "/api/me").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(401);
  });
  it("a non-JSON error body still gives a useful message", async () => {
    g.__ESTA_API__ = async () => new Response("<html>", { status: 502 });
    await expect(api(ctx(), "/api/x")).rejects.toMatchObject({ status: 502, message: "API 502" });
  });
  it("without the in-process handler it fetches API_ORIGIN (dev)", async () => {
    const f = vi.fn(async (_req: Request) => Response.json([1]));
    vi.stubGlobal("fetch", f);
    vi.stubEnv("API_ORIGIN", "http://127.0.0.1:9999");
    expect(await api(ctx(), "/api/portfolio")).toEqual([1]);
    expect(f.mock.calls[0]![0].url).toBe("http://127.0.0.1:9999/api/portfolio");
    vi.unstubAllEnvs();
  });
});
