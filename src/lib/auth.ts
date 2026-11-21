import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "./firebase-admin";
import { users } from "./data";

export const SESSION_COOKIE = "esta_session";
export const SESSION_DAYS = 7;

/** Verifikasi session cookie Firebase. null jika tidak login / kedaluwarsa. */
export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await adminAuth().verifySessionCookie(token, true);
  } catch {
    return null;
  }
}

/** Wajib login. Dipakai di halaman dashboard & semua server action internal. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await users.get(session.uid);
  if (!user) redirect("/login?error=no-profile");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}
