// Server API untuk DEVELOPMENT (`bun run dev`): hanya /api di port 3001.
// Halaman dilayani `astro dev` (port 4321) yang mem-proxy /api ke sini.
// Untuk production lihat ../server.ts.
import { createFetch } from "./app";

const fetch = createFetch(null);
const server = Bun.serve({
  port: Number(process.env.API_PORT || 3001),
  hostname: "127.0.0.1",
  fetch: (req, srv) => fetch(req, srv),
});

console.log(`API ESTA (dev) di http://127.0.0.1:${server.port} — buka website di http://localhost:4321`);
