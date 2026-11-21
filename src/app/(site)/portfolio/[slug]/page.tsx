import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { portfolio } from "@/lib/data";
import { Cover, PortfolioCard } from "@/components/portfolio-card";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await portfolio.bySlug(slug);
  return item ? { title: item.title, description: item.summary } : {};
}

export default async function PortfolioDetail({ params }: Props) {
  const { slug } = await params;
  const item = await portfolio.bySlug(slug);
  if (!item || !item.published) notFound();

  const others = (await portfolio.list({ published: true })).filter((p) => p.id !== item.id).slice(0, 3);
  const tags = item.tags.split(",").map((t) => t.trim()).filter(Boolean);
  const paragraphs = item.content.split(/\n\s*\n/).filter(Boolean);

  return (
    <article className="mx-auto max-w-6xl px-4 py-16">
      <Link href="/portfolio" className="text-sm text-white/60 hover:text-white">
        ← Semua karya
      </Link>
      <h1 className="mt-6 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">{item.title}</h1>
      {item.summary && <p className="mt-5 max-w-2xl text-lg text-white/60">{item.summary}</p>}

      <dl className="mt-10 grid grid-cols-2 gap-6 border-y border-white/10 py-6 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-white/40">Klien</dt>
          <dd className="mt-1 font-semibold">{item.client || "—"}</dd>
        </div>
        <div>
          <dt className="text-white/40">Kategori</dt>
          <dd className="mt-1 font-semibold">{item.category}</dd>
        </div>
        <div>
          <dt className="text-white/40">Tahun</dt>
          <dd className="mt-1 font-semibold">{item.year}</dd>
        </div>
        <div>
          <dt className="text-white/40">Link</dt>
          <dd className="mt-1 font-semibold">
            {item.liveUrl ? (
              <a href={item.liveUrl} target="_blank" rel="noreferrer" className="text-accent-2 hover:underline">
                Kunjungi ↗
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-10 aspect-[16/9] overflow-hidden rounded-3xl bg-ink-3">
        <Cover item={item} />
      </div>

      <div className="mt-12 grid gap-10 md:grid-cols-3">
        <div className="space-y-5 text-white/75 md:col-span-2">
          {paragraphs.length ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p>{item.summary}</p>}
        </div>
        {tags.length > 0 && (
          <div>
            <p className="mb-3 text-sm font-semibold">Teknologi & lingkup</p>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <span key={t} className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {others.length > 0 && (
        <section className="mt-24 border-t border-white/10 pt-12">
          <h2 className="text-2xl font-extrabold">Karya lainnya</h2>
          <div className="mt-8 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((o) => (
              <PortfolioCard key={o.id} item={o} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
