// Contoh island React: form kontak dengan status kirim tanpa reload.
// (Tanpa JavaScript pun form tetap jalan karena action-nya langsung ke API.)
import { useState, type FormEvent } from "react";
import { BUDGETS, SERVICES } from "../../shared/constants";

const label = "mb-1.5 block text-sm text-white/70";

export default function ContactForm() {
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState({});
    try {
      const res = await fetch("/api/public/inquiries", {
        method: "POST",
        headers: { accept: "application/json" },
        body: new FormData(e.currentTarget),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      setState(res.ok ? { ok: body.message } : { error: body.error ?? "Gagal mengirim pesan." });
    } catch {
      setState({ error: "Tidak bisa terhubung ke server. Coba lagi." });
    } finally {
      setPending(false);
    }
  }

  if (state.ok) {
    return (
      <div className="py-16 text-center">
        <div className="text-5xl">✅</div>
        <p className="mt-4 text-lg font-semibold">{state.ok}</p>
      </div>
    );
  }

  return (
    <form method="post" action="/api/public/inquiries" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" />
      <div>
        <label className={label}>Nama *</label>
        <input name="name" required className="input-dark" placeholder="Nama Anda" />
      </div>
      <div>
        <label className={label}>Email *</label>
        <input name="email" type="email" required className="input-dark" placeholder="email@perusahaan.com" />
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Perusahaan</label>
        <input name="company" className="input-dark" placeholder="Nama perusahaan (opsional)" />
      </div>
      <div>
        <label className={label}>Layanan</label>
        <select name="service" className="input-dark" defaultValue="">
          <option value="">Pilih layanan</option>
          {SERVICES.map((s) => (
            <option key={s.title}>{s.title}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label}>Perkiraan budget</label>
        <select name="budget" className="input-dark" defaultValue="">
          <option value="">Pilih budget</option>
          {BUDGETS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Ceritakan proyek Anda *</label>
        <textarea name="message" required rows={5} className="input-dark" placeholder="Tujuan, fitur, target waktu…" />
      </div>
      {state.error && <p className="text-sm text-rose-400 sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn-primary w-full rounded-xl py-3 text-base">
          {pending ? "Mengirim…" : "Kirim Pesan"}
        </button>
      </div>
    </form>
  );
}
