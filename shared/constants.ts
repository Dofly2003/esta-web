/** Zona waktu studio: "hari ini", deadline lewat, dan tanggal tampil selalu memakai WIB, apa pun TZ server */
export const APP_TZ = "Asia/Jakarta";

export const BRAND = {
  name: "ESTA Studio",
  tagline: "Website & Software Studio",
  // Placeholder — email & nomor asli belum dicantumkan
  email: "hello@esta.id",
  phone: "+62 812-0000-0000",
  whatsapp: "6281200000000",
  address: "Surabaya, Indonesia",
  city: "Surabaya",
  instagram: "https://instagram.com/esta.team",
  instagramHandle: "@esta.team",
  linkedin: "https://linkedin.com/",
};

/** Nada status dashboard (kelas .tone-* di src/styles/dashboard.css). Merah (crit) hanya untuk lewat deadline / error. */
export type Tone = "neutral" | "info" | "accent" | "warn" | "ok" | "crit";
// cls = kelas nada status dashboard ("tone-" + Tone)
type Option = { label: string; cls: `tone-${Tone}` };

export const PROJECT_TYPES: Record<string, string> = {
  WEBSITE: "Website",
  WEB_APP: "Web App",
  MOBILE_APP: "Mobile App",
  UI_UX: "UI/UX Design",
  OTHER: "Lainnya",
};

export const PROJECT_STATUS: Record<string, Option> = {
  PLANNING: { label: "Perencanaan", cls: "tone-neutral" },
  IN_PROGRESS: { label: "Dikerjakan", cls: "tone-info" },
  // ungu = menunggu review (satu-satunya arti ungu); amber hanya "perlu perhatian"
  REVIEW: { label: "Review Klien", cls: "tone-accent" },
  DONE: { label: "Selesai", cls: "tone-ok" },
  ON_HOLD: { label: "Ditunda", cls: "tone-neutral" },
};

/** Status proyek yang masih berjalan (dihitung di ringkasan, filter `status=ACTIVE`, beban kerja) */
export const ACTIVE_PROJECT_STATUSES: readonly string[] = ["PLANNING", "IN_PROGRESS", "REVIEW"];
export const isActiveProject = (p: { status: string }) => ACTIVE_PROJECT_STATUSES.includes(p.status);

export const TASK_STATUS: Record<string, Option> = {
  TODO: { label: "Belum mulai", cls: "tone-neutral" },
  IN_PROGRESS: { label: "Dikerjakan", cls: "tone-info" },
  REVIEW: { label: "Review", cls: "tone-accent" },
  DONE: { label: "Selesai", cls: "tone-ok" },
};

export const PRIORITY: Record<string, Option> = {
  LOW: { label: "Rendah", cls: "tone-neutral" },
  // hanya Tinggi berwarna (amber = perlu perhatian)
  MEDIUM: { label: "Sedang", cls: "tone-neutral" },
  HIGH: { label: "Tinggi", cls: "tone-warn" },
};

/** Status inquiry yang bisa dipilih. "Selesai" (CLOSED) dipecah jadi Jadi proyek / Tidak lanjut; kolom status
 * berupa teks, jadi tanpa migrasi: baris lama berstatus CLOSED tetap terbaca lewat INQUIRY_STATUS_LEGACY. */
export const INQUIRY_STATUS: Record<string, Option> = {
  NEW: { label: "Baru", cls: "tone-info" },
  CONTACTED: { label: "Dihubungi", cls: "tone-neutral" },
  WON: { label: "Jadi proyek", cls: "tone-ok" },
  LOST: { label: "Tidak lanjut", cls: "tone-neutral" },
};
/** Status lama yang masih bisa ada di data (tidak ditawarkan untuk dipilih, kecuali di baris yang sudah memakainya) */
export const INQUIRY_STATUS_LEGACY: Record<string, Option> = {
  CLOSED: { label: "Selesai", cls: "tone-neutral" },
};
export const INQUIRY_STATUS_ALL: Record<string, Option> = { ...INQUIRY_STATUS, ...INQUIRY_STATUS_LEGACY };
/** Janji di website: dibalas maks. 1×24 jam (jam, bukan hari kalender) */
export const REPLY_WITHIN_HOURS = 24;

export const ROLES: Record<string, string> = { ADMIN: "Admin", MEMBER: "Anggota" };
export const isAdmin = (u: { role: string }) => u.role === "ADMIN";

/** Label dari peta di atas; kunci yang tidak dikenal ditampilkan apa adanya */
export function labelOf(map: Record<string, string | Option>, key: string) {
  const v = map[key];
  if (v == null) return key;
  return typeof v === "string" ? v : v.label;
}

export const MIN_PASSWORD = 8;

/** Beranda hanya menampilkan sekian karya unggulan pertama (urutan terkecil) */
export const MAX_FEATURED = 6;
/** Batas baris saat menempel daftar tugas (satu baris = satu tugas) */
export const MAX_TASK_LINES = 30;

export const PORTFOLIO_CATEGORIES = ["Website", "Web App", "Mobile App", "UI/UX"];
/** Kategori portofolio yang valid, selain itu "Website" */
export const portfolioCategory = (v: string) => (PORTFOLIO_CATEGORIES.includes(v) ? v : "Website");
/** Warna sampul karya bawaan (sama dengan default kolom cover_color di database) */
export const DEFAULT_COVER = "#6d5efc";
/** Warna "#rrggbb" (satu-satunya bentuk yang boleh masuk ke atribut style sampul) */
export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
/** Warna sampul yang sah, selain itu fallback (default DEFAULT_COVER) */
export const coverColorOr = (v: unknown, fallback = DEFAULT_COVER) => (isHexColor(v) ? v : fallback);

/** Panjang maksimum isian teks (dicek di server; nilai di atasnya ditolak dengan err=too-long).
 * Atribut maxlength di form memakai angka yang sama bila ada. */
export const MAX_LEN = {
  userName: 120,
  email: 200,
  password: 256,
  projectName: 160,
  client: 160,
  description: 10_000,
  taskTitle: 300,
  pfTitle: 160,
  pfSummary: 500,
  pfContent: 50_000,
  pfTags: 300,
  url: 2000,
} as const;

type Service = { title: string; group: "website" | "software" };

export const SERVICE_GROUPS = {
  website: {
    title: "Pembuatan Website",
    desc: "Website yang cepat dibuka di ponsel dan langsung menjelaskan apa yang bisnismu tawarkan.",
  },
  software: {
    title: "Pembuatan Software",
    desc: "Software yang dibangun mengikuti alur kerja timmu yang sudah berjalan.",
  },
} as const;

export const SERVICES: Service[] = [
  { title: "Website Company Profile", group: "website" },
  { title: "Landing Page", group: "website" },
  { title: "Website Bisnis", group: "website" },
  { title: "Aplikasi Web", group: "website" },
  { title: "Desain Website Responsif", group: "website" },
  { title: "Software Sesuai Kebutuhan", group: "software" },
  { title: "Aplikasi Desktop", group: "software" },
  { title: "Aplikasi Mobile", group: "software" },
  { title: "Sistem Informasi Bisnis", group: "software" },
  { title: "Solusi Digital Sesuai Kebutuhan", group: "software" },
];

// Bonus yang didapat setiap klien
export const PERKS = [
  { title: "Gratis Revisi Minor 5x", desc: "Revisi minor sampai 5 kali tanpa biaya tambahan." },
  { title: "Gratis Pendampingan", desc: "Didampingi dari diskusi awal sampai website atau aplikasi dipakai timmu." },
  { title: "Gratis Perbaikan Bug", desc: "Bug yang muncul setelah peluncuran kami perbaiki tanpa biaya tambahan." },
  { title: "Gratis Hosting & SSL", desc: "Langsung online dengan koneksi aman (https) tanpa repot mengurus server." },
];

export const BUDGETS = ["< Rp10 juta", "Rp10–25 juta", "Rp25–50 juta", "> Rp50 juta", "Belum tahu"];
