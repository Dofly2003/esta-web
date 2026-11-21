import Link from "next/link";
import { projects, tasks as taskRepo, users as userRepo } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { TASK_STATUS } from "@/lib/constants";
import { Empty, PageHeader } from "@/components/dash";
import { TaskCard } from "../task-card";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; done?: string }>;
}) {
  const me = await requireUser();
  const { filter, done } = await searchParams;
  const all = filter === "all";
  const showDone = done === "1";

  const [allTasks, allProjects, users] = await Promise.all([taskRepo.list(), projects.list(), userRepo.list()]);
  const tasks = allTasks
    .filter((t) => (all || t.assigneeId === me.id) && (showDone || t.status !== "DONE"))
    .map((t) => ({
      ...t,
      assignee: users.find((u) => u.id === t.assigneeId) ?? null,
      project: { id: t.projectId, name: allProjects.find((p) => p.id === t.projectId)?.name ?? "—" },
    }));

  const link = (f: boolean, d: boolean) => `/dashboard/tasks?${f ? "filter=all&" : ""}${d ? "done=1" : ""}`;
  const pill = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ${active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200"}`;

  return (
    <>
      <PageHeader title="Tugas" subtitle="Todo list lintas proyek, diurutkan berdasarkan deadline." />
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={link(false, showDone)} className={pill(!all)}>
          Tugas saya
        </Link>
        <Link href={link(true, showDone)} className={pill(all)}>
          Semua tim
        </Link>
        <span className="mx-2 w-px bg-zinc-300" />
        <Link href={link(all, !showDone)} className={pill(showDone)}>
          {showDone ? "✓ Termasuk selesai" : "Tampilkan yang selesai"}
        </Link>
      </div>

      {tasks.length === 0 ? (
        <Empty>Tidak ada tugas. Tambahkan tugas dari halaman detail proyek.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(TASK_STATUS)
            .filter(([k]) => showDone || k !== "DONE")
            .map(([key, col]) => {
              const list = tasks.filter((t) => t.status === key);
              return (
                <section key={key} className="rounded-2xl bg-zinc-100/80 p-3">
                  <h3 className="mb-3 flex items-center gap-2 px-1 text-sm font-bold">
                    {col.label}
                    <span className="rounded-full bg-white px-2 text-xs font-semibold text-zinc-500">{list.length}</span>
                  </h3>
                  <div className="space-y-2">
                    {list.map((t) => (
                      <TaskCard key={t.id} task={t} users={users} projectName={t.project.name} />
                    ))}
                    {list.length === 0 && <p className="px-1 py-4 text-center text-xs text-zinc-400">Kosong</p>}
                  </div>
                </section>
              );
            })}
        </div>
      )}
    </>
  );
}
