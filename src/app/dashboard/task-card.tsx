import type { Task, User } from "@/lib/data";
import { deleteTask, updateTask, updateTaskStatus } from "@/lib/actions";
import { PRIORITY, TASK_STATUS } from "@/lib/constants";
import { dateInput, fmtDate, isOverdue } from "@/lib/format";
import { Avatar, Badge } from "@/components/dash";
import { AutoSubmitSelect, ConfirmButton, SubmitButton } from "@/components/ui";

export function TaskCard({
  task,
  users,
  projectName,
}: {
  task: Task & { assignee: User | null };
  users: User[];
  projectName?: string;
}) {
  const done = task.status === "DONE";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      {projectName && <p className="mb-1 text-[11px] font-semibold text-accent">{projectName}</p>}
      <p className={`text-sm font-medium ${done ? "text-zinc-400 line-through" : ""}`}>{task.title}</p>
      {task.description && <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{task.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge opt={PRIORITY[task.priority]} />
        {task.dueDate && (
          <span className={`text-xs ${isOverdue(task.dueDate, done) ? "font-semibold text-rose-600" : "text-zinc-500"}`}>
            📅 {fmtDate(task.dueDate)}
          </span>
        )}
        <span className="ml-auto">
          <Avatar name={task.assignee?.name} />
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-2">
        <form action={updateTaskStatus} className="flex-1">
          <input type="hidden" name="id" value={task.id} />
          <AutoSubmitSelect
            name="status"
            defaultValue={task.status}
            options={TASK_STATUS}
            ariaLabel="Ubah status"
            className="w-full rounded-md border-0 bg-zinc-100 px-2 py-1 text-xs"
          />
        </form>
        <details className="relative">
          <summary className="list-none rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100">Edit</summary>
          <div className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl">
            <form action={updateTask} className="space-y-2">
              <input type="hidden" name="id" value={task.id} />
              <input name="title" defaultValue={task.title} required className="input" />
              <textarea name="description" defaultValue={task.description} rows={2} className="input" placeholder="Catatan" />
              <div className="grid grid-cols-2 gap-2">
                <select name="priority" defaultValue={task.priority} className="input">
                  {Object.entries(PRIORITY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <select name="status" defaultValue={task.status} className="input">
                  {Object.entries(TASK_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <select name="assigneeId" defaultValue={task.assigneeId ?? ""} className="input">
                  <option value="">Belum di-assign</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <input name="dueDate" type="date" defaultValue={dateInput(task.dueDate)} className="input" />
              </div>
              <SubmitButton className="btn-primary w-full">Simpan</SubmitButton>
            </form>
            <form action={deleteTask} className="mt-2">
              <input type="hidden" name="id" value={task.id} />
              <ConfirmButton className="btn-danger w-full" message="Hapus tugas ini?">
                Hapus tugas
              </ConfirmButton>
            </form>
          </div>
        </details>
      </div>
    </div>
  );
}
