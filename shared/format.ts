// Fungsi format yang dipakai backend (Bun) dan frontend (Astro).
// Tanggal disimpan sebagai teks: "YYYY-MM-DD" (tanggal) atau ISO lengkap (waktu).

type DateLike = string | Date | null | undefined;

export function toDate(d: DateLike): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  // "YYYY-MM-DD" dibaca sebagai tanggal lokal, bukan UTC
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
}

export function fmtDate(d: DateLike) {
  const x = toDate(d);
  if (!x) return "—";
  return x.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** Tanggal hari ini sebagai "YYYY-MM-DD" (waktu lokal) */
export function today() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export function isOverdue(d: DateLike, done = false) {
  if (!d || done) return false;
  const day = typeof d === "string" ? d.slice(0, 10) : today();
  return day < today();
}

export function fmtRupiah(n?: number | null) {
  if (n == null) return "—";
  return "Rp" + n.toLocaleString("id-ID");
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 60);
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function progress(tasks: { status: string }[]) {
  if (tasks.length === 0) return 0;
  return Math.round((tasks.filter((t) => t.status === "DONE").length / tasks.length) * 100);
}
