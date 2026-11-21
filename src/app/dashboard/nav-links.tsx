"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type L = { href: string; label: string; icon: string; badge?: number };

export function NavLinks({ links }: { links: L[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
      {links.map((l) => {
        const active = l.href === "/dashboard" ? path === l.href : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-accent/10 text-accent" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <span className="w-4 text-center opacity-70">{l.icon}</span>
            {l.label}
            {!!l.badge && (
              <span className="ml-auto rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{l.badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
