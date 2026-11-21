// Isi Firestore + Firebase Auth dengan data contoh.
//   Emulator:        npm run seed
//   Project asli:    npm run seed -- --force     (MENGHAPUS data yang ada!)
//   Hanya akun admin di project asli tanpa menghapus apa pun:
//                    npm run seed -- --admin-only --force
//   Hanya karya portofolio contoh (tanpa menghapus apa pun):
//                    npm run seed -- --portfolio-only --force
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const args = new Set(process.argv.slice(2));
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!emulator && !args.has("--force")) {
  console.error(
    `⚠  Ini akan menulis ke project Firebase ASLI (${projectId}).\n` +
      `   Tambahkan --force untuk melanjutkan, atau --admin-only --force untuk hanya membuat akun admin.`,
  );
  process.exit(1);
}

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
initializeApp(sa ? { credential: cert(JSON.parse(sa)), projectId } : { projectId });
const db = getFirestore();
const auth = getAuth();
const password = process.env.SEED_PASSWORD || "esta12345";

const d = (offsetDays) => {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + offsetDays);
  return x;
};

async function ensureUser(name, email, role) {
  let rec;
  try {
    rec = await auth.getUserByEmail(email);
  } catch {
    rec = await auth.createUser({ email, password, displayName: name });
  }
  await db.collection("users").doc(rec.uid).set({ name, email, role, createdAt: new Date() }, { merge: true });
  return rec.uid;
}

async function clear(name) {
  const snap = await db.collection(name).get();
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

async function seedPortfolio(ids = {}, skipExisting = false) {
  const base = { imageUrl: null, liveUrl: null, createdAt: new Date(), updatedAt: new Date() };
  const portfolio = [
    {
      slug: "batik-laras",
      title: "Batik Laras",
      client: "Batik Laras",
      category: "Website",
      year: 2026,
      summary: "Toko online batik dengan katalog yang mudah dijelajahi dan order langsung via WhatsApp.",
      content:
        "Batik Laras sebelumnya hanya berjualan lewat Instagram, sehingga katalog sulit dicari dan pertanyaan stok menumpuk di DM.\n\nKami merancang ulang katalog dengan filter motif dan ukuran, halaman produk yang menonjolkan detail kain, serta tombol order WhatsApp yang otomatis mengisi pesan.\n\nDalam 2 bulan, 40% order masuk lewat website dan waktu balas admin turun drastis.",
      tags: "Next.js, Tailwind, SEO, WhatsApp API",
      coverColor: "#b45309",
      featured: true,
      published: true,
      sortOrder: 1,
      projectId: ids.batik ?? null,
    },
    {
      slug: "klinik-sehat-hr",
      title: "Klinik Sehat HR",
      client: "Klinik Sehat Bersama",
      category: "Web App",
      year: 2026,
      summary: "Dashboard absensi, cuti, dan jadwal shift untuk 80+ karyawan klinik.",
      content:
        "Pengelolaan shift sebelumnya dilakukan di spreadsheet yang sering bentrok.\n\nKami membangun web app dengan jadwal shift drag & drop, alur pengajuan cuti dengan approval berjenjang, dan rekap absensi otomatis.",
      tags: "Web App, Dashboard, Firebase",
      coverColor: "#0891b2",
      featured: true,
      published: true,
      sortOrder: 2,
      projectId: ids.klinik ?? null,
    },
    {
      slug: "rumah-tumbuh",
      title: "Rumah Tumbuh",
      client: "Yayasan Rumah Tumbuh",
      category: "Website",
      year: 2025,
      summary: "Website yayasan pendidikan dengan donasi online dan laporan program yang transparan.",
      content: "Website ringan dan cepat dengan halaman program, galeri kegiatan, dan halaman donasi.",
      tags: "Website, CMS, Donasi",
      coverColor: "#16a34a",
      featured: true,
      published: true,
      sortOrder: 3,
      projectId: null,
    },
    {
      slug: "jalan-sehat-app",
      title: "JalanSehat",
      client: "Komunitas Lari Kota",
      category: "Mobile App",
      year: 2025,
      summary: "Aplikasi komunitas lari: event, tracking jarak, dan leaderboard bulanan.",
      content: "Aplikasi Android & iOS dengan pendaftaran event, check-in QR, dan leaderboard.",
      tags: "Flutter, Firebase, Maps",
      coverColor: "#e11d48",
      featured: true,
      published: true,
      sortOrder: 4,
      projectId: null,
    },
    {
      slug: "finly-banking-ui",
      title: "Finly Banking UI",
      client: "Finly",
      category: "UI/UX",
      year: 2025,
      summary: "Riset pengguna dan desain ulang alur transfer di aplikasi keuangan.",
      content: "Riset 12 pengguna, redesign alur transfer menjadi 3 langkah, dan design system komponen.",
      tags: "Figma, User Research, Design System",
      coverColor: "#6d5efc",
      featured: true,
      published: true,
      sortOrder: 5,
      projectId: null,
    },
    {
      slug: "properti-asri",
      title: "Properti Asri",
      client: "Asri Land",
      category: "Website",
      year: 2024,
      summary: "Landing page perumahan dengan simulasi KPR dan form booking kunjungan.",
      content: "Landing page dengan simulasi cicilan KPR interaktif dan form booking kunjungan.",
      tags: "Landing Page, Kalkulator KPR",
      coverColor: "#7c3aed",
      featured: false,
      published: true,
      sortOrder: 6,
      projectId: null,
    },
  ];
  for (const p of portfolio) {
    if (skipExisting && !(await db.collection("portfolio").where("slug", "==", p.slug).limit(1).get()).empty) continue;
    await db.collection("portfolio").add({ ...base, ...p });
  }
  return portfolio.length;
}

async function main() {
  const admin = await ensureUser("Admin ESTA", "admin@esta.id", "ADMIN");
  if (args.has("--admin-only")) {
    console.log("Akun admin siap: admin@esta.id");
    return;
  }
  if (args.has("--portfolio-only")) {
    // Tambah karya contoh saja (tanpa proyek/akun demo); karya dengan slug yang sama dilewati
    const n = await seedPortfolio({}, true);
    console.log(`Portofolio contoh siap (${n} karya, yang sudah ada dilewati).`);
    return;
  }

  for (const c of ["tasks", "portfolio", "projects", "inquiries"]) await clear(c);
  const rina = await ensureUser("Rina Designer", "rina@esta.id", "MEMBER");
  const budi = await ensureUser("Budi Developer", "budi@esta.id", "MEMBER");

  const projects = [
    {
      key: "batik",
      name: "Redesign Toko Batik Laras",
      client: "Batik Laras",
      type: "WEBSITE",
      status: "DONE",
      description: "Redesign toko online dengan katalog, integrasi WhatsApp order, dan SEO dasar.",
      budget: 15000000,
      startDate: d(-120),
      dueDate: d(-70),
      leadId: rina,
      tasks: [
        ["Desain katalog", "DONE", "MEDIUM", rina, -100],
        ["Development & launch", "DONE", "HIGH", budi, -72],
      ],
    },
    {
      key: "klinik",
      name: "Dashboard HR Klinik Sehat",
      client: "Klinik Sehat Bersama",
      type: "WEB_APP",
      status: "REVIEW",
      description: "Web app absensi, cuti, dan jadwal shift karyawan klinik.",
      budget: 42000000,
      startDate: d(-50),
      dueDate: d(-2),
      leadId: budi,
      tasks: [
        ["Modul absensi", "DONE", "HIGH", budi, -30],
        ["Modul cuti & approval", "DONE", "HIGH", budi, -15],
        ["Jadwal shift drag & drop", "DONE", "MEDIUM", budi, -6],
        ["UAT bersama HRD", "REVIEW", "HIGH", admin, -2],
        ["Perbaikan feedback UAT", "TODO", "HIGH", budi, 3],
      ],
    },
    {
      key: "logistik",
      name: "Website Company Profile Nusantara Logistik",
      client: "PT Nusantara Logistik",
      type: "WEBSITE",
      status: "IN_PROGRESS",
      description: "Website 6 halaman + blog, multi bahasa (ID/EN), form permintaan penawaran.",
      budget: 18000000,
      startDate: d(-20),
      dueDate: d(10),
      leadId: budi,
      tasks: [
        ["Kumpulkan materi dari klien (logo, foto, copy)", "DONE", "HIGH", admin, -15],
        ["Desain UI halaman Home & About", "DONE", "HIGH", rina, -8],
        ["Slicing Home ke Next.js", "IN_PROGRESS", "MEDIUM", budi, 2],
        ["Halaman Layanan & Kontak", "TODO", "MEDIUM", budi, 5],
        ["Setup multi bahasa", "TODO", "LOW", budi, 7],
        ["Review desain mobile dengan klien", "REVIEW", "MEDIUM", rina, -1],
      ],
    },
    {
      key: "kopi",
      name: "Aplikasi Kasir Kopi Senja",
      client: "Kopi Senja",
      type: "MOBILE_APP",
      status: "PLANNING",
      description: "Aplikasi kasir Android untuk 3 cabang: transaksi, stok bahan, laporan harian.",
      budget: 35000000,
      startDate: d(3),
      dueDate: d(60),
      leadId: admin,
      tasks: [
        ["Workshop kebutuhan dengan owner", "TODO", "HIGH", admin, 4],
        ["Susun user flow transaksi", "TODO", "MEDIUM", rina, 8],
      ],
    },
  ];

  const ids = {};
  for (const [i, { key, tasks, ...p }] of projects.entries()) {
    const at = d(-projects.length + i); // urutan "terakhir diubah"
    const ref = await db.collection("projects").add({ ...p, createdAt: at, updatedAt: at });
    ids[key] = ref.id;
    for (const [title, status, priority, assigneeId, due] of tasks) {
      await db.collection("tasks").add({
        title,
        description: "",
        status,
        priority,
        assigneeId,
        dueDate: d(due),
        projectId: ref.id,
        createdAt: at,
        updatedAt: at,
      });
    }
  }

  await seedPortfolio(ids);

  await db.collection("inquiries").add({
    name: "Sari Wulandari",
    email: "sari@contoh.com",
    company: "CV Maju Bersama",
    service: "Website Company Profile",
    budget: "Rp10–25 juta",
    message: "Halo, kami butuh website company profile untuk usaha konstruksi. Bisa jadi dalam 1 bulan?",
    status: "NEW",
    createdAt: d(-1),
  });
  await db.collection("inquiries").add({
    name: "Andi Pratama",
    email: "andi@contoh.com",
    company: "",
    service: "Mobile App",
    budget: "Belum tahu",
    message: "Mau konsultasi bikin aplikasi booking lapangan futsal.",
    status: "CONTACTED",
    createdAt: d(-4),
  });

  console.log(`Seed selesai (${emulator ? "emulator" : projectId}). Login: admin@esta.id`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
