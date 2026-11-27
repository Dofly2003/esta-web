// Helper kecil untuk komponen & halaman dashboard (dipakai di file .astro dan <script> halaman)

/** Atribut untuk <select> yang mengirim form-nya saat diganti dengan mouse/sentuh.
 * Ganti lewat keyboard tidak langsung mengirim: Enter atau tombol Simpan (lihat forms.ts). */
export const autoSubmit = { "data-autosubmit": "" };

/** Atribut untuk tombol hapus / publikasi dengan konfirmasi */
export const confirmAttr = (msg: string) => ({ onclick: `return confirm(${JSON.stringify(msg)})` });

/** Atribut tautan ke tab baru (dipakai NavItem & ViewOnSite); tambahkan teks "(tab baru)" untuk pembaca layar */
export const externalAttrs = { target: "_blank", rel: "noopener noreferrer" } as const;

/** Nilai aria-current: "true" untuk filter aktif, "page" untuk navigasi; undefined = atribut tidak dirender */
export const current = (on: boolean, kind: "true" | "page" = "true") => (on ? kind : undefined);

/** URL halaman ini untuk field _back: path + query (tanpa ?ok= / ?err= lama) + #anchor opsional.
 * Server mengembalikan ke URL ini, jadi anchor = baris yang diubah (mis. "task-123"). */
export function here(url: URL, anchor?: string, withSearch = true) {
  const q = new URLSearchParams(withSearch ? url.search : "");
  q.delete("ok");
  q.delete("err");
  const s = q.toString();
  return url.pathname + (s ? `?${s}` : "") + (anchor ? `#${anchor}` : "");
}

/** Kode ?err= di URL halaman ini bila termasuk salah satu `codes` (untuk error di samping field) */
export function errIn(url: URL, codes: readonly string[]) {
  const e = url.searchParams.get("err");
  return e && codes.includes(e) ? e : null;
}

/** Atribut kontrol yang error (pasangan Field `error`): aria-invalid + aria-describedby "{id}-err" */
export const invalid = (id: string, error: unknown) =>
  error ? { "aria-invalid": "true", "aria-describedby": `${id}-err` } : {};

/** Sampul karya tanpa gambar: warna karya (data) → ink (--cover-ink), sama dengan sampul di website */
export const coverBg = (color: string) => `linear-gradient(140deg, ${color} 0%, var(--cover-ink) 115%)`;

/** Pilihan penanggung jawab dengan beban kerja: "Budi Santoso · 2 terbuka" (tugas hidup, dari `load` API) */
export const withLoad = (users: { id: string; name: string }[], load: Record<string, number>) =>
  users.map((u) => ({ id: u.id, name: `${u.name} · ${load[u.id] ?? 0} terbuka` }));
