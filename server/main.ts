// Server API untuk DEVELOPMENT (`bun run dev`): hanya /api di port 3001.
// Halaman dilayani `astro dev` (port 4321) yang mem-proxy /api ke sini.
// Untuk production lihat ../server.ts.
import { MAX_BODY_BYTES } from "./api";
import { createFetch } from "./app";
import { envOf } from "./env";

const fetch = createFetch(null);
const server = Bun.serve({
  port: envOf("API_PORT"),
  maxRequestBodySize: MAX_BODY_BYTES,
  hostname: "127.0.0.1",
  fetch: (req, srv) => fetch(req, srv),
});

console.log(`API ESTA (dev) di http://127.0.0.1:${server.port} — buka website di http://localhost:4321`);
