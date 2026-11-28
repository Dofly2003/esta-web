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

// Respons API hanya berisi field yang dibaca halaman (hemat kuota DB → server → browser). Tambah field di sini
// (dan di SELECT / mapper server/repo.ts) bila halaman butuh field baru.
/** Proyek tanpa deskripsi (dipakai server untuk daftar / urutan; tidak dikirim utuh) */
export type ProjectSummary = Omit<Project, "description">;
/** Pilihan <select> (proyek, akun) dan PJ / penanggung jawab yang ditempel di baris */
export type NamedRef = { id: string; name: string };
/** Kartu karya di website publik (Beranda, Portofolio, "karya lainnya") */
export type PortfolioCard = Pick<PortfolioItem, "slug" | "title" | "client" | "category" | "coverColor" | "imageUrl">;
/** Baris daftar karya di dashboard */
export type PortfolioRow = Pick<
  PortfolioItem,
  "id" | "title" | "client" | "category" | "year" | "coverColor" | "imageUrl" | "featured" | "published" | "sortOrder"
>;
/** Karya di halaman publik /portfolio/[slug] (tanpa kolom internal) */
export type PortfolioPublic = Pick<
  PortfolioItem,
  | "slug"
  | "title"
  | "client"
  | "category"
  | "year"
  | "summary"
  | "content"
  | "tags"
  | "coverColor"
  | "imageUrl"
  | "liveUrl"
>;
/** Inquiry di Ringkasan (pesan dipotong; isi lengkap di Inbox) */
export type InquiryBrief = Pick<Inquiry, "id" | "name" | "company" | "message" | "createdAt">;

export type DiscordSettings = { webhookUrl: string; enabled: boolean };
/** Setelan Discord untuk form admin: nilai tersimpan saja + fromEnv = memakai webhook cadangan dari env server */
export type DiscordForm = DiscordSettings & { fromEnv: boolean };

/* ---- respons gabungan ---- */
/** Tugas yang bisa diedit di halaman (form edit membawa updatedAt sebagai versi) */
export type TaskEditable = Omit<Task, "createdAt">;
/** Tugas di Ringkasan (tanpa deskripsi / form edit) */
export type TaskBrief = Pick<Task, "id" | "title" | "status" | "priority" | "dueDate" | "projectId" | "updatedAt"> & {
  projectName: string;
};
/** Tugas di detail proyek */
export type ProjectTask = TaskEditable & { assignee: NamedRef | null };
/** Tugas di papan Tugas */
export type TaskWithRefs = ProjectTask & { projectName: string };
/** Proyek di daftar / ringkasan: PJ + jumlah tugas (bukan daftar tugasnya) */
export type ProjectWithCounts = Pick<
  Project,
  "id" | "name" | "client" | "type" | "status" | "startDate" | "dueDate"
> & {
  lead: NamedRef | null;
  /** tugas Selesai di proyek ini */
  doneTasks: number;
  /** semua tugas di proyek ini */
  totalTasks: number;
};
export type ProjectWithRefs = Project & { lead: NamedRef | null; tasks: ProjectTask[] };
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
export type ActiveProject = ProjectWithCounts & {
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
export type PublicHome = { featured: PortfolioCard[]; stats: { done: number; clients: number } };
/** GET /api/public/portfolio/:slug */
export type PublicPortfolioDetail = { item: PortfolioPublic; others: PortfolioCard[] };
/** GET /api/portfolio/:id/pratinjau (juga draf) */
export type PortfolioPreview = { item: PortfolioItem; others: PortfolioCard[] };
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
  review: TaskBrief[];
  /** maks. 8: lewat deadline dulu, lalu deadline, lalu prioritas */
  myTasks: TaskBrief[];
  /** maks. 4 inquiry NEW terbaru (total: newInquiries) */
  inquiries: InquiryBrief[];
};
/** Baris daftar proyek: + apakah sudah punya karya portofolio */
export type ProjectListItem = ProjectWithCounts & { hasPortfolio: boolean };
/** GET /api/projects (sort=deadline|name|progress|updated; default deadline: berjalan dulu, lewat deadline dulu, deadline terdekat) */
export type ProjectsResponse = {
  projects: ProjectListItem[];
  users: NamedRef[];
  /** jumlah per segmen status (setelah filter type/q, sebelum filter status): ALL, ACTIVE, dan tiap kunci PROJECT_STATUS */
  counts: Record<string, number>;
};
/** GET /api/projects/:id */
export type ProjectDetailResponse = {
  project: ProjectWithRefs;
  /** karya yang terhubung (hanya id: tombol "Buka karya") */
  portfolio: { id: string }[];
  users: NamedRef[];
  /** jumlah tugas hidup per user id (untuk pilihan penanggung jawab "Budi · 2 terbuka") */
  load: Record<string, number>;
};
/** GET /api/tasks */
export type TasksResponse = {
  tasks: TaskWithRefs[];
  users: NamedRef[];
  /** hitungan tugas hidup seluruh tim (chip "Tanpa PJ") */
  counts: TaskCounts;
  /** tugas hidup dalam cakupan yang dilihat (saya / tim / orang tertentu): lewat deadline & deadline 7 hari */
  scopeCounts: { overdue: number; week: number };
  load: Record<string, number>;
  /** proyek berjalan untuk form tambah tugas (urutan sama dengan daftar proyek "Berjalan") */
  projectOptions: NamedRef[];
};
/** GET /api/portfolio/:id ("new" → item null) */
export type PortfolioEditResponse = {
  item: PortfolioItem | null;
  /** semua proyek (A–Z) untuk pilihan "Proyek terkait" */
  projects: NamedRef[];
  /** jumlah karya unggulan yang tayang (Beranda menampilkan maks. MAX_FEATURED) */
  featuredCount: number;
};
/** GET /api/inquiries (?status=&page=&inq=) — satu halaman Inbox + hitungan per status */
export type InquiriesResponse = {
  items: Inquiry[];
  /** jumlah per status (semua inquiry, tidak tergantung filter) */
  counts: Record<string, number>;
  /** jumlah dalam filter ini */
  total: number;
  page: number;
  pages: number;
  pageSize: number;
};
/** GET /api/team (discord hanya untuk admin) */
export type TeamResponse = {
  users: TeamMember[];
  discord: DiscordForm | null;
  /** tugas hidup tanpa penanggung jawab */
  unassigned: number;
  /** jumlah admin (UI: jangan tawarkan turunkan/hapus admin terakhir) */
  adminCount: number;
};
