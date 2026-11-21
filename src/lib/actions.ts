"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminAuth } from "./firebase-admin";
import { inquiries, portfolio, projects, tasks, users } from "./data";
import { requireAdmin, requireUser, SESSION_COOKIE, SESSION_DAYS } from "./auth";
import { INQUIRY_STATUS, PRIORITY, PROJECT_STATUS, PROJECT_TYPES, ROLES, TASK_STATUS } from "./constants";
import { slugify } from "./format";

export type FormState = { error?: string; ok?: string } | undefined;

/* ---------- helper ---------- */
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const optStr = (fd: FormData, k: string) => str(fd, k) || null;
const date = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v ? new Date(v + "T00:00:00") : null;
};
const int = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(/[^\d]/g, "");
  return v ? parseInt(v, 10) : null;
};
const oneOf = (map: Record<string, unknown>, v: string, fallback: string) => (v in map ? v : fallback);

/* ---------- auth ---------- */
/** Dipanggil dari form login setelah signInWithEmailAndPassword di browser */
export async function createSession(idToken: string, next: string): Promise<FormState> {
  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    if (!(await users.get(decoded.uid))) {
      return { error: "Akun ini belum terdaftar sebagai anggota tim. Hubungi admin." };
    }
    const expiresIn = SESSION_DAYS * 24 * 60 * 60 * 1000;
    const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn });
    (await cookies()).set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: expiresIn / 1000,
    });
  } catch {
    return { error: "Sesi login tidak valid. Coba lagi." };
  }
  redirect(next.startsWith("/dashboard") ? next : "/dashboard");
}

export async function logout() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  if (token) {
    try {
      const { uid } = await adminAuth().verifySessionCookie(token);
      await adminAuth().revokeRefreshTokens(uid);
    } catch {}
  }
  redirect("/login");
}

/* ---------- inquiry (form kontak publik) ---------- */
export async function submitInquiry(_: FormState, fd: FormData): Promise<FormState> {
  if (str(fd, "website")) return { ok: "Terima kasih!" }; // honeypot anti-spam
  const name = str(fd, "name");
  const email = str(fd, "email");
  const message = str(fd, "message");
  if (!name || !email || !message) return { error: "Nama, email, dan pesan wajib diisi." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Format email tidak valid." };
  if (message.length > 5000) return { error: "Pesan terlalu panjang." };
  await inquiries.create({
    name: name.slice(0, 120),
    email: email.slice(0, 200),
    company: str(fd, "company").slice(0, 120),
    service: str(fd, "service").slice(0, 60),
    budget: str(fd, "budget").slice(0, 60),
    message,
    status: "NEW",
  });
  revalidatePath("/dashboard", "layout");
  return { ok: "Pesan terkirim! Tim kami akan menghubungi Anda dalam 1×24 jam kerja." };
}

export async function updateInquiryStatus(fd: FormData) {
  await requireUser();
  await inquiries.update(str(fd, "id"), { status: oneOf(INQUIRY_STATUS, str(fd, "status"), "NEW") });
  revalidatePath("/dashboard", "layout");
}

export async function deleteInquiry(fd: FormData) {
  await requireUser();
  await inquiries.remove(str(fd, "id"));
  revalidatePath("/dashboard", "layout");
}

/* ---------- proyek ---------- */
function projectData(fd: FormData) {
  return {
    name: str(fd, "name"),
    client: str(fd, "client"),
    type: oneOf(PROJECT_TYPES, str(fd, "type"), "WEBSITE"),
    status: oneOf(PROJECT_STATUS, str(fd, "status"), "PLANNING"),
    description: str(fd, "description"),
    budget: int(fd, "budget"),
    startDate: date(fd, "startDate"),
    dueDate: date(fd, "dueDate"),
    leadId: optStr(fd, "leadId"),
  };
}

export async function createProject(fd: FormData) {
  await requireUser();
  const data = projectData(fd);
  if (!data.name || !data.client) throw new Error("Nama proyek dan klien wajib diisi");
  const id = await projects.create(data);
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/projects/${id}`);
}

export async function updateProject(fd: FormData) {
  await requireUser();
  const data = projectData(fd);
  if (!data.name || !data.client) throw new Error("Nama proyek dan klien wajib diisi");
  await projects.update(str(fd, "id"), data);
  revalidatePath("/", "layout");
}

export async function deleteProject(fd: FormData) {
  await requireUser();
  await projects.remove(str(fd, "id"));
  revalidatePath("/", "layout");
  redirect("/dashboard/projects");
}

/* ---------- tugas / todo ---------- */
export async function createTask(fd: FormData) {
  await requireUser();
  const title = str(fd, "title");
  if (!title) return;
  await tasks.create({
    title,
    description: str(fd, "description"),
    projectId: str(fd, "projectId"),
    assigneeId: optStr(fd, "assigneeId"),
    priority: oneOf(PRIORITY, str(fd, "priority"), "MEDIUM"),
    status: oneOf(TASK_STATUS, str(fd, "status"), "TODO"),
    dueDate: date(fd, "dueDate"),
  });
  revalidatePath("/dashboard", "layout");
}

export async function updateTaskStatus(fd: FormData) {
  await requireUser();
  await tasks.update(str(fd, "id"), { status: oneOf(TASK_STATUS, str(fd, "status"), "TODO") });
  revalidatePath("/dashboard", "layout");
}

export async function updateTask(fd: FormData) {
  await requireUser();
  await tasks.update(str(fd, "id"), {
    title: str(fd, "title"),
    description: str(fd, "description"),
    assigneeId: optStr(fd, "assigneeId"),
    priority: oneOf(PRIORITY, str(fd, "priority"), "MEDIUM"),
    status: oneOf(TASK_STATUS, str(fd, "status"), "TODO"),
    dueDate: date(fd, "dueDate"),
  });
  revalidatePath("/dashboard", "layout");
}

export async function deleteTask(fd: FormData) {
  await requireUser();
  await tasks.remove(str(fd, "id"));
  revalidatePath("/dashboard", "layout");
}

/* ---------- portofolio ---------- */
async function uniqueSlug(base: string, ignoreId?: string) {
  const root = slugify(base) || "karya";
  let slug = root;
  for (let i = 2; ; i++) {
    const found = await portfolio.bySlug(slug);
    if (!found || found.id === ignoreId) return slug;
    slug = `${root}-${i}`;
  }
}

const safeUrl = (v: string | null) => (v && /^(https?:\/\/|\/)/.test(v) ? v : null);

export async function savePortfolio(fd: FormData) {
  await requireUser();
  const id = str(fd, "id");
  const title = str(fd, "title");
  if (!title) throw new Error("Judul wajib diisi");
  const data = {
    title,
    slug: await uniqueSlug(str(fd, "slug") || title, id || undefined),
    client: str(fd, "client"),
    category: str(fd, "category") || "Website",
    year: int(fd, "year") ?? new Date().getFullYear(),
    summary: str(fd, "summary"),
    content: str(fd, "content"),
    tags: str(fd, "tags"),
    coverColor: str(fd, "coverColor") || "#6d5efc",
    imageUrl: safeUrl(optStr(fd, "imageUrl")),
    liveUrl: safeUrl(optStr(fd, "liveUrl")),
    featured: fd.get("featured") === "on",
    published: fd.get("published") === "on",
    sortOrder: int(fd, "sortOrder") ?? 0,
    projectId: optStr(fd, "projectId"),
  };
  if (id) await portfolio.update(id, data);
  else await portfolio.create(data);
  revalidatePath("/", "layout");
  redirect("/dashboard/portfolio");
}

export async function togglePortfolio(fd: FormData) {
  await requireUser();
  const id = str(fd, "id");
  const field = str(fd, "field") === "featured" ? "featured" : "published";
  const item = await portfolio.get(id);
  if (!item) return;
  await portfolio.update(id, { [field]: !item[field] });
  revalidatePath("/", "layout");
}

export async function deletePortfolio(fd: FormData) {
  await requireUser();
  await portfolio.remove(str(fd, "id"));
  revalidatePath("/", "layout");
  redirect("/dashboard/portfolio");
}

/** Buat draf portofolio dari proyek */
export async function portfolioFromProject(fd: FormData) {
  await requireUser();
  const project = await projects.get(str(fd, "projectId"));
  if (!project) return;
  const typeLabel = PROJECT_TYPES[project.type] ?? "Website";
  const id = await portfolio.create({
    title: project.name,
    slug: await uniqueSlug(project.name),
    client: project.client,
    category: typeLabel === "UI/UX Design" ? "UI/UX" : typeLabel === "Lainnya" ? "Website" : typeLabel,
    year: (project.dueDate ?? new Date()).getFullYear(),
    summary: project.description.slice(0, 200),
    content: project.description,
    tags: "",
    coverColor: "#6d5efc",
    imageUrl: null,
    liveUrl: null,
    featured: false,
    published: false,
    sortOrder: 0,
    projectId: project.id,
  });
  redirect(`/dashboard/portfolio/${id}`);
}

/* ---------- tim ---------- */
export async function createUser(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!name || !email || password.length < 8) return { error: "Lengkapi data. Password minimal 8 karakter." };
  try {
    const rec = await adminAuth().createUser({ email, password, displayName: name });
    await users.set(rec.uid, { name, email, role: oneOf(ROLES, str(fd, "role"), "MEMBER") });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "auth/email-already-exists") return { error: "Email sudah terdaftar." };
    if (code === "auth/invalid-email") return { error: "Format email tidak valid." };
    return { error: "Gagal membuat akun" + (code ? ` (${code})` : "") };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: `Akun ${name} berhasil dibuat.` };
}

export async function deleteUser(fd: FormData) {
  const me = await requireAdmin();
  const id = str(fd, "id");
  if (id === me.id) return;
  await users.remove(id);
  try {
    await adminAuth().deleteUser(id);
  } catch {}
  revalidatePath("/dashboard", "layout");
}
