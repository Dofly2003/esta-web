// Login berbasis sesi: token acak di cookie httpOnly, hanya hash-nya yang disimpan di database.
import { sessions, users } from "./repo";
import type { User } from "../shared/types";
import { normEmail } from "../shared/format";
import { envOf, secureCookies, sessionDaysSchema } from "./env";
import { parse } from "valibot";

const SESSION_COOKIE = "esta_session";
const secure = secureCookies();

/** Lama sesi (hari) dari env SESSION_DAYS; kosong / bukan angka / ≤ 0 / > 365 → 7 (tidak pernah Max-Age=NaN) */
export function sessionDays(raw = process.env.SESSION_DAYS) {
  return parse(sessionDaysSchema, raw);
}

const sha256 = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
/** Header Set-Cookie sesi (value kosong + maxAge 0 = hapus) */
const cookie = (value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

// argon2id m=19 MiB, t=2, p=1 (OWASP, opsi 1): ~120 ms dan 19 MiB per hash, bukan 64 MiB bawaan Bun (8 login
// bersamaan dulu bisa membuat RSS > 600 MB). Hash menyimpan parameternya sendiri, jadi hash lama tetap bisa
// diverifikasi dan diperbarui otomatis saat login berhasil (needsRehash).
// Hanya tes (tests/server/setup.ts) memakai argon2 yang murah agar ratusan login tes tidak butuh menit.
export const HASH_OPTS = { algorithm: "argon2id", memoryCost: 19_456, timeCost: 2 } as const;
const TEST_HASH_OPTS = { algorithm: "argon2id", memoryCost: 1024, timeCost: 1 } as const;
const hashOpts = envOf("NODE_ENV") === "test" && envOf("ESTA_TEST_FAST_HASH") ? TEST_HASH_OPTS : HASH_OPTS;
/** Bagian parameter hash saat ini, mis. "m=19456,t=2,p=1" */
const CURRENT_PARAMS = `m=${hashOpts.memoryCost},t=${hashOpts.timeCost},p=1`;

export const hashPassword = (pw: string) => Bun.password.hash(pw, hashOpts);
export const verifyPassword = (pw: string, hash: string) => Bun.password.verify(pw, hash).catch(() => false);
/** Hash dibuat dengan parameter lain (mis. argon2 64 MiB lama, atau bcrypt): perlu di-hash ulang */
export const needsRehash = (hash: string) => !hash.startsWith("$argon2id$") || hash.split("$")[3] !== CURRENT_PARAMS;

// Untuk email yang tidak terdaftar tetap dijalankan satu verify argon2 dengan parameter yang SAMA, supaya waktu
// respons tidak membocorkan apakah email terdaftar. Dibuat sekali (lazy) per instance.
let dummyHash: Promise<string> | null = null;
const dummy = () => (dummyHash ??= hashPassword(crypto.randomUUID()));

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

/** Buat sesi baru (sekaligus menyapu sesi kedaluwarsa), kembalikan header Set-Cookie */
export async function startSession(userId: string) {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const maxAge = Math.round(sessionDays() * 24 * 60 * 60);
  await sessions.start(sha256(token), userId, new Date(Date.now() + maxAge * 1000).toISOString());
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
    await verifyPassword(password, await dummy());
    return null;
  }
  if (!(await verifyPassword(password, u.passwordHash))) return null;
  // parameter argon2 lama → hash ulang password yang baru terbukti benar (gagal menyimpan tidak menggagalkan login)
  if (needsRehash(u.passwordHash)) {
    await hashPassword(password)
      .then((h) => users.rehash(u.id, h))
      .catch(() => {});
  }
  return u;
}

/** Request membawa cookie sesi (valid atau tidak) — untuk membedakan "sesi berakhir" dari "belum login" */
export const hasSessionCookie = (req: Request) => !!readCookie(req, SESSION_COOKIE);
