import Link from "next/link";
import { portfolio } from "@/lib/data";
import { togglePortfolio } from "@/lib/actions";
import { Empty, PageHeader } from "@/components/dash";

function Toggle({ id, field, on, label }: { id: string; field: string; on: boolean; label: string }) {
  return (
    <form action={togglePortfolio}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <button
        className={`badge border ${on ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-white text-zinc-400"}`}
        title={`Klik untuk ${on ? "matikan" : "aktifkan"}`}
      >
        {on ? "✓ " : ""}
        {label}
      </button>
    </form>
  );
}

export default async function PortfolioAdmin() {
  const items = await portfolio.list();

  return (
    <>
      <PageHeader title="Portofolio" subtitle="Karya yang tampil di website utama. Atur publikasi dan karya unggulan di Beranda.">
        <Link href="/portfolio" target="_blank" className="btn-ghost">
          Lihat di web ↗
        </Link>
        <Link href="/dashboard/portfolio/new" className="btn-primary">
          + Tambah karya
        </Link>
      </PageHeader>

      {items.length === 0 ? (
        <Empty>Belum ada karya.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="card overflow-hidden">
              <Link href={`/dashboard/portfolio/${item.id}`} className="block aspect-[16/9] overflow-hidden">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div
                    className="flex h-full items-end p-4 text-lg font-extrabold text-white"
                    style={{ background: `linear-gradient(135deg, ${item.coverColor}, #0b0d12)` }}
                  >
                    {item.title}
                  </div>
                )}
              </Link>
              <div className="p-4">
                <Link href={`/dashboard/portfolio/${item.id}`} className="font-semibold hover:text-accent">
                  {item.title}
                </Link>
                <p className="text-xs text-zinc-500">
                  {item.client} · {item.category} · {item.year}
                </p>
                <div className="mt-3 flex gap-2">
                  <Toggle id={item.id} field="published" on={item.published} label="Tayang" />
                  <Toggle id={item.id} field="featured" on={item.featured} label="Unggulan" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
