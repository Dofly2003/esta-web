// Pesan flash: redirect API membawa ?ok=<kode> / ?err=<kode>, halaman menampilkan teks tetap dari peta ini.
// Kode yang tidak dikenal tidak ditampilkan (teks bebas di URL tidak pernah dirender → tidak bisa dipakai pesan palsu).
// Respons JSON (Accept: application/json) tetap berisi teksnya di `message` / `error`, plus `code`.
// Istilah: halaman "Inbox", satu pesan masuk = "inquiry"; "deadline"; "Peran"; "Ubah".
import { INQUIRY_STATUS_ALL, MAX_FEATURED, MAX_TASK_LINES, MIN_PASSWORD, PROJECT_STATUS, TASK_STATUS } from "./constants";

const taskStatus = (k: string) => `Status tugas: ${TASK_STATUS[k]!.label}.`;
const inquiryStatus = (k: string) => `Inquiry ditandai ${INQUIRY_STATUS_ALL[k]!.label}.`;
const projectStatus = (k: string) => `Status proyek: ${PROJECT_STATUS[k]!.label}.`;

export const OK = {
  // proyek
  "project-created": "Proyek dibuat.",
  "project-created-from-inquiry": "Proyek dibuat dari inquiry. Inquiry-nya ditandai Jadi proyek.",
  "project-saved": "Proyek disimpan.",
  "project-deleted": "Proyek dihapus.",
  "project-status": "Status proyek diubah.",
  "project-status-planning": projectStatus("PLANNING"),
  "project-status-in-progress": projectStatus("IN_PROGRESS"),
  "project-status-review": projectStatus("REVIEW"),
  "project-status-done": projectStatus("DONE"),
  "project-status-on-hold": projectStatus("ON_HOLD"),
  "portfolio-draft-created": "Draf portofolio dibuat.",
  "portfolio-exists": "Proyek ini sudah punya karya portofolio. Ini editornya.",
  // tugas
  "task-created": "Tugas ditambahkan.",
  "tasks-created": "Setiap baris ditambahkan sebagai tugas tersendiri.",
  "task-saved": "Tugas disimpan.",
  "task-deleted": "Tugas dihapus.",
  "task-status": "Status tugas diubah.",
  "task-status-todo": taskStatus("TODO"),
  "task-status-in-progress": taskStatus("IN_PROGRESS"),
  "task-status-review": taskStatus("REVIEW"),
  "task-status-done": taskStatus("DONE"),
  // portofolio
  "pf-saved": "Karya disimpan.",
  "pf-saved-unfeatured": "Karya disimpan. Unggulan dimatikan karena karya belum tayang.",
  "pf-deleted": "Karya dihapus.",
  "pf-published": "Karya ditayangkan.",
  "pf-unpublished": "Karya disembunyikan.",
  "pf-unpublished-unfeatured": "Karya disembunyikan dan tidak lagi unggulan.",
  "pf-featured": "Ditandai unggulan.",
  "pf-featured-over": `Ditandai unggulan. Beranda hanya menampilkan ${MAX_FEATURED} karya unggulan dengan urutan terkecil.`,
  "pf-unfeatured": "Tidak lagi unggulan.",
  // inbox
  "inquiry-deleted": "Inquiry dihapus.",
  "inquiry-status": "Status inquiry diubah.",
  "inquiry-status-new": inquiryStatus("NEW"),
  "inquiry-status-contacted": inquiryStatus("CONTACTED"),
  "inquiry-status-won": inquiryStatus("WON"),
  "inquiry-status-lost": inquiryStatus("LOST"),
  "inquiry-status-closed": inquiryStatus("CLOSED"),
  // tim & akun
  "user-created": "Akun dibuat.",
  "user-deleted": "Akun dihapus.",
  "user-password-reset": "Password akun direset. Akun itu sudah dikeluarkan dari semua perangkat.",
  "user-role-changed": "Peran akun diubah.",
  "user-role-unchanged": "Peran tidak berubah.",
  "discord-id-saved": "Discord ID disimpan.",
  "discord-id-cleared": "Discord ID dihapus.",
  "password-changed": "Password diubah. Perangkat lain yang masih masuk dengan akun ini sudah dikeluarkan.",
  "sessions-ended": "Anda sudah dikeluarkan dari semua perangkat lain.",
  // Discord
  "discord-saved": "Pengaturan Discord disimpan.",
  "discord-cleared": "Webhook dikosongkan, notifikasi Discord mati.",
  "discord-test-sent": "Pesan uji terkirim. Cek channel Discord Anda.",
  // formulir kontak publik
  "inquiry-sent": "Pesan terkirim. Kami akan menghubungimu dalam 1×24 jam kerja.",
  "inquiry-thanks": "Terima kasih!",
} as const;

export const ERR = {
  // umum
  "login-required": "Silakan masuk dulu.",
  "session-expired": "Sesi Anda sudah berakhir. Masuk lagi untuk melanjutkan.",
  "session-expired-draft": "Sesi Anda sudah berakhir. Masuk lagi; isian terakhir Anda akan dipulihkan.",
  "admin-only": "Hanya admin yang bisa melakukan ini.",
  "admin-only-delete": "Hanya admin yang bisa menghapus.",
  "admin-only-other-user": "Hanya admin yang bisa mengubah akun lain.",
  "origin-denied": "Origin tidak diizinkan.",
  "not-found": "Endpoint tidak ditemukan.",
  "server-error": "Terjadi kesalahan di server.",
  stale: "Data ini sudah diubah di tab lain atau oleh anggota lain. Isian Anda dipulihkan; periksa lalu simpan lagi.",
  "status-invalid": "Status tidak dikenal.",
  "date-invalid": "Tanggal tidak valid (tahun 2000–2100).",
  "too-long": "Isian terlalu panjang. Persingkat lalu simpan lagi.",
  // proyek & tugas
  "project-not-found": "Proyek tidak ditemukan.",
  "project-required": "Nama proyek dan klien wajib diisi.",
  "project-name-required": "Nama proyek wajib diisi.",
  "project-client-required": "Klien wajib diisi.",
  "project-dates": "Deadline tidak boleh sebelum tanggal mulai.",
  "budget-invalid": "Nilai proyek berupa rupiah bulat, mis. 15.000.000 (tanpa koma, desimal, atau “juta”).",
  "task-not-found": "Tugas tidak ditemukan.",
  "task-title-required": "Judul tugas wajib diisi.",
  "task-edit-title-required": "Judul tugas wajib diisi.",
  "task-too-many": `Maksimal ${MAX_TASK_LINES} tugas sekaligus (satu baris = satu tugas).`,
  "task-date-invalid": "Deadline tugas tidak valid (tahun 2000–2100).",
  // portofolio
  "pf-not-found": "Karya tidak ditemukan.",
  "pf-title-required": "Judul wajib diisi.",
  "pf-feature-unpublished": "Tayangkan karya dulu sebelum menandainya unggulan.",
  "pf-slug-taken": "Slug ini sudah dipakai karya lain.",
  "pf-slug-invalid": "Slug hanya boleh berisi huruf, angka, dan tanda hubung.",
  "pf-year-invalid": "Tahun berupa 4 digit, antara 1990 dan tahun depan.",
  "pf-sort-invalid": "Urutan berupa bilangan bulat, mis. 0, 1, 2 (boleh negatif).",
  "pf-image-invalid": "Link gambar harus diawali https:// (atau / untuk file di website ini).",
  "pf-live-invalid": "Link live harus diawali https://.",
  // inbox
  "inquiry-not-found": "Inquiry tidak ditemukan.",
  // tim & akun
  "user-not-found": "Akun tidak ditemukan.",
  "user-incomplete": `Lengkapi data. Password minimal ${MIN_PASSWORD} karakter.`,
  "user-name-required": "Nama wajib diisi.",
  "user-email-invalid": "Format email tidak valid.",
  "user-password-short": `Password awal minimal ${MIN_PASSWORD} karakter.`,
  "email-taken": "Email sudah terdaftar.",
  "user-delete-self": "Tidak bisa menghapus akun sendiri.",
  "user-reset-self": "Untuk akun sendiri, pakai form Ganti password.",
  "role-invalid": "Peran tidak dikenal.",
  "last-admin": "Harus tetap ada minimal satu admin.",
  "discord-id-invalid": "Discord ID berupa 17–20 digit angka (bukan username).",
  "password-wrong": "Password lama salah.",
  "password-short": `Password baru minimal ${MIN_PASSWORD} karakter.`,
  // Discord
  "webhook-invalid": "Link webhook tidak valid. Contoh: https://discord.com/api/webhooks/123…/abc…",
  "webhook-missing": "Isi dan simpan link webhook dulu.",
  "discord-test-failed": "Gagal mengirim ke Discord. Periksa link webhook lalu coba lagi.",
  // login
  "login-blocked": "Terlalu banyak percobaan. Coba lagi 15 menit lagi.",
  "login-failed": "Email atau password salah.",
  // formulir kontak publik
  "inquiry-required": "Nama, email, dan pesan wajib diisi.",
  "inquiry-email": "Format email tidak valid.",
  "inquiry-too-long": "Pesan terlalu panjang.",
} as const;

export type OkCode = keyof typeof OK;
export type ErrCode = keyof typeof ERR;
export type FlashKind = "ok" | "err";

/** Kode error yang berarti "belum / tidak lagi login" (login menampilkannya sebagai info, bukan kesalahan isian) */
export const AUTH_INFO_ERRS: readonly string[] = ["login-required", "session-expired", "session-expired-draft"];

/** Teks tetap untuk kode flash; null bila kode tidak dikenal (jangan tampilkan apa pun) */
export function flashText(kind: FlashKind, code: string | null | undefined): string | null {
  if (!code) return null;
  const map: Record<string, string> = kind === "ok" ? OK : ERR;
  return Object.hasOwn(map, code) ? map[code]! : null;
}

/** Pesan flash dari query halaman (?ok= / ?err=), hanya kode yang dikenal */
export function readFlash(url: URL) {
  return {
    ok: flashText("ok", url.searchParams.get("ok")),
    err: flashText("err", url.searchParams.get("err")),
  };
}

/** "IN_PROGRESS" → "in-progress" */
const codePart = (key: string) => key.toLowerCase().replace(/_/g, "-");
const statusOk = (prefix: string, fallback: OkCode) => (status: string): OkCode => {
  const code = `${prefix}-${codePart(status)}`;
  return Object.hasOwn(OK, code) ? (code as OkCode) : fallback;
};

/** Kode flash untuk status tugas baru (kode umum bila status tidak dikenal) */
export const taskStatusOk = statusOk("task-status", "task-status");
/** Kode flash untuk status inquiry baru */
export const inquiryStatusOk = statusOk("inquiry-status", "inquiry-status");
/** Kode flash untuk status proyek baru */
export const projectStatusOk = statusOk("project-status", "project-status");
