// Form proyek (tambah / ubah) dan ganti status. Tiga tahap supaya urutan kode error sama dengan dulu:
// 1) wajib isi (nama & klien) SEBELUM cek panjang apa pun (nama 200 karakter + klien kosong → project-client-required),
// 2) panjang nama/klien → nilai → tanggal → urutan tanggal, 3) status (ketat) → deskripsi. Jenis jatuh ke WEBSITE.
// leadId hanya dibaca di sini; keberadaannya di database dicek rute.
import { check, object, pipe } from "valibot";
import { MAX_LEN, PROJECT_STATUS, PROJECT_TYPES } from "../../shared/constants";
import type { ProjectInput } from "../repo";
import {
  isoDate,
  nullIfEmpty,
  oneOfStrict,
  parseWith,
  pickLoose,
  pickStrict,
  rupiah,
  str,
  text,
  type Parsed,
} from "./fields";

const required = pipe(
  object({ name: str(), client: str() }),
  check((v) => !!(v.name || v.client), "project-required"),
  check((v) => !!v.name, "project-name-required"),
  check((v) => !!v.client, "project-client-required"),
);
const main = pipe(
  object({
    name: text(MAX_LEN.projectName),
    client: text(MAX_LEN.client),
    budget: rupiah(),
    startDate: isoDate(),
    dueDate: isoDate(),
  }),
  check((v) => !(v.startDate && v.dueDate && v.dueDate < v.startDate), "project-dates"),
);
const rest = object({
  type: pickLoose(PROJECT_TYPES, "WEBSITE"),
  status: pickStrict(PROJECT_STATUS, "PLANNING"),
  description: text(MAX_LEN.description),
  leadId: nullIfEmpty(),
});

/** Isian proyek; leadId belum dicek keberadaannya */
export function parseProject(input: Record<string, string>): Parsed<ProjectInput> {
  const a = parseWith(required, input);
  if (!a.ok) return a;
  const b = parseWith(main, input);
  if (!b.ok) return b;
  const c = parseWith(rest, input);
  if (!c.ok) return c;
  const { name, client, budget, startDate, dueDate } = b.value;
  const { type, status, description, leadId } = c.value;
  return { ok: true, value: { name, client, type, status, description, budget, startDate, dueDate, leadId } };
}

/** Ganti status saja: wajib status yang dikenal */
export const projectStatusForm = object({ status: oneOfStrict(PROJECT_STATUS, "status-invalid") });
