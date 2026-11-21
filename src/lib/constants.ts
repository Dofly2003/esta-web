export const BRAND = {
  name: "ESTA",
  tagline: "Digital Studio",
  email: "hello@esta.id",
  phone: "+62 812-0000-0000",
  whatsapp: "6281200000000",
  address: "Indonesia",
  instagram: "https://instagram.com/",
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

export const SERVICES = [
  {
    title: "Website Company Profile",
    desc: "Website cepat, rapi, dan mudah dikelola untuk membangun kepercayaan calon klien.",
    icon: "🌐",
  },
  {
    title: "Web Application",
    desc: "Dashboard, sistem internal, dan aplikasi web custom sesuai alur bisnis Anda.",
    icon: "⚙️",
  },
  {
    title: "Mobile App",
    desc: "Aplikasi Android & iOS dengan pengalaman pengguna yang mulus.",
    icon: "📱",
  },
  {
    title: "UI/UX Design",
    desc: "Riset, wireframe, dan prototipe interaktif sebelum satu baris kode ditulis.",
    icon: "🎨",
  },
];

export const BUDGETS = ["< Rp10 juta", "Rp10–25 juta", "Rp25–50 juta", "> Rp50 juta", "Belum tahu"];
