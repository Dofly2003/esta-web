import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { inquiries } from "@/lib/data";
import { logout } from "@/lib/actions";
import { initials } from "@/lib/format";
import { ROLES } from "@/lib/constants";
import { NavLinks } from "./nav-links";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const newInquiries = (await inquiries.list()).filter((q) => q.status === "NEW").length;

  const links = [
    { href: "/dashboard", label: "Ringkasan", icon: "▦" },
    { href: "/dashboard/projects", label: "Proyek", icon: "◧" },
    { href: "/dashboard/tasks", label: "Tugas", icon: "☑" },
    { href: "/dashboard/portfolio", label: "Portofolio", icon: "◈" },
    { href: "/dashboard/inbox", label: "Inbox", icon: "✉", badge: newInquiries },
    { href: "/dashboard/team", label: "Tim & Akun", icon: "◎" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 lg:flex">
      <aside className="border-b border-zinc-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:px-5 lg:py-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-sm font-black text-white">
              E
            </span>
            <span className="font-extrabold tracking-[0.18em]">ESTA</span>
          </Link>
          <Link href="/" target="_blank" className="text-xs text-zinc-500 hover:text-accent lg:hidden">
            Lihat web ↗
          </Link>
        </div>
        <NavLinks links={links} />
        <div className="hidden border-t border-zinc-200 p-4 lg:mt-auto lg:block">
          <Link href="/" target="_blank" className="mb-4 block text-xs text-zinc-500 hover:text-accent">
            Lihat website publik ↗
          </Link>
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent">
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-zinc-500">{ROLES[user.role]}</p>
            </div>
          </div>
          <form action={logout} className="mt-3">
            <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-100">
              Keluar
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
