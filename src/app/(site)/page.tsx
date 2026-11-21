import Link from "next/link";
import { portfolio, projects } from "@/lib/data";
import { SERVICES } from "@/lib/constants";
import { PortfolioCard } from "@/components/portfolio-card";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "01", title: "Diskusi & Riset", desc: "Memahami tujuan bisnis, pengguna, dan kebutuhan fitur." },
  { n: "02", title: "Desain UI/UX", desc: "Wireframe dan prototipe interaktif untuk disetujui bersama." },
  { n: "03", title: "Development", desc: "Dibangun bertahap dengan progres yang bisa Anda pantau." },
  { n: "04", title: "Launch & Support", desc: "Go-live, training, dan dukungan setelah peluncuran." },
];

export default async function HomePage() {
  const [published, allProjects] = await Promise.all([portfolio.list({ published: true }), projects.list()]);
  const featured = published.filter((p) => p.featured).slice(0, 6);
  const doneCount = allProjects.filter((p) => p.status === "DONE").length;
  const clients = new Set([...allProjects.map((p) => p.client), ...published.map((p) => p.client)].filter(Boolean));
  const publishedCount = published.length;

  const stats = [
    { value: Math.max(doneCount, publishedCount), label: "Proyek selesai" },
    { value: clients.size, label: "Klien dilayani" },
    { value: SERVICES.length, label: "Layanan utama" },
  ];

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-accent/30 blur-[120px]" />
        <div className="pointer-events-none absolute top-40 -right-20 h-72 w-72 rounded-full bg-accent-2/20 blur-[100px]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-20 md:pt-28">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Menerima proyek baru
          </p>
          <h1 className="max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Kami membangun{" "}
            <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
              produk digital
            </span>{" "}
            yang bekerja untuk bisnis Anda.
          </h1>
          <p className="mt-6 max-w-xl text-base text-white/60 sm:text-lg">
            Website company profile, aplikasi web, dan mobile app — dirancang rapi, dibangun cepat, dan mudah
            dikembangkan.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/contact" className="btn-primary rounded-full px-6 py-3 text-base">
              Konsultasi Gratis →
            </Link>
            <Link
              href="/portfolio"
              className="btn rounded-full border border-white/15 px-6 py-3 text-base text-white hover:bg-white/5"
            >
              Lihat Portofolio
            </Link>
          </div>

          <dl className="mt-16 grid max-w-2xl grid-cols-3 gap-6 border-t border-white/10 pt-8">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-xs text-white/50 sm:text-sm">{s.label}</dt>
                <dd className="mt-1 text-3xl font-extrabold sm:text-4xl">{s.value}+</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* LAYANAN */}
      <section id="layanan" className="scroll-mt-24 border-t border-white/5 bg-ink-2">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="text-sm font-semibold text-accent-2">Layanan</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            Satu tim untuk desain sampai development.
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-accent/60"
              >
                <div className="text-3xl">{s.icon}</div>
                <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-white/55">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PORTOFOLIO */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-accent-2">Portofolio</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Karya pilihan</h2>
          </div>
          <Link href="/portfolio" className="text-sm text-white/70 hover:text-white">
            Semua karya →
          </Link>
        </div>
        {featured.length === 0 ? (
          <p className="mt-10 text-white/50">Belum ada karya yang ditampilkan.</p>
        ) : (
          <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((item) => (
              <PortfolioCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* PROSES */}
      <section className="border-t border-white/5 bg-ink-2">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="text-sm font-semibold text-accent-2">Cara kerja</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Proses yang transparan</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="border-t border-white/15 pt-5">
                <span className="text-sm font-bold text-accent">{s.n}</span>
                <h3 className="mt-2 font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-white/55">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-[#3b2fd0] px-6 py-14 text-center sm:px-12">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent-2/40 blur-3xl" />
          <h2 className="relative text-3xl font-extrabold tracking-tight sm:text-4xl">Punya ide proyek?</h2>
          <p className="relative mx-auto mt-3 max-w-lg text-white/80">
            Ceritakan kebutuhan Anda. Kami bantu susun scope, estimasi waktu, dan biaya.
          </p>
          <Link href="/contact" className="btn relative mt-8 rounded-full bg-white px-6 py-3 text-base text-ink hover:bg-white/90">
            Hubungi Kami
          </Link>
        </div>
      </section>
    </>
  );
}
