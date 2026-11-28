// Variabel lingkungan server, dibaca lewat skema Valibot. Tidak pernah melempar error saat boot: nilai kosong / rusak
// diganti bawaan (dan untuk rahasia yang formatnya aneh hanya diberi peringatan, nilainya tetap dipakai apa adanya).
// Dibaca per pemanggilan (bukan sekali saat import), karena tes mengubah process.env saat berjalan; biayanya
// hanya satu kunci per panggilan (envOf).
import {
  check,
  fallback,
  finite,
  gtValue,
  maxValue,
  nonEmpty,
  object,
  optional,
  parse,
  pipe,
  string,
  transform,
  type InferOutput,
} from "valibot";
import { isWebhookUrl } from "./schemas/fields";

const DEFAULT_SESSION_DAYS = 7;
const MAX_SESSION_DAYS = 365;

const text = () => optional(string(), "");
/** Diisi apa saja (juga "0") = aktif, sama dengan cek truthy process.env.X dulu */
const flag = () =>
  pipe(
    text(),
    transform((v) => v !== ""),
  );
const port = (fallbackPort: number) =>
  fallback(
    pipe(
      string(),
      check((v) => /^\d{1,5}$/.test(v)),
      transform(Number),
      check((n) => n > 0 && n < 65536),
    ),
    fallbackPort,
  );

/** Lama sesi (hari): kosong / bukan angka / ≤ 0 / > 365 → 7 (tidak pernah Max-Age=NaN) */
export const sessionDaysSchema = fallback(
  pipe(string(), nonEmpty(), transform(Number), finite(), gtValue(0), maxValue(MAX_SESSION_DAYS)),
  DEFAULT_SESSION_DAYS,
);

const entries = {
  PORT: port(3000),
  API_PORT: port(3001),
  DATABASE_PATH: fallback(pipe(string(), nonEmpty()), "data/esta.sqlite"),
  /** libsql:/https:/wss: (Turso) atau file: — kosong = file SQLite lokal (DATABASE_PATH) */
  TURSO_DATABASE_URL: text(),
  TURSO_AUTH_TOKEN: text(),
  SESSION_DAYS: sessionDaysSchema,
  NODE_ENV: text(),
  INSECURE_COOKIE: flag(),
  VERCEL: flag(),
  DISCORD_WEBHOOK_URL: text(),
  SITE_URL: text(),
  VERCEL_URL: text(),
  VERCEL_PROJECT_PRODUCTION_URL: text(),
  ESTA_TEST_FAST_HASH: flag(),
  SEED_PASSWORD: text(),
};
const envSchema = object(entries);
export type Env = InferOutput<typeof envSchema>;
type Key = keyof typeof entries;
type Source = Record<string, string | undefined>;

/** Satu variabel (sudah divalidasi + bawaan) */
export function envOf<K extends Key>(key: K, src: Source = process.env): Env[K] {
  return parse(entries[key], src[key]) as Env[K];
}
/** Semua variabel sekaligus */
export const readEnv = (src: Source = process.env): Env => parse(envSchema, src);

const warned = new Set<string>();
const warnOnce = (key: string, msg: string) => {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[env] ${key}: ${msg}`);
};

/** Webhook cadangan dari env (dipakai apa adanya; peringatan sekali bila bukan link webhook Discord) */
export function envWebhook(src: Source = process.env) {
  const url = envOf("DISCORD_WEBHOOK_URL", src);
  if (url && !isWebhookUrl(url)) warnOnce("DISCORD_WEBHOOK_URL", "bukan link webhook Discord, notifikasi akan gagal");
  return url;
}

/** URL database Turso (dipakai apa adanya; peringatan sekali bila skemanya tidak dikenal) */
export function envDatabaseUrl(src: Source = process.env) {
  const url = envOf("TURSO_DATABASE_URL", src);
  if (url && !/^(libsql|https?|wss?|file):/i.test(url)) warnOnce("TURSO_DATABASE_URL", "skema URL tidak dikenal");
  return url;
}

/** Cookie Secure: production, kecuali INSECURE_COOKIE (hanya untuk uji lokal; jangan pernah diisi di Vercel) */
export const secureCookies = (src: Source = process.env) =>
  envOf("NODE_ENV", src) === "production" && !envOf("INSECURE_COOKIE", src);
