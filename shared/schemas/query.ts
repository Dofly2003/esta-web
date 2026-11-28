// Parameter GET (query string) yang dibaca API dan frontmatter halaman SSR yang sama, supaya keduanya selalu
// menafsirkan URL dengan cara yang sama. Nilai tidak dikenal TIDAK pernah error: diganti nilai bawaan (filter mati).
// Hanya untuk server / SSR: jangan import modul ini dari <script> klien (Valibot tidak boleh masuk bundel browser).
import {
  check,
  fallback,
  object,
  optional,
  parse,
  pipe,
  string,
  transform,
  type GenericSchema,
  type InferOutput,
} from "valibot";
import { INQUIRY_STATUS_ALL, PROJECT_STATUS, PROJECT_TYPES, TASK_STATUS } from "../constants";

/** URLSearchParams → objek; kunci ganda = nilai PERTAMA (sama dengan searchParams.get) */
export function queryOf(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of sp) if (!Object.hasOwn(out, k)) out[k] = v;
  return out;
}

/** Baca query dengan skema; skema di sini tidak pernah gagal (semua nilai punya bawaan) */
export const readQuery = <S extends GenericSchema>(schema: S, sp: URLSearchParams): InferOutput<S> =>
  parse(schema, queryOf(sp));

const raw = () => optional(string(), "");
/** Nilai yang lolos `ok`, selain itu "" (atau `otherwise`) */
const only = (ok: (v: string) => boolean, otherwise = "") =>
  pipe(
    raw(),
    transform((v) => (ok(v) ? v : otherwise)),
  );
const ID_RE = /^[\w-]{1,64}$/;

/** Urutan daftar proyek; deadline = bawaan */
export const PROJECT_SORTS = ["deadline", "name", "progress", "updated"] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

/** GET /api/projects dan /dashboard/projects */
export const projectsQuery = object({
  // status=ACTIVE = semua status berjalan; status tidak dikenal diabaikan (sama dengan tanpa filter)
  status: only((v) => v === "ACTIVE" || Object.hasOwn(PROJECT_STATUS, v)),
  type: only((v) => Object.hasOwn(PROJECT_TYPES, v)),
  q: raw(),
  // pf=belum: hanya proyek yang belum punya karya portofolio
  pf: only((v) => v === "belum"),
  sort: pipe(
    raw(),
    transform((v): ProjectSort => ((PROJECT_SORTS as readonly string[]).includes(v) ? (v as ProjectSort) : "deadline")),
  ),
});

/** GET /api/tasks dan /dashboard/tasks. Drill-down (due / assignee / status) = hanya tugas hidup. */
export const tasksQuery = pipe(
  object({
    // filter=all = semua anggota (bawaan: tugas saya); done=1 = termasuk yang selesai
    filter: raw(),
    done: raw(),
    due: pipe(
      raw(),
      transform((v): "" | "overdue" | "week" => (v === "overdue" || v === "week" ? v : "")),
    ),
    // none = tanpa penanggung jawab, selain itu id akun
    assignee: only((v) => ID_RE.test(v)),
    // status belum selesai saja (DONE bukan drill-down)
    status: only((v) => Object.hasOwn(TASK_STATUS, v) && v !== "DONE"),
  }),
  transform(({ filter, done, ...rest }) => ({ all: filter === "all", showDone: done === "1", ...rest })),
);

/** Nomor halaman 1…; selain bilangan bulat positif = 1 (halaman di atas yang terakhir dijepit oleh API) */
const pageNo = () =>
  fallback(
    pipe(
      string(),
      check((v) => /^[1-9]\d{0,5}$/.test(v)),
      transform(Number),
    ),
    1,
  );

/** Papan Tugas: kartu per kolom status (sisanya lewat "Tampilkan semua" → tampilan satu kolom) */
export const TASK_BOARD_CAP = 30;
/** Tampilan satu kolom papan Tugas: kartu per halaman */
export const TASK_COL_PAGE_SIZE = 50;

/** Parameter tambahan GET /api/tasks dan /dashboard/tasks (terpisah dari tasksQuery: tanpa parameter ini respons
 * sama persis dengan dulu). board=1 → tiap kolom status maks. TASK_BOARD_CAP kartu; col=<status> → satu kolom,
 * per halaman TASK_COL_PAGE_SIZE (page); pin=<id tugas> → tugas ini selalu ikut (baru ditambah / baru diubah). */
export const taskBoardQuery = object({
  board: only((v) => v === "1"),
  col: only((v) => Object.hasOwn(TASK_STATUS, v)),
  page: pageNo(),
  pin: only((v) => ID_RE.test(v)),
});

/** Ukuran halaman Inbox */
export const INBOX_PAGE_SIZE = 25;

/** GET /api/inquiries dan /dashboard/inbox */
export const inquiriesQuery = object({
  status: only((v) => Object.hasOwn(INQUIRY_STATUS_ALL, v)),
  page: pageNo(),
  // id inquiry yang harus ikut tampil (tautan dari Ringkasan / Discord): API memilih halaman yang memuatnya
  inq: only((v) => ID_RE.test(v)),
});

/** GET /api/public/portfolio (kategori apa adanya: kategori tidak dikenal = daftar kosong, seperti dulu) */
export const publicPortfolioQuery = object({ kategori: raw() });

export type ProjectsQuery = InferOutput<typeof projectsQuery>;
export type TasksQuery = InferOutput<typeof tasksQuery>;
export type TaskBoardQuery = InferOutput<typeof taskBoardQuery>;
export type InquiriesQuery = InferOutput<typeof inquiriesQuery>;
