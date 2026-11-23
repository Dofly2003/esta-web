// Pindahkan data lama dari data/firestore-export.json (hasil ekspor Firebase) ke SQLite.
//   bun run db:import            → hanya jika database masih kosong
//   bun run db:import --force    → hapus isi database lalu impor ulang
//
// Password Firebase tidak bisa dipindahkan. admin@esta.id memakai SEED_PASSWORD dari .env;
// akun lain mendapat password sementara yang ditulis ke data/initial-passwords.txt.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { client, ready } from "../server/db";
import { hashPassword } from "../server/auth";
import { inquiries, portfolio, projects, settings, tasks, users } from "../server/repo";

const file = "data/firestore-export.json";
if (!existsSync(file)) {
  console.error(`File ${file} tidak ada.`);
  process.exit(1);
}
const force = process.argv.includes("--force");
await ready;
if ((await users.count()) > 0 && !force) {
  console.error("Database sudah berisi data. Tambahkan --force untuk menghapus dan mengimpor ulang.");
  process.exit(1);
}

type Doc = Record<string, any>;
const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, Doc[]>;
const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);
const iso = (v: unknown) => (typeof v === "string" && v ? v : new Date().toISOString());

const temp = () => Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString("base64url");
const lines: string[] = [];
const adminPassword = process.env.SEED_PASSWORD;

// Hash dulu (async), baru tulis semua dalam satu transaksi
const people = await Promise.all(
  (data.users ?? []).map(async (u) => {
    const isAdminSeed = u.email === "admin@esta.id" && adminPassword;
    const pw = isAdminSeed ? adminPassword! : temp();
    if (!isAdminSeed) lines.push(`${u.email}\t${pw}`);
    return { u, hash: await hashPassword(pw) };
  }),
);

{
  if (force)
    await client.executeMultiple(
      "DELETE FROM tasks; DELETE FROM portfolio; DELETE FROM projects; DELETE FROM inquiries; DELETE FROM sessions; DELETE FROM users; DELETE FROM settings;",
    );

  for (const { u, hash } of people) {
    await users.create({
      id: u.id,
      name: u.name,
      email: String(u.email).toLowerCase(),
      role: u.role ?? "MEMBER",
      passwordHash: hash,
      discordId: u.discordId ?? "",
      createdAt: iso(u.createdAt),
    });
  }
  const userIds = new Set(people.map((p) => p.u.id));
  const ref = (id: unknown) => (typeof id === "string" && userIds.has(id) ? id : null);

  for (const p of data.projects ?? []) {
    await projects.create({
      id: p.id,
      name: p.name,
      client: p.client ?? "",
      type: p.type ?? "WEBSITE",
      status: p.status ?? "PLANNING",
      description: p.description ?? "",
      budget: p.budget ?? null,
      startDate: day(p.startDate),
      dueDate: day(p.dueDate),
      leadId: ref(p.leadId),
      createdAt: iso(p.createdAt),
      updatedAt: iso(p.updatedAt),
    });
  }
  const projectIds = new Set((data.projects ?? []).map((p) => p.id));

  for (const t of data.tasks ?? []) {
    if (!projectIds.has(t.projectId)) continue;
    await tasks.create({
      id: t.id,
      title: t.title,
      description: t.description ?? "",
      status: t.status ?? "TODO",
      priority: t.priority ?? "MEDIUM",
      dueDate: day(t.dueDate),
      projectId: t.projectId,
      assigneeId: ref(t.assigneeId),
      createdAt: iso(t.createdAt),
      updatedAt: iso(t.updatedAt),
    });
  }

  for (const p of data.portfolio ?? []) {
    await portfolio.create({
      id: p.id,
      slug: p.slug,
      title: p.title,
      client: p.client ?? "",
      category: p.category ?? "Website",
      year: p.year ?? new Date().getFullYear(),
      summary: p.summary ?? "",
      content: p.content ?? "",
      tags: p.tags ?? "",
      coverColor: p.coverColor ?? "#6d5efc",
      imageUrl: p.imageUrl ?? null,
      liveUrl: p.liveUrl ?? null,
      featured: !!p.featured,
      published: !!p.published,
      sortOrder: p.sortOrder ?? 0,
      projectId: projectIds.has(p.projectId) ? p.projectId : null,
      createdAt: iso(p.createdAt),
      updatedAt: iso(p.updatedAt),
    });
  }

  for (const q of data.inquiries ?? []) {
    await inquiries.create({
      id: q.id,
      name: q.name,
      email: q.email,
      company: q.company ?? "",
      service: q.service ?? "",
      budget: q.budget ?? "",
      message: q.message ?? "",
      status: q.status ?? "NEW",
      createdAt: iso(q.createdAt),
    });
  }

  const discord = (data.settings ?? []).find((s) => s.id === "discord");
  if (discord) await settings.setDiscord({ webhookUrl: discord.webhookUrl ?? "", enabled: discord.enabled ?? true });
}

if (lines.length) {
  writeFileSync(
    "data/initial-passwords.txt",
    "# Password sementara — bagikan lewat jalur pribadi, lalu hapus file ini\n" + lines.join("\n") + "\n",
  );
}
console.log(
  `Impor selesai: ${people.length} akun, ${data.projects?.length ?? 0} proyek, ${data.tasks?.length ?? 0} tugas, ${data.portfolio?.length ?? 0} karya, ${data.inquiries?.length ?? 0} pesan.`,
);
if (lines.length) console.log(`Password sementara ${lines.length} akun ditulis ke data/initial-passwords.txt`);
