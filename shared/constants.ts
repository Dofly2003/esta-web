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

type Option = { label: string; cls: string };

export const PROJECT_TYPES: Record<string, string> = {
  WEBSITE: "Website",
  WEB_APP: "Web App",
  MOBILE_APP: "Mobile App",
  UI_UX: "UI/UX Design",
  OTHER: "Lainnya",
};

export const PROJECT_STATUS: Record<string, Option> = {
  PLANNING: { label: "Perencanaan", cls: "bg-slate-100 text-slate-700" },
  IN_PROGRESS: { label: "Dikerjakan", cls: "bg-blue-100 text-blue-700" },
  REVIEW: { label: "Review Klien", cls: "bg-amber-100 text-amber-800" },
  DONE: { label: "Selesai", cls: "bg-emerald-100 text-emerald-700" },
  ON_HOLD: { label: "Ditunda", cls: "bg-rose-100 text-rose-700" },
};

export const TASK_STATUS: Record<string, Option> = {
  TODO: { label: "To Do", cls: "bg-slate-100 text-slate-700" },
  IN_PROGRESS: { label: "Dikerjakan", cls: "bg-blue-100 text-blue-700" },
  REVIEW: { label: "Review", cls: "bg-amber-100 text-amber-800" },
  DONE: { label: "Selesai", cls: "bg-emerald-100 text-emerald-700" },
};

export const PRIORITY: Record<string, Option> = {
  LOW: { label: "Rendah", cls: "bg-slate-100 text-slate-600" },
  MEDIUM: { label: "Sedang", cls: "bg-violet-100 text-violet-700" },
  HIGH: { label: "Tinggi", cls: "bg-rose-100 text-rose-700" },
};

export const INQUIRY_STATUS: Record<string, Option> = {
  NEW: { label: "Baru", cls: "bg-blue-100 text-blue-700" },
  CONTACTED: { label: "Dihubungi", cls: "bg-amber-100 text-amber-800" },
  CLOSED: { label: "Selesai", cls: "bg-emerald-100 text-emerald-700" },
};

export const ROLES: Record<string, string> = { ADMIN: "Admin", MEMBER: "Anggota" };

export const PORTFOLIO_CATEGORIES = ["Website", "Web App", "Mobile App", "UI/UX"];

export type Service = { title: string; group: "website" | "software" };

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
