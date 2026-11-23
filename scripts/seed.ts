// Isi database KOSONG dengan data contoh (untuk development/demo).
//   bun run db:seed            → hanya jika belum ada akun
//   bun run db:seed --force    → hapus semua data lalu isi ulang
// Semua akun contoh memakai SEED_PASSWORD dari .env.
import { db } from "../server/db";
import { hashPassword } from "../server/auth";
import { inquiries, portfolio, projects, tasks, users } from "../server/repo";

const force = process.argv.includes("--force");
if (users.count() > 0 && !force) {
  console.error("Database sudah berisi data. Tambahkan --force untuk menghapus dan mengisi ulang.");
  process.exit(1);
}
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 8) {
  console.error("Isi SEED_PASSWORD (min. 8 karakter) di .env dulu.");
  process.exit(1);
}

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hash = await hashPassword(password);

db.transaction(() => {
  if (force)
    db.exec(
      "DELETE FROM tasks; DELETE FROM portfolio; DELETE FROM projects; DELETE FROM inquiries; DELETE FROM sessions; DELETE FROM users;",
    );

  const admin = users.create({ name: "Admin ESTA", email: "admin@esta.id", role: "ADMIN", passwordHash: hash });
  const rina = users.create({ name: "Rina Designer", email: "rina@esta.id", role: "MEMBER", passwordHash: hash });
  const budi = users.create({ name: "Budi Developer", email: "budi@esta.id", role: "MEMBER", passwordHash: hash });

  const p1 = projects.create({
    name: "Website Company Profile Nusantara Logistik",
    client: "PT Nusantara Logistik",
    type: "WEBSITE",
    status: "IN_PROGRESS",
    description: "Website 6 halaman + blog, multi bahasa (ID/EN), form permintaan penawaran.",
    budget: 18_000_000,
    startDate: day(-20),
    dueDate: day(10),
    leadId: budi,
  });
  const p2 = projects.create({
    name: "Aplikasi Kasir Kopi Senja",
    client: "Kopi Senja",
    type: "MOBILE_APP",
    status: "PLANNING",
    description: "Aplikasi kasir Android untuk 3 cabang.",
    budget: 35_000_000,
    startDate: day(3),
    dueDate: day(60),
    leadId: admin,
  });
  const t = (title: string, status: string, priority: string, assigneeId: string, due: number, projectId: string) =>
    tasks.create({ title, description: "", status, priority, dueDate: day(due), projectId, assigneeId });
  t("Kumpulkan materi dari klien", "DONE", "HIGH", admin, -15, p1);
  t("Desain UI halaman Home & About", "DONE", "HIGH", rina, -8, p1);
  t("Slicing Home ke Astro", "IN_PROGRESS", "MEDIUM", budi, 2, p1);
  t("Halaman Layanan & Kontak", "TODO", "MEDIUM", budi, 5, p1);
  t("Review desain mobile dengan klien", "REVIEW", "MEDIUM", rina, -1, p1);
  t("Workshop kebutuhan dengan owner", "TODO", "HIGH", admin, 4, p2);

  const base = { imageUrl: null, liveUrl: null, projectId: null, content: "" };
  portfolio.create({
    ...base,
    slug: "batik-laras",
    title: "Batik Laras",
    client: "Batik Laras",
    category: "Website",
    year: 2026,
    summary: "Toko online batik dengan katalog dan order via WhatsApp.",
    tags: "Astro, SEO",
    coverColor: "#b45309",
    featured: true,
    published: true,
    sortOrder: 1,
  });
  portfolio.create({
    ...base,
    slug: "klinik-sehat-hr",
    title: "Klinik Sehat HR",
    client: "Klinik Sehat Bersama",
    category: "Web App",
    year: 2026,
    summary: "Dashboard absensi, cuti, dan jadwal shift.",
    tags: "Web App, Dashboard",
    coverColor: "#0891b2",
    featured: true,
    published: true,
    sortOrder: 2,
  });
  portfolio.create({
    ...base,
    slug: "jalan-sehat-app",
    title: "JalanSehat",
    client: "Komunitas Lari Kota",
    category: "Mobile App",
    year: 2025,
    summary: "Aplikasi komunitas lari: event & leaderboard.",
    tags: "Flutter",
    coverColor: "#e11d48",
    featured: true,
    published: true,
    sortOrder: 3,
  });

  inquiries.create({
    name: "Sari Wulandari",
    email: "sari@contoh.com",
    company: "CV Maju Bersama",
    service: "Website Company Profile",
    budget: "Rp10–25 juta",
    message: "Kami butuh website company profile. Bisa jadi dalam 1 bulan?",
  });
})();

console.log("Seed selesai. Login: admin@esta.id / rina@esta.id / budi@esta.id (password = SEED_PASSWORD di .env)");
