import { initials } from "@/lib/format";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Badge({ opt, fallback }: { opt?: { label: string; cls: string }; fallback?: string }) {
  if (!opt) return <span className="badge bg-zinc-100 text-zinc-600">{fallback}</span>;
  return <span className={`badge ${opt.cls}`}>{opt.label}</span>;
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
        <div
          className={`h-full rounded-full ${value === 100 ? "bg-emerald-500" : "bg-accent"}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-zinc-500">{value}%</span>
    </div>
  );
}

export function Avatar({ name, size = "h-6 w-6" }: { name?: string | null; size?: string }) {
  if (!name) return <span className={`${size} grid place-items-center rounded-full border border-dashed border-zinc-300 text-[10px] text-zinc-400`}>?</span>;
  return (
    <span
      title={name}
      className={`${size} grid shrink-0 place-items-center rounded-full bg-accent/10 text-[10px] font-bold text-accent`}
    >
      {initials(name)}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">{children}</p>;
}
