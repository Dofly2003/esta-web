import type { Metadata } from "next";
import { BRAND } from "@/lib/constants";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Kontak" };

export default function ContactPage() {
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 md:grid-cols-5">
      <div className="md:col-span-2">
        <p className="text-sm font-semibold text-accent-2">Kontak</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">Mari diskusikan proyek Anda.</h1>
        <p className="mt-4 text-white/60">
          Isi form, atau hubungi kami langsung. Konsultasi awal gratis dan tanpa komitmen.
        </p>
        <ul className="mt-10 space-y-5 text-sm">
          <li>
            <p className="text-white/40">Email</p>
            <a href={`mailto:${BRAND.email}`} className="font-semibold hover:text-accent-2">
              {BRAND.email}
            </a>
          </li>
          <li>
            <p className="text-white/40">WhatsApp</p>
            <a
              href={`https://wa.me/${BRAND.whatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold hover:text-accent-2"
            >
              {BRAND.phone}
            </a>
          </li>
          <li>
            <p className="text-white/40">Lokasi</p>
            <p className="font-semibold">{BRAND.address}</p>
          </li>
        </ul>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 md:col-span-3">
        <ContactForm />
      </div>
    </section>
  );
}
