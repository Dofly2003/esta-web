// Fungsi format & validasi kecil yang dipakai backend (Bun) dan frontend (Astro).
// Tanggal disimpan sebagai teks: "YYYY-MM-DD" (tanggal) atau ISO lengkap (waktu).
// "Hari ini" dan tanggal tampil memakai zona waktu studio (APP_TZ), bukan TZ server.
import { APP_TZ, isActiveProject } from "./constants";

type DateLike = string | Date | null | undefined;

/** "YYYY-MM-DD" (grup: tahun, bulan, tanggal) */
export const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAY_MS = 86_400_000;
const dayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const fmtShort = (timeZone: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone });
const fmtDay = fmtShort("UTC");
const fmtMoment = fmtShort(APP_TZ);

/** Tanggal di zona waktu studio (APP_TZ) sebagai "YYYY-MM-DD", tidak bergantung TZ server */
export function isoDay(d: Date) {
  const p = Object.fromEntries(dayParts.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** "YYYY-MM-DD" untuk tanggal saja; waktu lengkap (ISO) diubah ke hari di APP_TZ */
function dayOf(d: string | Date) {
  if (typeof d === "string" && ISO_DAY_RE.test(d)) return d;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : isoDay(x);
}

/** Nomor hari (UTC) dari "YYYY-MM-DD", untuk selisih hari */
const dayNum = (day: string) => {
  const m = ISO_DAY_RE.exec(day)!;
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) / DAY_MS;
};

/** Tanggal tampil "27 Nov 2026". Tanggal saja tidak pernah bergeser; waktu lengkap tampil sebagai hari di APP_TZ. */
export function fmtDate(d: DateLike) {
  if (!d) return "—";
  if (typeof d === "string" && ISO_DAY_RE.test(d)) return fmtDay.format(dayNum(d) * DAY_MS);
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? "—" : fmtMoment.format(x);
}

/** Tanggal hari ini (APP_TZ) sebagai "YYYY-MM-DD" */
export function today() {
  return isoDay(new Date());
}

/** Tahun berjalan (APP_TZ) */
export const currentYear = () => Number(today().slice(0, 4));

/** Hari ini ± n hari (APP_TZ) sebagai "YYYY-MM-DD" */
export function dayOffset(n: number) {
  return new Date((dayNum(today()) + n) * DAY_MS).toISOString().slice(0, 10);
}

/** Selisih hari dari hari ini (APP_TZ): 0 = hari ini, 3 = tiga hari lagi, -2 = dua hari lalu; null bila kosong */
export function relDays(d: DateLike) {
  const day = d ? dayOf(d) : null;
  return day ? dayNum(day) - dayNum(today()) : null;
}

export function isOverdue(d: DateLike, done = false) {
  if (!d || done) return false;
  const day = dayOf(d);
  return !!day && day < today();
}

/** Jatuh tempo hari ini sampai n hari lagi (default 7), belum lewat */
export function isDueWithin(d: DateLike, days = 7) {
  const r = relDays(d);
  return r != null && r >= 0 && r <= days;
}

/* ---- status tugas / proyek ---- */
type HasStatus = { status: string };
export const isDone = (x: HasStatus) => x.status === "DONE";
export const openTasks = <T extends HasStatus>(list: T[]) => list.filter((t) => !isDone(t));
export const doneCount = (list: HasStatus[]) => list.filter(isDone).length;
/** Lewat deadline dan belum selesai (tugas atau proyek) */
export const isLate = (x: HasStatus & { dueDate: string | null }) => isOverdue(x.dueDate, isDone(x));

/**
 * Tugas "hidup": belum selesai DAN proyeknya masih berjalan (ACTIVE_PROJECT_STATUSES).
 * Dasar semua hitungan terbuka / lewat deadline / beban kerja, supaya tugas di proyek Selesai/Ditunda tidak ikut.
 */
export function liveTasks<T extends HasStatus & { projectId: string }>(list: T[], projects: (HasStatus & { id: string })[]) {
  const active = new Set(projects.filter(isActiveProject).map((p) => p.id));
  return list.filter((t) => !isDone(t) && active.has(t.projectId));
}

/** Bagian waktu proyek yang sudah berjalan (0–1) dari startDate ke dueDate; null bila tanggal tidak lengkap */
export function elapsed(p: { startDate: string | null; dueDate: string | null }) {
  if (!p.startDate || !p.dueDate || !ISO_DAY_RE.test(p.startDate) || !ISO_DAY_RE.test(p.dueDate)) return null;
  const start = dayNum(p.startDate);
  const span = dayNum(p.dueDate) - start;
  const t = dayNum(today());
  if (span <= 0) return t >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (t - start) / span));
}

export function progress(tasks: HasStatus[]) {
  if (tasks.length === 0) return 0;
  return Math.round((doneCount(tasks) / tasks.length) * 100);
}

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
/** "Rp 15.000.000" (Intl, spasi tak terputus) */
export function fmtRupiah(n?: number | null) {
  if (n == null) return "—";
  return rupiah.format(n);
}

/** Jarak ke deadline sebagai teks: "lewat 3 hari", "hari ini", "besok", "5 hari lagi" (sampai `within` hari); null bila tidak perlu */
export function dueText(d: DateLike, late: boolean, within = 14) {
  const r = relDays(d);
  if (r == null) return null;
  if (late) return `lewat ${Math.max(1, -r)} hari`;
  if (r === 0) return "hari ini";
  if (r === 1) return "besok";
  if (r > 1 && r <= within) return `${r} hari lagi`;
  return null;
}

/** Umur sebuah waktu: "hari ini", "kemarin", "3 hari lalu" (APP_TZ) */
export function agoText(d: DateLike) {
  const r = relDays(d);
  if (r == null) return "";
  if (r >= 0) return "hari ini";
  if (r === -1) return "kemarin";
  return `${-r} hari lalu`;
}

/** Nama depan ("Budi Santoso" → "Budi") */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Slug URL: huruf kecil + tanda hubung, maks. 60 karakter dipotong di batas kata (tanpa "-" di ujung) */
export function slugify(s: string, max = 60) {
  const full = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (full.length <= max) return full;
  const cut = full.slice(0, max + 1);
  const at = cut.lastIndexOf("-");
  return (at >= max / 3 ? cut.slice(0, at) : full.slice(0, max)).replace(/-+$/, "");
}

/** Potong teks di batas kata (maks. `max` karakter termasuk "…"); teks pendek dikembalikan apa adanya */
export function cutText(s: string, max: number) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1);
  const sentence = head.lastIndexOf(". ");
  if (sentence >= max * 0.6) return head.slice(0, sentence + 1);
  const space = head.lastIndexOf(" ");
  return (space >= max / 2 ? head.slice(0, space) : head).replace(/[\s,.;:–-]+$/, "") + "…";
}

/** Nilai rupiah bulat dari input: "15000000", "15.000.000", "Rp 15.000.000".
 * null bila kosong; "invalid" untuk desimal/koma ("1.500.000,50"), satuan ("1.5 juta") atau titik yang salah. */
export function parseRupiah(v: string): number | null | "invalid" {
  const s = v.trim().replace(/^rp\.?/i, "").replace(/\s+/g, "");
  if (!s) return null;
  if (!/^\d+$/.test(s) && !/^\d{1,3}(\.\d{3})+$/.test(s)) return "invalid";
  const digits = s.replace(/\./g, "");
  return digits.length > 15 ? "invalid" : Number(digits);
}

/** Jam sejak waktu ISO (0 bila tidak valid) */
export function hoursSince(iso: string | null | undefined) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : Math.max(0, (Date.now() - t) / 3_600_000);
}

/** Pola fragmen #id yang boleh dibawa redirect (sama dengan server) */
export const FRAGMENT_RE = /^#[A-Za-z][\w-]{0,100}$/;

/** Tujuan setelah login: hanya /dashboard atau /dashboard/… (setelah normalisasi "..", tanpa host lain);
 * query dan #fragmen sederhana ikut. null bila tidak valid. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  try {
    const u = new URL(next, "http://x.invalid");
    if (u.origin !== "http://x.invalid") return null;
    if (u.pathname !== "/dashboard" && !u.pathname.startsWith("/dashboard/")) return null;
    return u.pathname + u.search + (FRAGMENT_RE.test(u.hash) ? u.hash : "");
  } catch {
    return null;
  }
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/* ---- validasi ---- */
export const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v);
/** Email untuk disimpan / dicari: tanpa spasi tepi, huruf kecil */
export const normEmail = (v: string) => v.trim().toLowerCase();
