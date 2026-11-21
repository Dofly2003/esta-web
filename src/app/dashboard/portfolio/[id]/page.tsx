import Link from "next/link";
import { notFound } from "next/navigation";
import { portfolio, projects as projectRepo } from "@/lib/data";
import { PageHeader } from "@/components/dash";
import { PortfolioForm } from "../portfolio-form";

export default async function EditPortfolio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, allProjects] = await Promise.all([portfolio.get(id), projectRepo.list()]);
  const projects = allProjects.sort((a, b) => a.name.localeCompare(b.name));
  if (!item) notFound();
  return (
    <>
      <Link href="/dashboard/portfolio" className="text-sm text-zinc-500 hover:text-accent">
        ← Portofolio
      </Link>
      <div className="mt-3">
        <PageHeader title={`Edit: ${item.title}`}>
          {item.published && (
            <Link href={`/portfolio/${item.slug}`} target="_blank" className="btn-ghost">
              Lihat di web ↗
            </Link>
          )}
        </PageHeader>
      </div>
      <PortfolioForm item={item} projects={projects} />
    </>
  );
}
