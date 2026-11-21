import type { Project, User } from "@/lib/data";
import { PROJECT_STATUS, PROJECT_TYPES } from "@/lib/constants";
import { dateInput } from "@/lib/format";
import { SubmitButton } from "@/components/ui";

/** Form proyek dipakai untuk tambah & edit */
export function ProjectForm({
  action,
  users,
  project,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  users: User[];
  project?: Project;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {project && <input type="hidden" name="id" value={project.id} />}
      <div className="sm:col-span-2">
        <label className="label">Nama proyek *</label>
        <input name="name" required defaultValue={project?.name} className="input" placeholder="Website PT Maju Jaya" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Klien *</label>
        <input name="client" required defaultValue={project?.client} className="input" placeholder="PT Maju Jaya" />
      </div>
      <div>
        <label className="label">Jenis</label>
        <select name="type" defaultValue={project?.type ?? "WEBSITE"} className="input">
          {Object.entries(PROJECT_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Status</label>
        <select name="status" defaultValue={project?.status ?? "PLANNING"} className="input">
          {Object.entries(PROJECT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Penanggung jawab</label>
        <select name="leadId" defaultValue={project?.leadId ?? ""} className="input">
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Nilai proyek (Rp)</label>
        <input name="budget" inputMode="numeric" defaultValue={project?.budget ?? ""} className="input" placeholder="15000000" />
      </div>
      <div>
        <label className="label">Mulai</label>
        <input name="startDate" type="date" defaultValue={dateInput(project?.startDate)} className="input" />
      </div>
      <div>
        <label className="label">Deadline</label>
        <input name="dueDate" type="date" defaultValue={dateInput(project?.dueDate)} className="input" />
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <label className="label">Deskripsi / scope</label>
        <textarea name="description" rows={3} defaultValue={project?.description} className="input" />
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
