// Bentuk data yang dikirim API (JSON). Dipakai backend & frontend.

export type User = {
  id: string;
  name: string;
  email: string;
  role: string; // ADMIN | MEMBER
  discordId: string;
  createdAt: string;
};

export type Project = {
  id: string;
  name: string;
  client: string;
  type: string;
  status: string;
  description: string;
  budget: number | null;
  startDate: string | null;
  dueDate: string | null;
  leadId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
};

export type DiscordSettings = { webhookUrl: string; enabled: boolean };

/* ---- respons gabungan ---- */
export type TaskWithProject = Task & { projectName: string };
export type TaskWithRefs = TaskWithProject & { assignee: User | null };
export type ProjectWithTasks = Project & { lead: User | null; tasks: Task[] };
export type ProjectWithRefs = Project & { lead: User | null; tasks: TaskWithRefs[] };
export type TeamMember = User & {
  /** tugas hidup (belum selesai, proyek berjalan) yang di-assign ke orang ini */
  openTasks: number;
  /** bagian dari openTasks yang lewat deadline (WIB) */
  overdue: number;
  /** semua proyek yang ia pimpin (PJ) — jadi tanpa PJ bila akunnya dihapus */
  ledProjects: number;
  /** semua tugas belum selesai yang di-assign ke orang ini, di proyek apa pun — jadi tanpa PJ bila akunnya dihapus */
  assignedOpenTasks: number;
};
/** Proyek berjalan di ringkasan + sinyal jadwal */
export type ActiveProject = ProjectWithTasks & {
  doneTasks: number;
  totalTasks: number;
  /** waktu berjalan 0–1 (startDate → dueDate, WIB); null bila salah satu tanggal kosong */
  elapsed: number | null;
  /** hari sampai dueDate (negatif = lewat); null bila tanpa deadline */
  daysLeft: number | null;
  /** lewat deadline (WIB) */
  late: boolean;
  /** belum lewat, tapi progres tertinggal dari waktu (lihat projectHealth di server/api.ts) */
  atRisk: boolean;
};
/** Hitungan tugas hidup (tim) untuk filter drill-down */
export type TaskCounts = { overdue: number; dueThisWeek: number; unassigned: number };

/* ---- respons per rute (handler: `satisfies`, halaman: api<…>()) ---- */
/** GET /api/public/home */
export type PublicHome = { featured: PortfolioItem[]; stats: { done: number; clients: number } };
/** GET /api/public/portfolio/:slug */
export type PublicPortfolioDetail = { item: PortfolioItem; others: PortfolioItem[] };
/** GET /api/nav */
export type NavSummary = { newInquiries: number };
/** GET /api/dashboard */
export type DashboardSummary = {
  /** proyek berjalan: lewat deadline dulu, lalu berisiko, lalu deadline terdekat */
  active: ActiveProject[];
  /** jumlah proyek berjalan (= active.length) */
  activeProjects: number;
  /** proyek berjalan yang lewat deadline atau berisiko */
  projectsAtRisk: number;
  /** tugas hidup (tim) — belum selesai dan proyeknya berjalan */
  openTasks: number;
  /** tugas hidup lewat deadline (WIB) */
  overdue: number;
  /** tugas hidup jatuh tempo hari ini s.d. 7 hari lagi */
  dueThisWeek: number;
  /** tugas hidup jatuh tempo hari ini */
  dueToday: number;
  /** tugas hidup tanpa penanggung jawab */
  unassigned: number;
  /** tugas belum selesai di proyek Ditunda (tidak dihitung di atas) */
  onHoldTasks: number;
  /** proyek Selesai yang belum punya karya portofolio */
  doneWithoutPortfolio: number;
  /** total inquiry berstatus NEW */
  newInquiries: number;
  /** createdAt inquiry NEW tertua (ISO), null bila tidak ada */
  oldestNewInquiryAt: string | null;
  /** total tugas hidup milik saya (myTasks dibatasi 8) */
  myOpenTasks: number;
  /** tugas hidup milik saya yang lewat deadline */
  myOverdue: number;
  /** tugas hidup milik saya, deadline hari ini s.d. 7 hari lagi / hari ini */
  myDueThisWeek: number;
  myDueToday: number;
  /** tugas hidup berstatus Review (menunggu diperiksa) */
  reviewTasks: number;
  /** updatedAt tugas Review paling lama (≈ sejak kapan menunggu), null bila tidak ada */
  oldestReviewAt: string | null;
  /** maks. 4 tugas Review, paling lama menunggu dulu */
  review: TaskWithProject[];
  /** maks. 8: lewat deadline dulu, lalu deadline, lalu prioritas */
  myTasks: TaskWithProject[];
  /** maks. 4 inquiry NEW terbaru (total: newInquiries) */
  inquiries: Inquiry[];
};
/** Baris daftar proyek: + apakah sudah punya karya portofolio */
export type ProjectListItem = ProjectWithTasks & { hasPortfolio: boolean };
/** GET /api/projects (sort=deadline|name|progress|updated; default deadline: berjalan dulu, lewat deadline dulu, deadline terdekat) */
export type ProjectsResponse = {
  projects: ProjectListItem[];
  users: User[];
  /** jumlah per segmen status (setelah filter type/q, sebelum filter status): ALL, ACTIVE, dan tiap kunci PROJECT_STATUS */
  counts: Record<string, number>;
};
/** GET /api/projects/:id */
export type ProjectDetailResponse = {
  project: ProjectWithRefs;
  portfolio: PortfolioItem[];
  users: User[];
  /** jumlah tugas hidup per user id (untuk pilihan penanggung jawab "Budi · 2 terbuka") */
  load: Record<string, number>;
};
/** GET /api/tasks */
export type TasksResponse = { tasks: TaskWithRefs[]; users: User[]; counts: TaskCounts; load: Record<string, number> };
/** GET /api/portfolio/:id ("new" → item null) */
export type PortfolioEditResponse = {
  item: PortfolioItem | null;
  projects: Project[];
  /** jumlah karya unggulan yang tayang (Beranda menampilkan maks. MAX_FEATURED) */
  featuredCount: number;
};
/** GET /api/team (discord hanya untuk admin) */
export type TeamResponse = {
  users: TeamMember[];
  discord: DiscordSettings | null;
  /** tugas hidup tanpa penanggung jawab */
  unassigned: number;
  /** jumlah admin (UI: jangan tawarkan turunkan/hapus admin terakhir) */
  adminCount: number;
};
