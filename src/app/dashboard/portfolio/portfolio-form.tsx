import type { PortfolioItem, Project } from "@/lib/data";
import { deletePortfolio, savePortfolio } from "@/lib/actions";
import { PORTFOLIO_CATEGORIES } from "@/lib/constants";
import { ConfirmButton, SubmitButton } from "@/components/ui";

export function PortfolioForm({ item, projects }: { item?: PortfolioItem; projects: Project[] }) {
  return (
    <>
      <form action={savePortfolio} className="card grid gap-4 p-5 sm:grid-cols-2">
        {item && <input type="hidden" name="id" value={item.id} />}
        <div className="sm:col-span-2">
          <label className="label">Judul *</label>
          <input name="title" required defaultValue={item?.title} className="input" />
        </div>
        <div>
          <label className="label">Klien</label>
          <input name="client" defaultValue={item?.client} className="input" />
        </div>
        <div>
          <label className="label">Slug URL (kosongkan = otomatis)</label>
          <input name="slug" defaultValue={item?.slug} className="input" placeholder="nama-proyek" />
        </div>
        <div>
          <label className="label">Kategori</label>
          <select name="category" defaultValue={item?.category ?? "Website"} className="input">
            {PORTFOLIO_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Tahun</label>
          <input name="year" inputMode="numeric" defaultValue={item?.year ?? new Date().getFullYear()} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Ringkasan (1–2 kalimat)</label>
          <textarea name="summary" rows={2} defaultValue={item?.summary} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Cerita proyek (pisahkan paragraf dengan baris kosong)</label>
          <textarea name="content" rows={7} defaultValue={item?.content} className="input" placeholder="Tantangan, solusi, hasil…" />
        </div>
        <div>
          <label className="label">Teknologi / tag (pisah koma)</label>
          <input name="tags" defaultValue={item?.tags} className="input" placeholder="Next.js, Figma, SEO" />
        </div>
        <div>
          <label className="label">Link live (opsional)</label>
          <input name="liveUrl" type="url" defaultValue={item?.liveUrl ?? ""} className="input" placeholder="https://" />
        </div>
        <div>
          <label className="label">Link gambar cover (kosongkan = pakai warna)</label>
          <input name="imageUrl" type="url" defaultValue={item?.imageUrl ?? ""} className="input" placeholder="https://… .jpg / .png / .webp" />
          <p className="mt-1 text-[11px] text-zinc-400">Bisa dari Imgur, Cloudinary, atau hosting gambar lain.</p>
        </div>
        <div>
          <label className="label">Warna cover (dipakai jika tanpa gambar)</label>
          <input name="coverColor" type="color" defaultValue={item?.coverColor ?? "#6d5efc"} className="h-10 w-20 rounded-lg border border-zinc-300" />
        </div>
        <div>
          <label className="label">Terhubung ke proyek internal</label>
          <select name="projectId" defaultValue={item?.projectId ?? ""} className="input">
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Urutan tampil (kecil = duluan)</label>
          <input name="sortOrder" inputMode="numeric" defaultValue={item?.sortOrder ?? 0} className="input" />
        </div>
        <div className="flex flex-wrap gap-6 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="published" defaultChecked={item?.published ?? false} /> Tayang di website
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="featured" defaultChecked={item?.featured ?? false} /> Unggulan di Beranda
          </label>
        </div>
        <div className="sm:col-span-2">
          <SubmitButton>Simpan karya</SubmitButton>
        </div>
      </form>
      {item && (
        <form action={deletePortfolio} className="mt-4">
          <input type="hidden" name="id" value={item.id} />
          <ConfirmButton message="Hapus karya ini dari portofolio?">Hapus karya</ConfirmButton>
        </form>
      )}
    </>
  );
}
