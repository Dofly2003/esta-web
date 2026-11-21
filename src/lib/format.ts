export function fmtDate(d?: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** Nilai untuk <input type="date"> */
export function dateInput(d?: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function fmtRupiah(n?: number | null) {
  if (n == null) return "—";
  return "Rp" + n.toLocaleString("id-ID");
}

export function isOverdue(d?: Date | null, done = false) {
  if (!d || done) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
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
