// Lapisan data Firestore. Semua akses database lewat file ini (hanya di server).
// Data agensi relatif kecil, jadi filter/urut dilakukan di memori — tidak perlu index komposit.
import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { firestore } from "./firebase-admin";

/* ---------- tipe ---------- */
export type User = { id: string; name: string; email: string; role: string; createdAt: Date };

export type Project = {
  id: string;
  name: string;
  client: string;
  type: string;
  status: string;
  description: string;
  budget: number | null;
  startDate: Date | null;
  dueDate: Date | null;
  leadId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  projectId: string;
  assigneeId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PortfolioItem = {
  id: string;
  slug: string;
  title: string;
  client: string;
  category: string;
  year: number;
  summary: string;
  content: string;
  tags: string;
  coverColor: string;
  imageUrl: string | null;
  liveUrl: string | null;
  featured: boolean;
  published: boolean;
  sortOrder: number;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Inquiry = {
  id: string;
  name: string;
  email: string;
  company: string;
  service: string;
  budget: string;
  message: string;
  status: string;
  createdAt: Date;
};

type Input<T> = Omit<T, "id" | "createdAt" | "updatedAt">;

/* ---------- helper ---------- */
const col = (name: string) => firestore().collection(name);

function toDate(v: unknown): Date | null {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

/** Ubah dokumen Firestore → objek biasa, Timestamp → Date */
function fromDoc<T>(snap: DocumentSnapshot): T {
  const raw = snap.data() ?? {};
  const out: Record<string, unknown> = { id: snap.id };
  for (const [k, v] of Object.entries(raw)) out[k] = v instanceof Timestamp ? v.toDate() : v;
  return out as T;
}

async function all<T>(name: string): Promise<T[]> {
  const snap = await col(name).get();
  return snap.docs.map((d) => fromDoc<T>(d));
}

async function one<T>(name: string, id: string): Promise<T | null> {
  if (!id) return null;
  const snap = await col(name).doc(id).get();
  return snap.exists ? fromDoc<T>(snap) : null;
}

const byDateAsc = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b?.getTime() ?? Number.MAX_SAFE_INTEGER);

/* ---------- users (doc id = uid Firebase Auth) ---------- */
export const users = {
  async list() {
    return (await all<User>("users")).sort((a, b) => a.name.localeCompare(b.name));
  },
  get: (id: string) => one<User>("users", id),
  async set(id: string, data: Omit<User, "id" | "createdAt">) {
    await col("users").doc(id).set({ ...data, createdAt: new Date() }, { merge: true });
  },
  async remove(id: string) {
    const db = firestore();
    const batch = db.batch();
    batch.delete(col("users").doc(id));
    (await col("tasks").where("assigneeId", "==", id).get()).docs.forEach((d) =>
      batch.update(d.ref, { assigneeId: null }),
    );
    (await col("projects").where("leadId", "==", id).get()).docs.forEach((d) =>
      batch.update(d.ref, { leadId: null }),
    );
    await batch.commit();
  },
};

/* ---------- proyek ---------- */
export const projects = {
  async list() {
    return (await all<Project>("projects")).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  },
  get: (id: string) => one<Project>("projects", id),
  async create(data: Input<Project>) {
    const now = new Date();
    const ref = await col("projects").add({ ...data, createdAt: now, updatedAt: now });
    return ref.id;
  },
  async update(id: string, data: Partial<Input<Project>>) {
    await col("projects").doc(id).update({ ...data, updatedAt: new Date() });
  },
  async remove(id: string) {
    const batch = firestore().batch();
    batch.delete(col("projects").doc(id));
    (await col("tasks").where("projectId", "==", id).get()).docs.forEach((d) => batch.delete(d.ref));
    (await col("portfolio").where("projectId", "==", id).get()).docs.forEach((d) =>
      batch.update(d.ref, { projectId: null }),
    );
    await batch.commit();
  },
};

/* ---------- tugas ---------- */
const sortTasks = (list: Task[]) =>
  list.sort((a, b) => byDateAsc(a.dueDate, b.dueDate) || a.createdAt.getTime() - b.createdAt.getTime());

export const tasks = {
  async list() {
    return sortTasks(await all<Task>("tasks"));
  },
  async byProject(projectId: string) {
    const snap = await col("tasks").where("projectId", "==", projectId).get();
    return sortTasks(snap.docs.map((d) => fromDoc<Task>(d)));
  },
  async create(data: Input<Task>) {
    const now = new Date();
    await col("tasks").add({ ...data, createdAt: now, updatedAt: now });
    await col("projects").doc(data.projectId).update({ updatedAt: now });
  },
  async update(id: string, data: Partial<Input<Task>>) {
    await col("tasks").doc(id).update({ ...data, updatedAt: new Date() });
  },
  async remove(id: string) {
    await col("tasks").doc(id).delete();
  },
};

/* ---------- portofolio ---------- */
const sortPortfolio = (list: PortfolioItem[]) =>
  list.sort((a, b) => a.sortOrder - b.sortOrder || b.year - a.year);

export const portfolio = {
  async list(opts: { published?: boolean } = {}) {
    let list = await all<PortfolioItem>("portfolio");
    if (opts.published) list = list.filter((p) => p.published);
    return sortPortfolio(list);
  },
  get: (id: string) => one<PortfolioItem>("portfolio", id),
  async bySlug(slug: string) {
    const snap = await col("portfolio").where("slug", "==", slug).limit(1).get();
    return snap.empty ? null : fromDoc<PortfolioItem>(snap.docs[0]);
  },
  async byProject(projectId: string) {
    const snap = await col("portfolio").where("projectId", "==", projectId).get();
    return snap.docs.map((d) => fromDoc<PortfolioItem>(d));
  },
  async create(data: Input<PortfolioItem>) {
    const now = new Date();
    const ref = await col("portfolio").add({ ...data, createdAt: now, updatedAt: now });
    return ref.id;
  },
  async update(id: string, data: Partial<Input<PortfolioItem>>) {
    await col("portfolio").doc(id).update({ ...data, updatedAt: new Date() });
  },
  async remove(id: string) {
    await col("portfolio").doc(id).delete();
  },
};

/* ---------- inquiry ---------- */
export const inquiries = {
  async list() {
    return (await all<Inquiry>("inquiries")).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },
  async create(data: Omit<Inquiry, "id" | "createdAt">) {
    await col("inquiries").add({ ...data, createdAt: new Date() });
  },
  async update(id: string, data: Partial<Omit<Inquiry, "id">>) {
    await col("inquiries").doc(id).update(data);
  },
  async remove(id: string) {
    await col("inquiries").doc(id).delete();
  },
};

export { toDate };
