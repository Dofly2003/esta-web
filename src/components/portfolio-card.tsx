import Link from "next/link";
import type { PortfolioItem } from "@/lib/data";

export function Cover({ item, className = "" }: { item: PortfolioItem; className?: string }) {
  if (item.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.imageUrl} alt={item.title} className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div
      className={`relative flex h-full w-full items-end overflow-hidden p-6 ${className}`}
      style={{
        background: `radial-gradient(120% 90% at 85% 10%, ${item.coverColor}cc 0%, transparent 55%), linear-gradient(135deg, ${item.coverColor} 0%, #0b0d12 110%)`,
      }}
    >
      <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full border border-white/20" />
      <div className="absolute right-10 top-16 h-24 w-24 rounded-2xl border border-white/20 rotate-12" />
      <span className="text-3xl font-extrabold tracking-tight text-white/90">{item.title}</span>
    </div>
  );
}

export function PortfolioCard({ item }: { item: PortfolioItem }) {
  return (
    <Link href={`/portfolio/${item.slug}`} className="group block">
      <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-ink-3">
        <Cover item={item} className="transition duration-500 group-hover:scale-105" />
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-white group-hover:text-accent-2">{item.title}</h3>
          <p className="text-sm text-white/50">{item.client}</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">
          {item.category}
        </span>
      </div>
    </Link>
  );
}
