import Link from "next/link";
import type { Metadata } from "next";
import { portfolio } from "@/lib/data";
import { PORTFOLIO_CATEGORIES } from "@/lib/constants";
import { PortfolioCard } from "@/components/portfolio-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portofolio" };

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ kategori?: string }>;
}) {
  const { kategori } = await searchParams;
  const items = (await portfolio.list({ published: true })).filter((p) => !kategori || p.category === kategori);

  const filters = [{ label: "Semua", value: "" }, ...PORTFOLIO_CATEGORIES.map((c) => ({ label: c, value: c }))];

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <p className="text-sm font-semibold text-accent-2">Portofolio</p>
      <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">Karya kami</h1>
      <p className="mt-4 max-w-xl text-white/60">
        Beberapa proyek website, aplikasi, dan desain yang telah kami kerjakan bersama klien.
      </p>

      <div className="mt-10 flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = (kategori ?? "") === f.value;
          return (
            <Link
              key={f.label}
              href={f.value ? `/portfolio?kategori=${encodeURIComponent(f.value)}` : "/portfolio"}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                active ? "border-accent bg-accent text-white" : "border-white/15 text-white/70 hover:text-white"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="mt-16 text-white/50">Belum ada karya di kategori ini.</p>
      ) : (
        <div className="mt-12 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <PortfolioCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
