import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Login Tim" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (!error && (await getSession())) redirect("/dashboard");
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-ink px-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-accent/25 blur-[120px]" />
      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-white">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-lg font-black">
            E
          </span>
          <span className="text-xl font-extrabold tracking-[0.2em]">ESTA</span>
        </Link>
        <div className="rounded-2xl border border-white/10 bg-ink-2 p-6 shadow-2xl">
          <h1 className="text-lg font-bold text-white">Masuk ke Dashboard</h1>
          <p className="mb-6 mt-1 text-sm text-white/50">Tracking proyek, tugas, dan portofolio.</p>
          <LoginForm
            next={next ?? ""}
            initialError={error === "no-profile" ? "Akun ini belum terdaftar sebagai anggota tim." : undefined}
          />
        </div>
        <p className="mt-6 text-center text-xs text-white/40">
          <Link href="/" className="hover:text-white">
            ← Kembali ke website
          </Link>
        </p>
      </div>
    </div>
  );
}
