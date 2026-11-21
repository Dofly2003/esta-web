import Link from "next/link";
import { inquiries as inquiryRepo, projects, tasks } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { PROJECT_STATUS, PROJECT_TYPES, PRIORITY } from "@/lib/constants";
import { fmtDate, isOverdue, progress } from "@/lib/format";
import { Badge, Empty, PageHeader, Progress } from "@/components/dash";

export default async function DashboardHome() {
  const user = await requireUser();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [allProjects, allTasks, allInquiries] = await Promise.all([projects.list(), tasks.list(), inquiryRepo.list()]);
  const projectName = new Map(allProjects.map((p) => [p.id, p.name]));
  const active = allProjects
    .filter((p) => ["PLANNING", "IN_PROGRESS", "REVIEW"].includes(p.status))
    .map((p) => ({ ...p, tasks: allTasks.filter((t) => t.projectId === p.id) }))
    .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));
  const open = allTasks.filter((t) => t.status !== "DONE");
  const openTasks = open.length;
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;
  const newList = allInquiries.filter((q) => q.status === "NEW");
  const newInq = newList.length;
  const inquiries = newList.slice(0, 4);
  const myTasks = open
    .filter((t) => t.assigneeId === user.id)
    .slice(0, 8)
    .map((t) => ({ ...t, project: { id: t.projectId, name: projectName.get(t.projectId) ?? "—" } }));

  const stats = [
    { label: "Proyek aktif", value: active.length, href: "/dashboard/projects" },
    { label: "Tugas terbuka", value: openTasks, href: "/dashboard/tasks?filter=all" },
    { label: "Tugas lewat deadline", value: overdue, href: "/dashboard/tasks?filter=all", warn: overdue > 0 },
    { label: "Inquiry baru", value: newInq, href: "/dashboard/inbox" },
  ];

  return (
    <>
      <PageHeader title={`Halo, ${user.name.split(" ")[0]} 👋`} subtitle="Ringkasan pekerjaan tim hari ini.">
        <Link href="/dashboard/projects?new=1" className="btn-primary">
          + Proyek baru
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-5 transition hover:border-accent/50">
            <p className="text-xs text-zinc-500">{s.label}</p>
            <p className={`mt-2 text-3xl font-extrabold ${s.warn ? "text-rose-600" : ""}`}>{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Proyek berjalan</h2>
            <Link href="/dashboard/projects" className="text-xs text-accent">
              Semua →
            </Link>
          </div>
          {active.length === 0 ? (
            <Empty>Tidak ada proyek aktif.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {active.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/dashboard/projects/${p.id}`}
                    className="grid gap-2 py-3 sm:grid-cols-[1fr_120px_160px] sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-xs text-zinc-500">
                        {p.client} · {PROJECT_TYPES[p.type]} · Deadline{" "}
                        <span className={isOverdue(p.dueDate) ? "font-semibold text-rose-600" : ""}>
                          {fmtDate(p.dueDate)}
                        </span>
                      </p>
                    </div>
                    <Badge opt={PROJECT_STATUS[p.status]} />
                    <Progress value={progress(p.tasks)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Tugas saya</h2>
              <Link href="/dashboard/tasks" className="text-xs text-accent">
                Semua →
              </Link>
            </div>
            {myTasks.length === 0 ? (
              <Empty>Tidak ada tugas untuk Anda. 🎉</Empty>
            ) : (
              <ul className="space-y-3">
                {myTasks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/dashboard/projects/${t.project.id}`} className="block rounded-lg hover:bg-zinc-50">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{t.title}</p>
                        <Badge opt={PRIORITY[t.priority]} />
                      </div>
                      <p className="text-xs text-zinc-500">
                        {t.project.name} ·{" "}
                        <span className={isOverdue(t.dueDate) ? "font-semibold text-rose-600" : ""}>
                          {fmtDate(t.dueDate)}
                        </span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Inquiry baru</h2>
              <Link href="/dashboard/inbox" className="text-xs text-accent">
                Inbox →
              </Link>
            </div>
            {inquiries.length === 0 ? (
              <Empty>Belum ada pesan baru.</Empty>
            ) : (
              <ul className="space-y-3">
                {inquiries.map((q) => (
                  <li key={q.id} className="text-sm">
                    <p className="font-medium">
                      {q.name} {q.company && <span className="text-zinc-500">· {q.company}</span>}
                    </p>
                    <p className="line-clamp-1 text-xs text-zinc-500">{q.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
