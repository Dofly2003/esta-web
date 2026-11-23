import { createApp } from "astro/app/entrypoint";

const app = createApp();

/** Dipanggil server/main.ts untuk setiap request halaman */
export function handler(request) {
  return app.render(request, { addCookieHeader: true });
}
