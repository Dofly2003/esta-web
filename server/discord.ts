// Kirim notifikasi ke channel Discord lewat webhook.
// Webhook diatur admin di Dashboard → Tim & Akun (disimpan di tabel settings),
// atau lewat env DISCORD_WEBHOOK_URL sebagai cadangan.
import { settings } from "./repo";
import type { User } from "../shared/types";
import { PRIORITY, PROJECT_STATUS, PROJECT_TYPES } from "../shared/constants";
import { fmtDate } from "../shared/format";

const COLORS = { HIGH: 0xe11d48, MEDIUM: 0x6d5efc, LOW: 0x64748b, PROJECT: 0x22d3ee, TEST: 0x10b981 };

export function siteUrl() {
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

type Embed = {
  title: string;
  url?: string;
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
};

async function send(content: string, embed: Embed, mentionIds: string[], webhookOverride?: string) {
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
    signal: AbortSignal.timeout(8000),
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
  task: { id: string; title: string; description?: string; priority: string; dueDate: string | null };
  project: { id: string; name: string; client: string };
  assignee: User;
  by: User;
}) {
  const { task, project, assignee, by } = opts;
  const fields = [
    { name: "📁 Proyek", value: `${project.name}\n${project.client}`, inline: true },
    { name: "📅 Deadline", value: task.dueDate ? fmtDate(task.dueDate) : "Tidak ada", inline: true },
    { name: "⚡ Prioritas", value: PRIORITY[task.priority]?.label ?? task.priority, inline: true },
  ];
  return safe(() =>
    send(
      `📌 ${who(assignee)}, ada tugas baru untuk kamu!`,
      {
        title: task.title,
        url: `${siteUrl()}/dashboard/projects/${project.id}`,
        description: task.description ? task.description.slice(0, 500) : undefined,
        color: COLORS[task.priority as keyof typeof COLORS] ?? COLORS.MEDIUM,
        fields,
        footer: { text: `Ditugaskan oleh ${by.name}` },
      },
      assignee.discordId ? [assignee.discordId] : [],
    ),
  );
}

export function notifyProjectLead(opts: {
  project: { id: string; name: string; client: string; type: string; status: string; dueDate: string | null };
  lead: User;
  by: User;
}) {
  const { project, lead, by } = opts;
  return safe(() =>
    send(
      `🧭 ${who(lead)}, kamu sekarang **PJ (penanggung jawab)** proyek ini.`,
      {
        title: project.name,
        url: `${siteUrl()}/dashboard/projects/${project.id}`,
        color: COLORS.PROJECT,
        fields: [
          { name: "🏢 Klien", value: project.client, inline: true },
          { name: "🧩 Jenis", value: PROJECT_TYPES[project.type] ?? project.type, inline: true },
          { name: "📅 Deadline", value: project.dueDate ? fmtDate(project.dueDate) : "Tidak ada", inline: true },
          { name: "📊 Status", value: PROJECT_STATUS[project.status]?.label ?? project.status, inline: true },
        ],
        footer: { text: `Ditetapkan oleh ${by.name}` },
      },
      lead.discordId ? [lead.discordId] : [],
    ),
  );
}

/** Pesan uji dari halaman Tim & Akun. Melempar error agar admin tahu jika gagal. */
export function sendTest(webhookUrl: string, by: User) {
  return send(
    `✅ Notifikasi ESTA sudah tersambung. ${who(by)}, kamu akan di-mention di sini saat ada tugas.`,
    {
      title: "Tes notifikasi ESTA",
      url: `${siteUrl()}/dashboard`,
      description: "Pesan ini dikirim dari Dashboard → Tim & Akun.",
      color: COLORS.TEST,
    },
    by.discordId ? [by.discordId] : [],
    webhookUrl,
  );
}
