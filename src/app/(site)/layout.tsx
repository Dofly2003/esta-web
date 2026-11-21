import Link from "next/link";
import { BRAND } from "@/lib/constants";

const nav = [
  { href: "/", label: "Beranda" },
  { href: "/#layanan", label: "Layanan" },
  { href: "/portfolio", label: "Portofolio" },
  { href: "/contact", label: "Kontak" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-white">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-lg font-black">
        E
      </span>
      <span className="text-lg font-extrabold tracking-[0.2em]">{BRAND.name}</span>
    </Link>
  );
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink text-white">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-white/70 md:flex">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden text-sm text-white/60 hover:text-white sm:block">
              Login Tim
            </Link>
            <Link href="/contact" className="btn-primary rounded-full">
              Mulai Proyek
            </Link>
          </div>
        </div>
        {/* nav mobile */}
        <nav className="flex gap-5 overflow-x-auto px-4 pb-3 text-sm text-white/70 md:hidden">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 hover:text-white">
              {n.label}
            </Link>
          ))}
          <Link href="/login" className="shrink-0 hover:text-white">
            Login Tim
          </Link>
        </nav>
      </header>

      <main>{children}</main>

      <footer className="border-t border-white/5">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-4 max-w-sm text-sm text-white/50">
              {BRAND.tagline} yang membantu bisnis tumbuh lewat website, aplikasi web, dan mobile app.
            </p>
          </div>
          <div className="text-sm">
            <p className="mb-3 font-semibold">Navigasi</p>
            <ul className="space-y-2 text-white/50">
              {nav.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="hover:text-white">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="text-sm">
            <p className="mb-3 font-semibold">Kontak</p>
            <ul className="space-y-2 text-white/50">
              <li>{BRAND.email}</li>
              <li>{BRAND.phone}</li>
              <li>{BRAND.address}</li>
            </ul>
          </div>
        </div>
        <p className="border-t border-white/5 py-6 text-center text-xs text-white/40">
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
