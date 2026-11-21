import Link from "next/link";
import { projects as projectRepo, tasks, users as userRepo } from "@/lib/data";
import { createProject } from "@/lib/actions";
import { PROJECT_STATUS, PROJECT_TYPES } from "@/lib/constants";
import { fmtDate, isOverdue, progress } from "@/lib/format";
import { Avatar, Badge, Empty, PageHeader, Progress } from "@/components/dash";
import { ProjectForm } from "../project-form";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; q?: string; new?: string }>;
}) {
  const { status, type, q, new: showNew } = await searchParams;
  const [allProjects, allTasks, users] = await Promise.all([projectRepo.list(), tasks.list(), userRepo.list()]);
  const needle = (q ?? "").toLowerCase();
  const projects = allProjects
    .filter((p) => (!status || p.status === status) && (!type || p.type === type))
    .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.client.toLowerCase().includes(needle))
    .map((p) => ({
      ...p,
      tasks: allTasks.filter((t) => t.projectId === p.id),
      lead: users.find((u) => u.id === p.leadId) ?? null,
    }));

  const tab = (s?: string) =>
    `rounded-full px-3 py-1 text-sm ${status === s ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200"}`;

  return (
    <>
      <PageHeader title="Proyek" subtitle="Semua proyek website, web app, mobile app, dan desain." />

      <details open={!!showNew} className="card mb-6 p-5">
        <summary className="font-semibold text-accent">+ Tambah proyek baru</summary>
        <div className="mt-5">
          <ProjectForm action={createProject} users={users} submitLabel="Buat proyek" />
        </div>
      </details>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/dashboard/projects" className={tab(undefined)}>
          Semua
        </Link>
        {Object.entries(PROJECT_STATUS).map(([k, v]) => (
          <Link key={k} href={`/dashboard/projects?status=${k}`} className={tab(k)}>
            {v.label}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <select name="type" defaultValue={type ?? ""} className="input w-auto">
            <option value="">Semua jenis</option>
            {Object.entries(PROJECT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input name="q" defaultValue={q} placeholder="Cari proyek / klien" className="input w-44" />
          <button className="btn-ghost">Cari</button>
        </form>
      </div>

      {projects.length === 0 ? (
        <Empty>Belum ada proyek yang cocok.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Proyek</th>
                <th className="px-4 py-3 font-semibold">Jenis</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">PJ</th>
                <th className="px-4 py-3 font-semibold">Deadline</th>
                <th className="w-44 px-4 py-3 font-semibold">Progres</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/projects/${p.id}`} className="font-semibold hover:text-accent">
                      {p.name}
                    </Link>
                    <p className="text-xs text-zinc-500">{p.client}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{PROJECT_TYPES[p.type]}</td>
                  <td className="px-4 py-3">
                    <Badge opt={PROJECT_STATUS[p.status]} />
                  </td>
                  <td className="px-4 py-3">
                    <Avatar name={p.lead?.name} />
                  </td>
                  <td className={`px-4 py-3 ${isOverdue(p.dueDate, p.status === "DONE") ? "font-semibold text-rose-600" : "text-zinc-600"}`}>
                    {fmtDate(p.dueDate)}
                  </td>
                  <td className="px-4 py-3">
                    <Progress value={progress(p.tasks)} />
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      {p.tasks.filter((t) => t.status === "DONE").length}/{p.tasks.length} tugas
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
