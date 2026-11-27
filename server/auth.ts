// Login berbasis sesi: token acak di cookie httpOnly, hanya hash-nya yang disimpan di database.
import { sessions, users } from "./repo";
import type { User } from "../shared/types";
import { normEmail } from "../shared/format";

const SESSION_COOKIE = "esta_session";
const DEFAULT_SESSION_DAYS = 7;
const MAX_SESSION_DAYS = 365;
const secure = process.env.NODE_ENV === "production" && !process.env.INSECURE_COOKIE;

/** Lama sesi (hari) dari env SESSION_DAYS; kosong / bukan angka / ≤ 0 / > 365 → 7 (tidak pernah Max-Age=NaN) */
export function sessionDays(raw = process.env.SESSION_DAYS) {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 && n <= MAX_SESSION_DAYS ? n : DEFAULT_SESSION_DAYS;
}

const sha256 = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
/** Header Set-Cookie sesi (value kosong + maxAge 0 = hapus) */
const cookie = (value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

// Hanya tes (tests/server/setup.ts) memakai argon2 yang murah agar ratusan login tes tidak butuh menit;
// di luar tes selalu parameter bawaan Bun. Hash menyimpan parameternya sendiri, verify tetap sama.
const HASH_OPTS: Parameters<typeof Bun.password.hash>[1] =
  process.env.NODE_ENV === "test" && process.env.ESTA_TEST_FAST_HASH === "1"
    ? { algorithm: "argon2id", memoryCost: 1024, timeCost: 1 }
    : { algorithm: "argon2id" };
export const hashPassword = (pw: string) => Bun.password.hash(pw, HASH_OPTS);
export const verifyPassword = (pw: string, hash: string) => Bun.password.verify(pw, hash).catch(() => false);

/** Nilai cookie; null bila tidak ada atau rusak (mis. escape % yang tidak valid → dianggap tanpa sesi, bukan 500) */
export function readCookie(req: Request, name: string) {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k !== name) continue;
    try {
      return decodeURIComponent(v.join("=")) || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** id sesi (hash token) dari cookie request ini, atau null */
export function sessionId(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  return token ? sha256(token) : null;
}

export async function currentUser(req: Request): Promise<User | null> {
  const id = sessionId(req);
  return id ? sessions.user(id) : null;
}

/** Buat sesi baru, kembalikan header Set-Cookie */
export async function startSession(userId: string) {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const maxAge = Math.round(sessionDays() * 24 * 60 * 60);
  await sessions.purgeExpired();
  await sessions.create(sha256(token), userId, new Date(Date.now() + maxAge * 1000).toISOString());
  return cookie(token, maxAge);
}

export async function endSession(req: Request) {
  const id = sessionId(req);
  if (id) await sessions.remove(id);
  return cookie("", 0);
}

export async function login(email: string, password: string) {
  const u = await users.byEmail(normEmail(email));
  if (!u) {
    // tetap hitung hash agar waktu respons tidak membocorkan apakah email terdaftar
    await hashPassword(password);
    return null;
  }
  return (await verifyPassword(password, u.passwordHash)) ? u : null;
}

/** Request membawa cookie sesi (valid atau tidak) — untuk membedakan "sesi berakhir" dari "belum login" */
export const hasSessionCookie = (req: Request) => !!readCookie(req, SESSION_COOKIE);
