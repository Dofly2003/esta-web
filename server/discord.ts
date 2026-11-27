// Kirim notifikasi ke channel Discord lewat webhook.
// Webhook diatur admin di Dashboard → Tim & Akun (disimpan di tabel settings),
// atau lewat env DISCORD_WEBHOOK_URL sebagai cadangan.
import { settings } from "./repo";
import type { Inquiry, Project, Task, User } from "../shared/types";
import { labelOf, PRIORITY, PROJECT_STATUS, PROJECT_TYPES } from "../shared/constants";
import { cutText, fmtDate } from "../shared/format";

const COLORS = { HIGH: 0xe11d48, MEDIUM: 0x6d5efc, LOW: 0x64748b, PROJECT: 0x22d3ee, TEST: 0x10b981, INQUIRY: 0x38bdf8 };

function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  return process.env.NODE_ENV === "production"
    ? `http://localhost:${process.env.PORT || 3000}`
    : "http://localhost:4321";
}

export function isWebhookUrl(url: string) {
  return /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url);
}

/** Teks mention: <@id> jika Discord ID diisi, kalau tidak nama biasa (tebal) */
function who(user: Pick<User, "name" | "discordId"> | null | undefined) {
  if (!user) return "—";
  return user.discordId ? `<@${user.discordId}>` : `**${user.name}**`;
}
/** Discord ID yang boleh di-mention (hanya orang yang dimaksud) */
const mentions = (user: Pick<User, "discordId">) => (user.discordId ? [user.discordId] : []);
const deadline = (d: string | null) => (d ? fmtDate(d) : "Tidak ada");
const projectUrl = (id: string) => `${siteUrl()}/dashboard/projects/${id}`;
/** Link langsung ke baris tugas (detail proyek menggulir & memfokus #task-<id>) */
const taskUrl = (projectId: string, taskId: string) => `${projectUrl(projectId)}#task-${taskId}`;
/** Teks dari luar (nama, judul) tanpa karakter markdown Discord yang bisa merusak format */
const plain = (v: string, max = 200) => cutText(v.replace(/[*_`~|>\\]/g, ""), max) || "—";

type Embed = {
  title: string;
  url?: string;
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
};

async function send(content: string, embed: Embed, mentionIds: string[], webhookOverride?: string, timeoutMs = 8000) {
  const cfg = await settings.discord();
  const url = webhookOverride ?? cfg.webhookUrl;
  if (!url || (!webhookOverride && !cfg.enabled)) return { ok: false, reason: "off" as const };
  const res = await fetch(`${url}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "ESTA Tugas",
      content,
      embeds: [{ ...embed, timestamp: new Date().toISOString() }],
      // hanya mention user yang dimaksud; @everyone/@role tidak pernah diaktifkan
      allowed_mentions: { parse: [], users: mentionIds },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { ok: true as const };
}

/** Tidak pernah melempar error: kegagalan Discord tidak boleh menggagalkan simpan data */
async function safe(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.error("[discord] gagal kirim notifikasi:", e);
  }
}

export function notifyTaskAssigned(opts: {
  task: Pick<Task, "id" | "title" | "priority" | "dueDate"> & { description?: string };
  project: Pick<Project, "id" | "name" | "client">;
  assignee: User;
  by: User;
}) {
  const { task, project, assignee, by } = opts;
  const fields = [
    { name: "📁 Proyek", value: `${project.name}\n${project.client}`, inline: true },
    { name: "📅 Deadline", value: deadline(task.dueDate), inline: true },
    { name: "⚡ Prioritas", value: labelOf(PRIORITY, task.priority), inline: true },
  ];
  return safe(() =>
    send(
      `📌 ${who(assignee)}, ada tugas baru untuk Anda.`,
      {
        title: task.title,
        url: taskUrl(project.id, task.id),
        description: task.description ? task.description.slice(0, 500) : undefined,
        color: COLORS[task.priority as keyof typeof COLORS] ?? COLORS.MEDIUM,
        fields,
        footer: { text: `Ditugaskan oleh ${by.name}` },
      },
      mentions(assignee),
    ),
  );
}

export function notifyProjectLead(opts: {
  project: Pick<Project, "id" | "name" | "client" | "type" | "status" | "dueDate">;
  lead: User;
  by: User;
}) {
  const { project, lead, by } = opts;
  return safe(() =>
    send(
      `🧭 ${who(lead)}, Anda sekarang **PJ (penanggung jawab)** proyek ini.`,
      {
        title: project.name,
        url: projectUrl(project.id),
        color: COLORS.PROJECT,
        fields: [
          { name: "🏢 Klien", value: project.client, inline: true },
          { name: "🧩 Jenis", value: labelOf(PROJECT_TYPES, project.type), inline: true },
          { name: "📅 Deadline", value: deadline(project.dueDate), inline: true },
          { name: "📊 Status", value: labelOf(PROJECT_STATUS, project.status), inline: true },
        ],
        footer: { text: `Ditetapkan oleh ${by.name}` },
      },
      mentions(lead),
    ),
  );
}

/** Beberapa tugas sekaligus (daftar ditempel, satu baris = satu tugas) untuk satu orang: SATU pesan ringkasan */
export function notifyTasksAssigned(opts: {
  tasks: (Pick<Task, "id" | "title" | "priority" | "dueDate">)[];
  project: Pick<Project, "id" | "name" | "client">;
  assignee: User;
  by: User;
}) {
  const { tasks, project, assignee, by } = opts;
  const lines = tasks.slice(0, 15).map((t) => `• [${plain(t.title, 120)}](${taskUrl(project.id, t.id)})`);
  if (tasks.length > lines.length) lines.push(`… dan ${tasks.length - lines.length} lainnya`);
  return safe(() =>
    send(
      `📌 ${who(assignee)}, ada ${tasks.length} tugas baru untuk Anda.`,
      {
        title: `${project.name}: ${tasks.length} tugas baru`,
        url: projectUrl(project.id),
        description: lines.join("\n").slice(0, 3900),
        color: COLORS.MEDIUM,
        fields: [{ name: "📁 Proyek", value: `${project.name}\n${project.client}`, inline: true }],
        footer: { text: `Ditugaskan oleh ${by.name}` },
      },
      mentions(assignee),
    ),
  );
}

/** Inquiry baru dari form Kontak publik. Batas waktu pendek; pemanggil TIDAK menunggu (fire-and-forget),
 * jadi form publik tidak melambat dan kegagalan hanya dicatat di log. Mengikuti setelan aktif/webhook. */
export function notifyInquiry(q: Pick<Inquiry, "id" | "name" | "email" | "company" | "service" | "budget" | "message">) {
  const fields = [
    { name: "🏢 Bisnis", value: plain(q.company || "—", 100), inline: true },
    { name: "🧩 Layanan", value: plain(q.service || "—", 100), inline: true },
    { name: "💰 Budget", value: plain(q.budget || "—", 60), inline: true },
  ];
  return safe(() =>
    send(
      `📨 Inquiry baru dari **${plain(q.name, 80)}**. Website menjanjikan balasan maks. 1×24 jam.`,
      {
        title: `Inquiry: ${plain(q.name, 80)}${q.company ? ` · ${plain(q.company, 80)}` : ""}`,
        url: `${siteUrl()}/dashboard/inbox?status=NEW#inq-${q.id}`,
        description: plain(q.message, 500),
        color: COLORS.INQUIRY,
        fields,
      },
      [],
      undefined,
      4000,
    ),
  );
}

/** Pesan uji dari halaman Tim & Akun. Melempar error agar admin tahu jika gagal. */
export function sendTest(webhookUrl: string, by: User) {
  return send(
    `✅ Notifikasi ESTA sudah tersambung. ${who(by)}, Anda akan di-mention di sini saat ada tugas.`,
    {
      title: "Tes notifikasi ESTA",
      url: `${siteUrl()}/dashboard`,
      description: "Pesan ini dikirim dari Dashboard → Tim & Akun.",
      color: COLORS.TEST,
    },
    mentions(by),
    webhookUrl,
  );
}
