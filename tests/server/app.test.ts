// createFetch (server/app.ts): /api ke backend, file statis, sisanya ke halaman Astro.
import { beforeAll, describe, expect, test } from "bun:test";
import "./guard";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createFetch } from "../../server/app";

const clientDir = join(process.env.ESTA_TEST_DIR!, "client");
const pages = async (req: Request) => new Response("page:" + new URL(req.url).pathname, { status: 200 });
const fetchApp = createFetch(pages, clientDir);

beforeAll(() => {
  mkdirSync(join(clientDir, "_astro"), { recursive: true });
  writeFileSync(join(clientDir, "robots.txt"), "User-agent: *");
  writeFileSync(join(clientDir, "_astro", "a.js"), "x");
});

const at = (path: string, init?: RequestInit) => fetchApp(new Request("http://localhost" + path, init));

describe("createFetch", () => {
  test("static files with cache headers; immutable only for /_astro/", async () => {
    const a = await at("/robots.txt");
    expect(await a.text()).toBe("User-agent: *");
    expect(a.headers.get("cache-control")).toBe("public, max-age=3600");
    const b = await at("/_astro/a.js");
    expect(b.headers.get("cache-control")).toContain("immutable");
  });
  test("malformed % escape or path traversal never 500s or escapes the folder", async () => {
    expect(await (await at("/%E0%A4%A")).text()).toBe("page:/%E0%A4%A");
    expect(await (await at("/..%2f..%2fpackage.json")).text()).toStartWith("page:");
    expect(await (await at("/%2e%2e/%2e%2e/package.json")).text()).toStartWith("page:");
  });
  test("/api goes to the API; POST never serves a file", async () => {
    const h = await at("/api/health");
    expect(await h.json()).toEqual({ ok: true });
    expect(await (await at("/robots.txt", { method: "POST" })).text()).toBe("page:/robots.txt");
  });
  test("API-only mode (dev) answers non-API paths with a hint", async () => {
    const dev = createFetch(null, clientDir);
    const r = await dev(new Request("http://localhost/dashboard"));
    expect(r.status).toBe(404);
  });
});
