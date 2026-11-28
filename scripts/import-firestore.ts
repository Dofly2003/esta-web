// Pindahkan data lama dari data/firestore-export.json (hasil ekspor Firebase) ke SQLite.
//   bun run db:import            → hanya jika database masih kosong
//   bun run db:import --force    → hapus isi database lalu impor ulang
//
// Password Firebase tidak bisa dipindahkan. admin@esta.id memakai SEED_PASSWORD dari .env;
// akun lain mendapat password sementara yang ditulis ke data/initial-passwords.txt.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { hashPassword } from "../server/auth";
import { batch, type Stmt } from "../server/db";
import { inquiries, portfolio, projects, settings, tasks, users, WIPE_STMTS } from "../server/repo";
import { coverColorOr } from "../shared/constants";
import { currentYear, isLink } from "../shared/format";
import { openForWrite } from "./_db";

const file = "data/firestore-export.json";
if (!existsSync(file)) {
  console.error(`File ${file} tidak ada.`);
  process.exit(1);
}
const force = await openForWrite("mengimpor ulang");

type Doc = Record<string, any>;
const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, Doc[]>;
const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);
const iso = (v: unknown) => (typeof v === "string" && v ? v : new Date().toISOString());
/** Link dari data lama: hanya http(s) (gambar boleh path lokal "/…"); selain itu dibuang */
const link = (v: unknown, relative = false) => (typeof v === "string" && isLink(v, relative) ? v : null);
/** Bilangan bulat dari data lama, selain itu fallback */
const int = (v: unknown, fallback: number) => (Number.isInteger(v) ? (v as number) : fallback);

const temp = () => Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString("base64url");
const lines: string[] = [];
const adminPassword = process.env.SEED_PASSWORD;

// Hash dulu (async), lalu kumpulkan semua perintah tulis dan jalankan dalam SATU transaksi (batch):
// impor yang gagal di tengah jalan tidak meninggalkan database setengah terisi / setengah terhapus.
const people = await Promise.all(
  (data.users ?? []).map(async (u) => {
    const isAdminSeed = u.email === "admin@esta.id" && adminPassword;
    const pw = isAdminSeed ? adminPassword! : temp();
    if (!isAdminSeed) lines.push(`${u.email}\t${pw}`);
    return { u, hash: await hashPassword(pw) };
  }),
);

const stmts: Stmt[] = force ? [...WIPE_STMTS] : [];
{
  for (const { u, hash } of people) {
    stmts.push(
      users.insert({
        id: u.id,
        name: u.name,
        email: String(u.email).toLowerCase(),
        role: u.role ?? "MEMBER",
        passwordHash: hash,
        discordId: u.discordId ?? "",
        createdAt: iso(u.createdAt),
      }),
    );
  }
  const userIds = new Set(people.map((p) => p.u.id));
  const ref = (id: unknown) => (typeof id === "string" && userIds.has(id) ? id : null);

  for (const p of data.projects ?? []) {
    stmts.push(
      projects.insert({
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
      }),
    );
  }
  const projectIds = new Set((data.projects ?? []).map((p) => p.id));

  for (const t of data.tasks ?? []) {
    if (!projectIds.has(t.projectId)) continue;
    stmts.push(
      tasks.insert({
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
      }),
    );
  }

  for (const p of data.portfolio ?? []) {
    stmts.push(
      portfolio.insert({
        id: p.id,
        slug: p.slug,
        title: p.title,
        client: p.client ?? "",
        category: p.category ?? "Website",
        year: int(p.year, currentYear()),
        summary: p.summary ?? "",
        content: p.content ?? "",
        tags: p.tags ?? "",
        // nilai ini masuk ke atribut style sampul: hanya "#rrggbb"
        coverColor: coverColorOr(p.coverColor),
        imageUrl: link(p.imageUrl, true),
        liveUrl: link(p.liveUrl),
        featured: !!p.featured,
        published: !!p.published,
        sortOrder: int(p.sortOrder, 0),
        projectId: projectIds.has(p.projectId) ? p.projectId : null,
        createdAt: iso(p.createdAt),
        updatedAt: iso(p.updatedAt),
      }),
    );
  }

  for (const q of data.inquiries ?? []) {
    stmts.push(
      inquiries.insert({
        id: q.id,
        name: q.name,
        email: q.email,
        company: q.company ?? "",
        service: q.service ?? "",
        budget: q.budget ?? "",
        message: q.message ?? "",
        status: q.status ?? "NEW",
        createdAt: iso(q.createdAt),
      }),
    );
  }

  const discord = (data.settings ?? []).find((s) => s.id === "discord");
  if (discord)
    stmts.push(settings.discordStmt({ webhookUrl: discord.webhookUrl ?? "", enabled: discord.enabled ?? true }));
}
await batch(stmts);

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
