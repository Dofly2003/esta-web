import Link from "next/link";
import { projects as projectRepo } from "@/lib/data";
import { PageHeader } from "@/components/dash";
import { PortfolioForm } from "../portfolio-form";

export default async function NewPortfolio() {
  const projects = (await projectRepo.list()).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <Link href="/dashboard/portfolio" className="text-sm text-zinc-500 hover:text-accent">
        ← Portofolio
      </Link>
      <div className="mt-3">
        <PageHeader title="Tambah karya" />
      </div>
      <PortfolioForm projects={projects} />
    </>
  );
}
