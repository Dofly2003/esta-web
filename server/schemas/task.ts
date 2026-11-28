// Form tugas. Urutan cek = urutan if lama: deskripsi → status (ketat) → deadline; prioritas jatuh ke MEDIUM.
// Judul dicek terpisah: tambah = per baris (taskTitles), ubah = seluruh judul (taskEditTitle), setelah taskForm.
import { check, maxLength, nonEmpty, object, pipe, transform } from "valibot";
import { MAX_LEN, MAX_TASK_LINES, PRIORITY, TASK_STATUS } from "../../shared/constants";
import { isoDate, nullIfEmpty, oneOfStrict, pickLoose, pickStrict, str, text } from "./fields";

export const taskForm = object({
  title: str(),
  description: text(MAX_LEN.description),
  status: pickStrict(TASK_STATUS, "TODO"),
  priority: pickLoose(PRIORITY, "MEDIUM"),
  dueDate: isoDate("task-date-invalid"),
  assigneeId: nullIfEmpty(),
});

/** Tambah tugas: satu baris = satu tugas (baris kosong dilewati), 1–MAX_TASK_LINES baris, tiap judul ≤ taskTitle */
export const taskTitles = pipe(
  str(),
  transform((v) =>
    v
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
  check((list) => list.length > 0, "task-title-required"),
  check((list) => list.length <= MAX_TASK_LINES, "task-too-many"),
  check((list) => list.every((t) => t.length <= MAX_LEN.taskTitle), "too-long"),
);

/** Ubah tugas: judul wajib, maks. taskTitle */
export const taskEditTitle = pipe(
  str(),
  nonEmpty("task-edit-title-required"),
  maxLength(MAX_LEN.taskTitle, "too-long"),
);

export const taskStatusForm = object({ status: oneOfStrict(TASK_STATUS, "status-invalid") });
