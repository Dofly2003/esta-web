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
export type TaskWithRefs = Task & { assignee: User | null; projectName: string };
export type ProjectWithRefs = Project & { lead: User | null; tasks: TaskWithRefs[] };
