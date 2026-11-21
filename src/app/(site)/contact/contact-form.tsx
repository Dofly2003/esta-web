"use client";

import { useActionState } from "react";
import { submitInquiry } from "@/lib/actions";
import { BUDGETS, SERVICES } from "@/lib/constants";
import { SubmitButton } from "@/components/ui";

export function ContactForm() {
  const [state, action] = useActionState(submitInquiry, undefined);

  if (state?.ok) {
    return (
      <div className="py-16 text-center">
        <div className="text-5xl">✅</div>
        <p className="mt-4 text-lg font-semibold">{state.ok}</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {/* honeypot: disembunyikan dari manusia */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" />
      <div>
        <label className="mb-1.5 block text-sm text-white/70">Nama *</label>
        <input name="name" required className="input-dark" placeholder="Nama Anda" />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-white/70">Email *</label>
        <input name="email" type="email" required className="input-dark" placeholder="email@perusahaan.com" />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-sm text-white/70">Perusahaan</label>
        <input name="company" className="input-dark" placeholder="Nama perusahaan (opsional)" />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-white/70">Layanan</label>
        <select name="service" className="input-dark" defaultValue="">
          <option value="">Pilih layanan</option>
          {SERVICES.map((s) => (
            <option key={s.title}>{s.title}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-white/70">Perkiraan budget</label>
        <select name="budget" className="input-dark" defaultValue="">
          <option value="">Pilih budget</option>
          {BUDGETS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-sm text-white/70">Ceritakan proyek Anda *</label>
        <textarea name="message" required rows={5} className="input-dark" placeholder="Tujuan, fitur, target waktu…" />
      </div>
      {state?.error && <p className="text-sm text-rose-400 sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <SubmitButton className="btn-primary w-full rounded-xl py-3 text-base" pendingText="Mengirim…">
          Kirim Pesan
        </SubmitButton>
      </div>
    </form>
  );
}
