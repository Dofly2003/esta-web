// Form karya portofolio, dua tahap dengan cek slug di database (rute) di antaranya:
// A) judul wajib → panjang judul → format slug; [slug sudah dipakai? → pf-slug-taken + saran]
// B) tahun → urutan → link gambar (panjang, format) → link live (panjang, format) → panjang klien/ringkasan/isi/tag.
import { check, maxLength, nonEmpty, object, pipe, transform } from "valibot";
import { MAX_LEN, portfolioCategory } from "../../shared/constants";
import { currentYear, slugify } from "../../shared/format";
import { flag, hexColor, link, nullIfEmpty, str, text } from "./fields";

export const portfolioFormA = object({
  title: pipe(str(), nonEmpty("pf-title-required"), maxLength(MAX_LEN.pfTitle, "too-long")),
  /** "" = otomatis dari judul (dibuat unik oleh rute); diisi = slugify, tidak boleh jadi kosong */
  slug: pipe(
    str(),
    check((raw) => !raw || !!slugify(raw), "pf-slug-invalid"),
    transform((raw) => (raw ? slugify(raw) : "")),
  ),
});

export const portfolioFormB = object({
  year: pipe(
    str(),
    check((y) => !y || (/^\d{4}$/.test(y) && +y >= 1990 && +y <= currentYear() + 1), "pf-year-invalid"),
    transform((y) => (y ? Number(y) : currentYear())),
  ),
  sortOrder: pipe(
    str(),
    check((v) => !v || /^-?\d{1,6}$/.test(v), "pf-sort-invalid"),
    transform((v) => (v ? Number(v) : 0)),
  ),
  imageUrl: link("pf-image-invalid", true),
  liveUrl: link("pf-live-invalid"),
  published: flag(),
  featured: flag(),
  client: text(MAX_LEN.client),
  category: pipe(str(), transform(portfolioCategory)),
  summary: text(MAX_LEN.pfSummary),
  content: text(MAX_LEN.pfContent),
  tags: text(MAX_LEN.pfTags),
  coverColor: hexColor(),
  projectId: nullIfEmpty(),
});

/** field=published|featured (selain featured = published); value on/off, lainnya (null) = dibalik */
export const toggleForm = object({
  field: pipe(
    str(),
    transform((v): "featured" | "published" => (v === "featured" ? "featured" : "published")),
  ),
  value: pipe(
    str(),
    transform((v): boolean | null => (v === "on" ? true : v === "off" ? false : null)),
  ),
});
