// Island React: form konsultasi dengan status kirim tanpa reload.
// (Tanpa JavaScript pun form tetap jalan karena action-nya langsung ke API.)
import { useId, useState, type FormEvent } from "react";
import { BUDGETS, SERVICES, SERVICE_GROUPS } from "../../shared/constants";
import { ARROW_PATH, ARROW_VIEWBOX } from "../lib/icons";

const labelCls = "mono mb-2 block text-[11px] text-white/55";
const groups = (Object.keys(SERVICE_GROUPS) as (keyof typeof SERVICE_GROUPS)[]).map((key) => ({
  label: SERVICE_GROUPS[key].title,
  items: SERVICES.filter((s) => s.group === key),
}));

export default function ContactForm() {
  const id = useId();
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState({});
    try {
      const res = await fetch("/api/public/inquiries", {
        method: "POST",
        headers: { accept: "application/json" },
        body: new FormData(e.currentTarget),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      setState(res.ok ? { ok: body.message } : { error: body.error ?? "Gagal mengirim pesan." });
    } catch {
      setState({ error: "Tidak bisa terhubung ke server. Coba lagi." });
    } finally {
      setPending(false);
    }
  }

  if (state.ok) {
    return (
      <div className="py-16" role="status">
        <p className="font-pixel text-5xl tracking-[-0.04em]">Terkirim.</p>
        <p className="mt-4 max-w-sm text-white/70">{state.ok}</p>
      </div>
    );
  }

  const f = (name: string) => `${id}-${name}`;
  return (
    <form method="post" action="/api/public/inquiries" onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div>
        <label htmlFor={f("name")} className={labelCls}>
          Nama *
        </label>
        <input
          id={f("name")}
          name="name"
          required
          autoComplete="name"
          className="input-dark"
          placeholder="mis. Rina Wijaya…"
        />
      </div>
      <div>
        <label htmlFor={f("email")} className={labelCls}>
          Email *
        </label>
        <input
          id={f("email")}
          name="email"
          type="email"
          required
          autoComplete="email"
          spellCheck={false}
          className="input-dark"
          placeholder="nama@bisnis.com"
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={f("company")} className={labelCls}>
          Bisnis / perusahaan
        </label>
        <input
          id={f("company")}
          name="company"
          autoComplete="organization"
          className="input-dark"
          placeholder="Opsional, mis. Toko Batik Laras…"
        />
      </div>
      <div>
        <label htmlFor={f("service")} className={labelCls}>
          Layanan
        </label>
        <select id={f("service")} name="service" className="input-dark" defaultValue="">
          <option value="">Pilih layanan</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((s) => (
                <option key={s.title}>{s.title}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={f("budget")} className={labelCls}>
          Perkiraan budget
        </label>
        <select id={f("budget")} name="budget" className="input-dark" defaultValue="">
          <option value="">Pilih budget</option>
          {BUDGETS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={f("message")} className={labelCls}>
          Ceritakan proyekmu *
        </label>
        <textarea
          id={f("message")}
          name="message"
          required
          rows={5}
          className="input-dark"
          placeholder="Tujuan, fitur yang dibutuhkan, target waktu…"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-rose-400 sm:col-span-2">
          {state.error}
        </p>
      )}
      <div className="flex sm:col-span-2">
        <button type="submit" disabled={pending} className="rbtn w-full disabled:opacity-60">
          <span className="rbtn-icon grad" aria-hidden="true">
            <svg width="14" height="12" viewBox={ARROW_VIEWBOX} shapeRendering="crispEdges">
              <path d={ARROW_PATH} fill="currentColor" />
            </svg>
          </span>
          <span className="rbtn-label flex-1 justify-center bg-white! text-ink!">
            {pending ? "Mengirim…" : "Kirim pesan"}
          </span>
        </button>
      </div>
    </form>
  );
}
