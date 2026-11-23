// Login berbasis sesi: token acak di cookie httpOnly, hanya hash-nya yang disimpan di database.
import { sessions, users } from "./repo";
import type { User } from "../shared/types";

export const SESSION_COOKIE = "esta_session";
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);
const secure = process.env.NODE_ENV === "production" && !process.env.INSECURE_COOKIE;

const sha256 = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");

export const hashPassword = (pw: string) => Bun.password.hash(pw, { algorithm: "argon2id" });
export const verifyPassword = (pw: string, hash: string) => Bun.password.verify(pw, hash).catch(() => false);

function readCookie(req: Request, name: string) {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function currentUser(req: Request): User | null {
  const token = readCookie(req, SESSION_COOKIE);
  return token ? sessions.user(sha256(token)) : null;
}

/** Buat sesi baru, kembalikan header Set-Cookie */
export function startSession(userId: string) {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  sessions.purgeExpired();
  sessions.create(sha256(token), userId, new Date(Date.now() + maxAge * 1000).toISOString());
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function endSession(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) sessions.remove(sha256(token));
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export async function login(email: string, password: string) {
  const u = users.byEmail(email.trim().toLowerCase());
  if (!u) {
    // tetap hitung hash agar waktu respons tidak membocorkan apakah email terdaftar
    await hashPassword(password);
    return null;
  }
  return (await verifyPassword(password, u.passwordHash)) ? u : null;
}
