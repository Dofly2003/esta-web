import Link from "next/link";
import { inquiries } from "@/lib/data";
import { deleteInquiry, updateInquiryStatus } from "@/lib/actions";
import { INQUIRY_STATUS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { Empty, PageHeader } from "@/components/dash";
import { AutoSubmitSelect, ConfirmButton } from "@/components/ui";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const items = (await inquiries.list()).filter((q) => !status || q.status === status);
  const pill = (s?: string) =>
    `rounded-full px-3 py-1 text-sm ${status === s ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200"}`;

  return (
    <>
      <PageHeader title="Inbox" subtitle="Pesan dari form Kontak di website." />
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/dashboard/inbox" className={pill(undefined)}>
          Semua
        </Link>
        {Object.entries(INQUIRY_STATUS).map(([k, v]) => (
          <Link key={k} href={`/dashboard/inbox?status=${k}`} className={pill(k)}>
            {v.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <Empty>Belum ada pesan.</Empty>
      ) : (
        <div className="space-y-3">
          {items.map((q) => (
            <article key={q.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {q.name} {q.company && <span className="font-normal text-zinc-500">· {q.company}</span>}
                  </p>
                  <a href={`mailto:${q.email}`} className="text-sm text-accent hover:underline">
                    {q.email}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">{fmtDate(q.createdAt)}</span>
                  <form action={updateInquiryStatus}>
                    <input type="hidden" name="id" value={q.id} />
                    <AutoSubmitSelect
                      name="status"
                      defaultValue={q.status}
                      options={INQUIRY_STATUS}
                      ariaLabel="Status"
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
                    />
                  </form>
                </div>
              </div>
              {(q.service || q.budget) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {q.service && <span className="badge bg-violet-50 text-violet-700">{q.service}</span>}
                  {q.budget && <span className="badge bg-zinc-100 text-zinc-600">{q.budget}</span>}
                </div>
              )}
              <p className="mt-3 whitespace-pre-line text-sm text-zinc-700">{q.message}</p>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                <a href={`mailto:${q.email}?subject=${encodeURIComponent("Re: Inquiry proyek ESTA")}`} className="btn-ghost">
                  Balas email
                </a>
                <form action={deleteInquiry}>
                  <input type="hidden" name="id" value={q.id} />
                  <ConfirmButton message="Hapus pesan ini?">Hapus</ConfirmButton>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
