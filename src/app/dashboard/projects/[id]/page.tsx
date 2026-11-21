import Link from "next/link";
import { notFound } from "next/navigation";
import { portfolio, projects, tasks, users as userRepo } from "@/lib/data";
import { createTask, deleteProject, portfolioFromProject, updateProject } from "@/lib/actions";
import { PRIORITY, PROJECT_STATUS, PROJECT_TYPES, TASK_STATUS } from "@/lib/constants";
import { fmtDate, fmtRupiah, isOverdue, progress } from "@/lib/format";
import { Badge, PageHeader, Progress } from "@/components/dash";
import { ConfirmButton, SubmitButton } from "@/components/ui";
import { ProjectForm } from "../../project-form";
import { TaskCard } from "../../task-card";

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [base, projectTasks, linked, users] = await Promise.all([
    projects.get(id),
    tasks.byProject(id),
    portfolio.byProject(id),
    userRepo.list(),
  ]);
  if (!base) notFound();
  const userById = (uid: string | null) => users.find((u) => u.id === uid) ?? null;
  const project = {
    ...base,
    lead: userById(base.leadId),
    tasks: projectTasks.map((t) => ({ ...t, assignee: userById(t.assigneeId) })),
    portfolio: linked,
  };

  const pct = progress(project.tasks);

  return (
    <>
      <Link href="/dashboard/projects" className="text-sm text-zinc-500 hover:text-accent">
        ← Semua proyek
      </Link>
      <div className="mt-3">
        <PageHeader title={project.name} subtitle={`${project.client} · ${PROJECT_TYPES[project.type]}`}>
          {project.portfolio.length > 0 ? (
            <Link href={`/dashboard/portfolio/${project.portfolio[0].id}`} className="btn-ghost">
              Lihat di portofolio
            </Link>
          ) : (
            <form action={portfolioFromProject}>
              <input type="hidden" name="projectId" value={project.id} />
              <SubmitButton className="btn-ghost" pendingText="Membuat…">
                + Jadikan portofolio
              </SubmitButton>
            </form>
          )}
        </PageHeader>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-4">
          <p className="text-xs text-zinc-500">Status</p>
          <div className="mt-2">
            <Badge opt={PROJECT_STATUS[project.status]} />
          </div>
        </div>
        <div className="card p-4">
          <p className="text-xs text-zinc-500">Penanggung jawab</p>
          <p className="mt-1 font-semibold">{project.lead?.name ?? "—"}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-zinc-500">Timeline</p>
          <p className="mt-1 text-sm font-semibold">
            {fmtDate(project.startDate)} →{" "}
            <span className={isOverdue(project.dueDate, project.status === "DONE") ? "text-rose-600" : ""}>
              {fmtDate(project.dueDate)}
            </span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-zinc-500">Nilai proyek</p>
          <p className="mt-1 font-semibold">{fmtRupiah(project.budget)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-zinc-500">Progres ({project.tasks.length} tugas)</p>
          <div className="mt-2">
            <Progress value={pct} />
          </div>
        </div>
      </div>

      {project.description && (
        <p className="card mt-3 whitespace-pre-line p-4 text-sm text-zinc-600">{project.description}</p>
      )}

      <details className="card mt-3 p-4">
        <summary className="text-sm font-semibold text-zinc-700">✎ Edit detail proyek</summary>
        <div className="mt-4">
          <ProjectForm action={updateProject} users={users} project={project} submitLabel="Simpan perubahan" />
        </div>
        <form action={deleteProject} className="mt-4 border-t border-zinc-100 pt-4">
          <input type="hidden" name="id" value={project.id} />
          <ConfirmButton message="Hapus proyek beserta semua tugasnya? Tindakan ini tidak bisa dibatalkan.">
            Hapus proyek
          </ConfirmButton>
        </form>
      </details>

      {/* Tambah tugas */}
      <form action={createTask} className="card mt-8 grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_160px_130px_150px_auto]">
        <input type="hidden" name="projectId" value={project.id} />
        <input name="title" required placeholder="Tambah tugas / todo baru…" className="input sm:col-span-2 lg:col-span-1" />
        <select name="assigneeId" defaultValue="" className="input" aria-label="Assign ke">
          <option value="">Assign ke…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue="MEDIUM" className="input" aria-label="Prioritas">
          {Object.entries(PRIORITY).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <input name="dueDate" type="date" className="input" aria-label="Deadline" />
        <SubmitButton pendingText="…">Tambah</SubmitButton>
      </form>

      {/* Papan kanban */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Object.entries(TASK_STATUS).map(([key, col]) => {
          const tasks = project.tasks.filter((t) => t.status === key);
          return (
            <section key={key} className="rounded-2xl bg-zinc-100/80 p-3">
              <h3 className="mb-3 flex items-center gap-2 px-1 text-sm font-bold">
                {col.label}
                <span className="rounded-full bg-white px-2 text-xs font-semibold text-zinc-500">{tasks.length}</span>
              </h3>
              <div className="space-y-2">
                {tasks.map((t) => (
                  <TaskCard key={t.id} task={t} users={users} />
                ))}
                {tasks.length === 0 && <p className="px-1 py-4 text-center text-xs text-zinc-400">Kosong</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
