// Peningkatan progresif untuk semua form & popover dashboard (dan login). Tanpa JS semuanya tetap
// jalan: form POST biasa + redirect 303 dengan ?ok= / ?err= (+ #anchor baris). Dipanggil sekali per
// halaman dari Dash.astro / login.astro: `import { enhance } from "…/forms"; enhance();`
//
//   select[data-autosubmit]   mouse/sentuh → langsung kirim; keyboard → Enter, atau tombol Simpan
//                             (.status-save) yang muncul saat nilai berubah
//   form[method=post]         status mengirim: tombol pengirim aria-disabled + "Menyimpan…"
//                             (data-pending-label), kiriman ganda diblokir
//   form[data-keep="kunci"]   isian (yang diubah pengguna) disimpan di sessionStorage saat dikirim (tanpa
//                             password/hidden), dipulihkan bila halaman kembali dengan ?err= untuk form itu;
//                             error ditaruh di samping field. Bila sesi berakhir saat mengirim, isian ikut
//                             "menyeberang" halaman login dan dipulihkan di halaman asal setelah masuk lagi.
//   form[data-keep-ok="kode"] + data-keep-fields="a b"  setelah ?ok=kode, field a/b diisi lagi (mis. PJ & prioritas
//                             terakhir saat menambah beberapa tugas berturut-turut)
//   [data-focus-ok="kode"]    elemen difokus setelah ?ok=kode (mis. judul tugas setelah "Tambah")
//   form[data-guard]          peringatan beforeunload bila ada perubahan belum disimpan (hilang saat dikirim / reset)
//   details.pop               popover: Esc / klik di luar (juga latar redup lembar bawah) menutup (perubahan tetap
//                             ada, ditandai data-unsaved), satu terbuka, fokus kembali ke summary. Penempatan: sisi
//                             dengan ruang terbanyak (.is-up), tinggi dibatasi ke ruang itu; di dalam wadah gulir
//                             (papan kanban < 1200px) panel diposisikan fixed agar tidak terpotong.
//                             [data-pop-close] = tombol Batal (membuang perubahan: form.reset());
//                             [data-pop-dismiss] = tombol tutup (x) lembar bawah (seperti Esc)
//   .seg                      filter bersegmen yang digulir mendatar: .is-scroll / .at-end (pudar di tepi)
//   .flash-wrap               tombol tutup, ?ok/?err dihapus dari URL (reload tidak mengulang pesan)
//   [data-row]:target         baris tujuan #anchor difokuskan; bila barisnya tidak ada lagi (mis. hilang dari
//                             filter), [data-anchor-fallback] atau <main> yang difokus
//   input[data-rupiah]        pratinjau "Rp 15.000.000" di output[data-rupiah-out] sebelahnya (atau peringatan format)
//   input[data-min-from="#id"] atribut min mengikuti tanggal di #id (deadline ≥ mulai)
//   textarea[data-enter-submit] Enter = kirim, Shift+Enter = baris baru
//   [autofocus]               difokus ulang setelah browser menggulir ke #anchor
//   a[href^="#"] ke <details> tertutup → dibuka (mis. "Ubah" status proyek → #edit)
//   details.pop[data-lazy="kunci"] isi panel dimuat saat dibuka (form edit tugas): panel berisi tautan cadangan
//                             (tanpa JS = halaman form penuh); dengan JS isi diambil dari <href tautan>/form
//                             (fragmen HTML same-origin, tanpa skrip) lalu popover dibuka. Gagal / sesi berakhir →
//                             pindah ke halaman form penuh. Form berkunci itu dimuat dulu bila perlu dipulihkan
//                             (?err=, draf sesi berakhir).
//
// Listener didelegasikan ke document (fase capture: juga menangkap event yang tidak bubble, mis. toggle, reset),
// jadi form yang dimuat belakangan langsung ikut, tanpa pemindaian ulang DOM per scroll / klik.

const KEEP_KEY = "esta-form-last";
/** isian yang menunggu login ulang (sesi berakhir saat mengirim) */
const DRAFT_KEY = "esta-form-draft";
const DRAFT_TTL = 2 * 60 * 60_000;
const PENDING = "Menyimpan…";

/** Kode error → nama field yang ditandai (urutan = fokus pertama) */
const ERR_FIELDS: Record<string, string[]> = {
  "login-failed": ["password"],
  "email-taken": ["email"],
  "user-incomplete": ["name", "email", "password"],
  "user-name-required": ["name"],
  "user-email-invalid": ["email"],
  "user-password-short": ["password"],
  "webhook-invalid": ["webhookUrl"],
  "webhook-missing": ["webhookUrl"],
  "discord-test-failed": ["webhookUrl"],
  "discord-id-invalid": ["discordId"],
  "password-wrong": ["current"],
  "password-short": ["next", "password"],
  "task-title-required": ["title"],
  "task-edit-title-required": ["title"],
  "task-too-many": ["title"],
  "task-date-invalid": ["dueDate"],
  "project-required": ["name", "client"],
  "project-name-required": ["name"],
  "project-client-required": ["client"],
  "project-dates": ["dueDate"],
  "date-invalid": ["startDate", "dueDate"],
  "budget-invalid": ["budget"],
  "pf-title-required": ["title"],
  "pf-slug-taken": ["slug"],
  "pf-slug-invalid": ["slug"],
  "pf-year-invalid": ["year"],
  "pf-sort-invalid": ["sortOrder"],
  "pf-image-invalid": ["imageUrl"],
  "pf-live-invalid": ["liveUrl"],
};
/** "belum / tidak lagi login" (sama dengan AUTH_INFO_ERRS di shared/messages.ts) */
const AUTH_ERRS = ["login-required", "session-expired", "session-expired-draft"];

type Value = string | boolean;
/** [nama, nilai, diubah pengguna?] */
type Snapshot = { path: string; key: string; at?: number; values: [string, Value, boolean?][] };
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const $$ = <T extends Element>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));
/** id dari location.hash ("" bila kosong; escape % rusak tidak membuat seluruh skrip berhenti) */
function hashId() {
  const raw = location.hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
const fields = (form: HTMLFormElement) =>
  Array.from(form.elements).filter(
    (el): el is Control =>
      (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) &&
      !!el.name,
  );
const isCheck = (el: Element): el is HTMLInputElement =>
  el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");

function readStore(key = KEEP_KEY): Snapshot | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") as Snapshot | null;
  } catch {
    return null;
  }
}
function writeStore(v: Snapshot | null, key = KEEP_KEY) {
  try {
    if (v) sessionStorage.setItem(key, JSON.stringify(v));
    else sessionStorage.removeItem(key);
  } catch {}
}

/** Fokus setelah browser selesai menggulir ke #anchor (fokus di awal skrip bisa hilang oleh gulir fragmen) */
function focusLater(el: HTMLElement | null | undefined, center = true) {
  if (!el) return;
  const go = () =>
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      if (center) el.scrollIntoView({ block: "center" });
    });
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}

/* ---------------- status select ---------------- */
const autoSel = (t: EventTarget | null) =>
  t instanceof HTMLSelectElement && t.form && t.hasAttribute("data-autosubmit") ? t : null;
/** Nilai sebelum diubah pengguna: dicatat saat pertama disentuh / difokus, selain itu opsi bawaan dari server */
function initialOf(sel: HTMLSelectElement) {
  return sel.dataset.initial ?? (Array.from(sel.options).find((o) => o.defaultSelected) ?? sel.options[0])?.value ?? "";
}
function statusSelects() {
  let pointer: HTMLSelectElement | null = null;
  const remember = (sel: HTMLSelectElement | null) => sel && (sel.dataset.initial ??= sel.value);
  document.addEventListener(
    "pointerdown",
    (e) => {
      pointer = autoSel(e.target);
      remember(pointer);
    },
    true,
  );
  document.addEventListener("focusin", (e) => remember(autoSel(e.target)), true);
  document.addEventListener(
    "keydown",
    (e) => {
      const sel = autoSel(e.target);
      if (!sel) return;
      pointer = null;
      if (e.key === "Enter" && sel.value !== initialOf(sel)) {
        e.preventDefault();
        sel.form!.requestSubmit();
      }
    },
    true,
  );
  document.addEventListener(
    "change",
    (e) => {
      const sel = autoSel(e.target);
      if (!sel) return;
      const dirty = sel.value !== initialOf(sel);
      sel.form!.querySelector<HTMLElement>(".status-save")?.classList.toggle("is-dirty", dirty);
      if (pointer === sel && dirty) sel.form!.requestSubmit();
      pointer = null;
    },
    true,
  );
}

/* ---------------- pending state ---------------- */
function pending() {
  document.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    if (!(form instanceof HTMLFormElement) || (form.method || "get").toLowerCase() !== "post") return;
    if (form.dataset.pending != null) {
      e.preventDefault();
      return;
    }
    if (e.defaultPrevented) return;
    form.dataset.pending = "";
    form.setAttribute("aria-busy", "true");
    const btn =
      (e.submitter as HTMLButtonElement | null) ?? form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (btn) {
      btn.dataset.html = btn.innerHTML;
      btn.setAttribute("aria-disabled", "true");
      btn.dataset.pending = "";
      btn.textContent = btn.dataset.pendingLabel ?? PENDING;
    }
  });
  // kembali lewat tombol Back (bfcache): pulihkan tombol
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    for (const f of $$<HTMLFormElement>("form[data-pending]")) {
      delete f.dataset.pending;
      f.removeAttribute("aria-busy");
    }
    for (const b of $$<HTMLButtonElement>("button[data-pending]")) {
      if (b.dataset.html != null) b.innerHTML = b.dataset.html;
      b.removeAttribute("aria-disabled");
      delete b.dataset.pending;
    }
  });
}

/* ---------------- simpan & pulihkan isian ---------------- */
function keepKey(form: HTMLFormElement) {
  return form.dataset.keep || form.id || form.getAttribute("action") || "";
}

/** Nilai awal (dari server) sebuah kontrol, untuk tahu apakah pengguna mengubahnya */
function changed(el: Control) {
  if (isCheck(el)) return el.checked !== el.defaultChecked;
  if (el instanceof HTMLSelectElement) {
    const def = Array.from(el.options).find((o) => o.defaultSelected) ?? el.options[0];
    return el.value !== (def?.value ?? "");
  }
  return el.value !== el.defaultValue;
}

function snapshot() {
  document.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    if (!(form instanceof HTMLFormElement) || form.dataset.keep == null || e.defaultPrevented) return;
    const values: Snapshot["values"] = [];
    for (const el of fields(form)) {
      if (el instanceof HTMLInputElement && (el.type === "password" || el.type === "hidden" || el.type === "file"))
        continue;
      values.push([el.name, isCheck(el) ? el.checked : el.value, changed(el)]);
    }
    writeStore({ path: location.pathname, key: keepKey(form), at: Date.now(), values });
  });
}

/** Isi form dari snapshot. Hanya field yang diubah pengguna (bila diketahui), supaya data terbaru dari
 * server (mis. setelah err=stale) tidak tertimpa nilai lama yang tidak disentuh. `only` = batasi ke nama ini. */
function apply(form: HTMLFormElement, snap: Snapshot, only?: string[]) {
  let first: Control | null = null;
  for (const [name, v, wasChanged] of snap.values) {
    if (only ? !only.includes(name) : wasChanged === false) continue;
    const el = form.elements.namedItem(name);
    if (isCheck(el as Element)) (el as HTMLInputElement).checked = v === true;
    else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)
      el.value = String(v);
    else continue;
    first ??= el as Control;
  }
  if (!only && form.dataset.guard != null) form.dataset.dirty = "";
  form.dispatchEvent(new Event("restored"));
  return first;
}

function flashText(kind: "err" | "info") {
  return (
    document.querySelector(`[data-flash="${kind}"] > span, [data-flash-inline="${kind}"]`)?.textContent?.trim() || ""
  );
}

/** Tandai field yang error + pesan di bawahnya (kecuali server sudah merendernya), lalu fokus */
function markErrors(form: HTMLFormElement, err: string) {
  const names = ERR_FIELDS[err] ?? [];
  const els = names
    .map((n) => form.elements.namedItem(n))
    .filter(
      (el): el is Control =>
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement,
    );
  const rendered =
    form.querySelector<HTMLElement>('[aria-invalid="true"]') ??
    document.querySelector<HTMLElement>(`[aria-invalid="true"][form="${CSS.escape(form.id || "-")}"]`);
  if (rendered) {
    focusLater(rendered);
    return;
  }
  const first = els[0];
  const msg = flashText("err");
  if (first && msg) {
    const id = `${first.id || first.name}-err`;
    if (!document.getElementById(id)) {
      const p = document.createElement("p");
      p.className = "err";
      p.id = id;
      p.textContent = msg;
      (first.closest(".field") ?? first).insertAdjacentElement(first.closest(".field") ? "beforeend" : "afterend", p);
    }
    for (const el of els) {
      el.setAttribute("aria-invalid", "true");
      el.setAttribute("aria-describedby", [el.getAttribute("aria-describedby"), id].filter(Boolean).join(" "));
      el.addEventListener("input", () => el.removeAttribute("aria-invalid"), { once: true });
    }
  }
  focusLater(first ?? form.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea"));
}

/** Buka semua <details> yang membungkus el (Disclosure, popover) */
function reveal(el: Element) {
  for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
}

const formByKey = (key: string) => document.querySelector<HTMLFormElement>(`form[data-keep="${CSS.escape(key)}"]`);

/** Isian yang tertunda karena sesi berakhir: dipulihkan di halaman asal setelah login */
function restoreDraft() {
  const draft = readStore(DRAFT_KEY);
  if (!draft) return null;
  if (!draft.at || Date.now() - draft.at > DRAFT_TTL) {
    writeStore(null, DRAFT_KEY);
    return null;
  }
  if (draft.path !== location.pathname) return null;
  writeStore(null, DRAFT_KEY);
  const form = formByKey(draft.key);
  if (!form) return null;
  const first = apply(form, draft);
  reveal(form);
  const note = document.createElement("p");
  note.className = "notice tone-info draft-note";
  note.setAttribute("role", "status");
  note.dataset.draftNotice = "";
  const span = document.createElement("span");
  span.textContent = "Isian Anda sebelum sesi berakhir dipulihkan. Periksa lalu simpan lagi.";
  note.append(span);
  form.prepend(note);
  focusLater(first ?? form.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea"));
  return form;
}

function restore(err: string | null, ok: string | null) {
  const snap = readStore();
  writeStore(null);
  // halaman login karena sesi berakhir: simpan isian form dashboard untuk dipulihkan setelah masuk lagi
  if (location.pathname === "/login") {
    if (snap && snap.path !== "/login" && err && AUTH_ERRS.includes(err))
      writeStore({ ...snap, at: Date.now() }, DRAFT_KEY);
    else if (snap?.path === "/login" && err) {
      const form = formByKey(snap.key);
      if (form) apply(form, snap);
    }
    return null;
  }
  const fromDraft = restoreDraft();
  if (fromDraft) return fromDraft;
  // berhasil: isi lagi field yang diminta form (data-keep-ok / data-keep-fields), tanpa menandai "belum disimpan"
  if (ok && snap && snap.path === location.pathname) {
    const form = formByKey(snap.key);
    if (form && (form.dataset.keepOk ?? "").split(" ").includes(ok))
      apply(form, snap, (form.dataset.keepFields ?? "").split(" "));
  }
  if (!err) return null;
  const hashEl = location.hash ? document.getElementById(hashId()) : null;
  let form: HTMLFormElement | null = null;
  if (snap && snap.path === location.pathname) form = formByKey(snap.key);
  if (!form && hashEl) form = hashEl instanceof HTMLFormElement ? hashEl : hashEl.querySelector("form[data-keep]");
  if (!form) return null;
  if (snap && snap.key === keepKey(form)) apply(form, snap);
  reveal(form);
  markErrors(form, err);
  return form;
}

/* ---------------- perubahan belum disimpan ---------------- */
function guard() {
  const formOf = (t: EventTarget | null) => {
    const f = t instanceof Element ? t.closest("form") : null;
    return f?.matches("form[data-guard], form.status-form") ? f : null;
  };
  const mark = (e: Event) => {
    const form = formOf(e.target);
    if (!form) return;
    // form status: kembali ke nilai awal = tidak ada perubahan
    const sel = form.classList.contains("status-form")
      ? form.querySelector<HTMLSelectElement>("select[data-autosubmit]")
      : null;
    if (sel && sel.value === initialOf(sel)) delete form.dataset.dirty;
    else form.dataset.dirty = "";
  };
  document.addEventListener("input", mark, true);
  document.addEventListener("change", mark, true);
  document.addEventListener(
    "submit",
    (e) => {
      const form = formOf(e.target);
      if (form && !e.defaultPrevented) delete form.dataset.dirty;
    },
    true,
  );
  document.addEventListener(
    "reset",
    (e) => {
      const form = formOf(e.target);
      if (!form) return;
      delete form.dataset.dirty;
      const pop = form.closest<HTMLDetailsElement>("details.pop");
      if (pop) setUnsaved(pop, false);
      // setelah reset, beri tahu pratinjau dsb. (nilai sudah kembali ke awal)
      setTimeout(() => form.dispatchEvent(new Event("restored")), 0);
    },
    true,
  );
  window.addEventListener("beforeunload", (e) => {
    if (!document.querySelector("form[data-guard][data-dirty], form.status-form[data-dirty]")) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

/* ---------------- popover ---------------- */
/** Tanda "ada perubahan belum disimpan" pada popover yang ditutup tanpa Simpan/Batal */
function setUnsaved(d: HTMLDetailsElement, on: boolean) {
  const summary = d.querySelector<HTMLElement>(":scope > summary");
  let sr = summary?.querySelector<HTMLElement>(":scope > .pop-unsaved");
  if (on) {
    d.dataset.unsaved = "";
    if (summary && !sr) {
      sr = document.createElement("span");
      sr.className = "pop-unsaved vh";
      sr.textContent = " (ada perubahan belum disimpan)";
      summary.append(sr);
    }
  } else {
    delete d.dataset.unsaved;
    sr?.remove();
  }
}

/* ---- popover lazy: isi panel dimuat saat dibuka ---- */
const loading = new WeakMap<HTMLDetailsElement, Promise<boolean>>();
/** Tautan cadangan di panel popover lazy (tanpa JS: halaman form penuh) */
const lazyLink = (d: HTMLDetailsElement) => d.querySelector<HTMLAnchorElement>(":scope > .pop-panel a[href]");
/** Ambil isi panel (fragmen HTML di <href tautan>/form) sekali; true = isi sudah ada. Redirect (sesi berakhir →
 * /login), bukan HTML, atau gagal jaringan = false (pemanggil pindah ke halaman form penuh). */
export function loadPop(d: HTMLDetailsElement): Promise<boolean> {
  if (!d.hasAttribute("data-lazy")) return Promise.resolve(true);
  const cached = loading.get(d);
  if (cached) return cached;
  const link = lazyLink(d);
  const panel = link?.parentElement?.closest<HTMLElement>(".pop-panel");
  if (!link || !panel) return Promise.resolve(false);
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return Promise.resolve(false);
  url.pathname += "/form";
  d.setAttribute("aria-busy", "true");
  const p = fetch(url, { headers: { Accept: "text/html" }, credentials: "same-origin" })
    .then(async (res) => {
      if (!res.ok || res.redirected || !(res.headers.get("content-type") ?? "").includes("text/html")) return false;
      panel.innerHTML = await res.text();
      d.removeAttribute("data-lazy");
      return true;
    })
    .catch(() => false)
    .then((ok) => {
      d.removeAttribute("aria-busy");
      if (!ok) loading.delete(d);
      return ok;
    });
  loading.set(d, p);
  return p;
}
/** Buka popover lazy setelah isinya ada; gagal → halaman form penuh (yang juga menangani login ulang) */
function openLazy(d: HTMLDetailsElement) {
  const href = lazyLink(d)?.href;
  void loadPop(d).then((ok) => {
    if (ok) d.open = true;
    else if (href) location.assign(href);
  });
}
const lazyOf = (key: string) =>
  key ? document.querySelector<HTMLDetailsElement>(`details.pop[data-lazy="${CSS.escape(key)}"]`) : null;

function popovers() {
  /** popover yang sedang terbuka (0 atau 1): listener gulir / klik langsung selesai bila kosong */
  const opened = new Set<HTMLDetailsElement>();
  // kunci gulir halaman saat lembar bawah terbuka (dulu :has(.pop[open]) di <html>)
  const sync = () => document.documentElement.classList.toggle("pop-open", opened.size > 0);
  const panelOf = (d: HTMLDetailsElement) => d.querySelector<HTMLElement>(":scope > .pop-panel");
  const reset = (d: HTMLDetailsElement) => {
    d.classList.remove("is-up", "is-left");
    const panel = panelOf(d);
    if (panel)
      for (const k of ["position", "top", "bottom", "left", "right", "max-height"]) panel.style.removeProperty(k);
  };
  const close = (d: HTMLDetailsElement, focus: boolean) => {
    if (!d.open) return;
    d.open = false;
    opened.delete(d);
    sync();
    reset(d);
    // Esc / klik di luar: perubahan tidak dibuang, tapi ditandai (tidak ada status "kotor" yang tak terlihat)
    setUnsaved(d, !!d.querySelector("form[data-dirty]"));
    if (focus) d.querySelector<HTMLElement>(":scope > summary")?.focus();
  };
  const GAP = 4;
  const EDGE = 8;
  const MIN_H = 200;
  const place = (d: HTMLDetailsElement, again = false) => {
    reset(d);
    const panel = panelOf(d);
    // lembar bawah (< 640px) diatur CSS
    if (!panel || getComputedStyle(panel).position === "fixed") return;
    const topH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--top-h")) || 56;
    const s = d.getBoundingClientRect();
    const below = innerHeight - s.bottom - GAP - EDGE;
    const above = s.top - topH - GAP - EDGE;
    // terlalu dekat dengan tepi layar di kedua sisi: geser pemicunya ke tengah dulu
    if (!again && Math.max(below, above) < MIN_H) {
      d.scrollIntoView({ block: "center" });
      return place(d, true);
    }
    const need = panel.getBoundingClientRect().height;
    // buka ke sisi yang muat; bila tidak ada yang muat, ke sisi yang lebih lega
    const up = need > below && above > below;
    const room = Math.max(0, up ? above : below);
    if (need > room) panel.style.maxHeight = `${Math.max(MIN_H, room)}px`;
    if (up) d.classList.add("is-up");
    // di dalam wadah yang menggulir/memotong (papan kanban < 1200px): fixed, dihitung dari pemicunya
    const clip = d.parentElement?.closest<HTMLElement>(".board, .tbl-wrap");
    const clipped = !!clip && getComputedStyle(clip).overflowX !== "visible";
    const w = panel.getBoundingClientRect().width;
    if (clipped) {
      panel.style.position = "fixed";
      panel.style.right = "auto";
      panel.style.left = `${Math.min(Math.max(EDGE, s.right - w), innerWidth - w - EDGE)}px`;
      if (up) {
        panel.style.top = "auto";
        panel.style.bottom = `${innerHeight - s.top + GAP}px`;
      } else {
        panel.style.bottom = "auto";
        panel.style.top = `${s.bottom + GAP}px`;
      }
      return;
    }
    if (panel.getBoundingClientRect().left < EDGE) d.classList.add("is-left");
  };
  const popOf = (t: EventTarget | null) => (t instanceof HTMLDetailsElement && t.matches("details.pop") ? t : null);
  // toggle tidak bubble: ditangkap di fase capture
  document.addEventListener(
    "toggle",
    (e) => {
      const d = popOf(e.target);
      if (!d) return;
      if (!d.open) {
        opened.delete(d);
        sync();
        return reset(d);
      }
      // terbuka sebelum isinya ada (mis. lewat tautan #id): tutup lagi, muat, lalu buka
      if (d.hasAttribute("data-lazy")) {
        d.open = false;
        return openLazy(d);
      }
      for (const o of opened) if (o !== d) close(o, false);
      opened.add(d);
      sync();
      place(d);
      if (matchMedia("(pointer: fine)").matches)
        d.querySelector<HTMLElement>(
          ".pop-panel input:not([type=hidden]), .pop-panel select, .pop-panel textarea",
        )?.focus({ preventScroll: true });
    },
    true,
  );
  const lazySummary = (t: EventTarget | null) => {
    const d = (t instanceof Element ? t.closest("summary") : null)?.parentElement;
    return d instanceof HTMLDetailsElement && d.hasAttribute("data-lazy") && d.matches("details.pop") ? d : null;
  };
  // niat membuka (kursor di atas tombol Ubah): isinya diambil lebih awal
  document.addEventListener(
    "pointerover",
    (e) => {
      const d = lazySummary(e.target);
      if (d) void loadPop(d);
    },
    { passive: true },
  );
  document.addEventListener("click", (e) => {
    const t = e.target as Element | null;
    // summary popover lazy: jangan buka panel cadangan; buka setelah isinya dimuat
    const lazy = lazySummary(t);
    if (lazy && !lazy.open) {
      e.preventDefault();
      return openLazy(lazy);
    }
    const b = t?.closest?.<HTMLButtonElement>("[data-pop-dismiss], [data-pop-close]");
    const d = b?.closest<HTMLDetailsElement>("details.pop");
    if (!b || !d) return;
    // tutup (x) di kepala lembar bawah: seperti Esc (isian tetap, ditandai bila berubah)
    if (b.hasAttribute("data-pop-dismiss")) return close(d, true);
    // Batal: buang perubahan (form.reset() → nilai awal, data-dirty hilang) lalu tutup
    const form = b.closest("form");
    if (form && b.type !== "reset") form.reset();
    setTimeout(() => {
      setUnsaved(d, false);
      close(d, true);
      setUnsaved(d, false);
    }, 0);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !opened.size) return;
    const open = [...opened].find((d) => d.open);
    if (open) {
      e.preventDefault();
      close(open, true);
    }
  });
  // klik di luar; klik pada latar redup lembar bawah (::before milik <details>) mengenai <details> itu sendiri
  document.addEventListener("pointerdown", (e) => {
    if (!opened.size) return;
    for (const d of opened) if (d.open && (!d.contains(e.target as Node) || e.target === d)) close(d, false);
  });
  // popover fixed (di dalam papan yang digulir) mengikuti pemicunya
  const follow = (e?: Event) => {
    if (!opened.size) return;
    // gulir di dalam panel sendiri tidak memindahkan panel
    if (e?.target instanceof Element && e.target.closest(".pop-panel")) return;
    for (const d of opened) if (d.open && panelOf(d)?.style.position === "fixed") place(d, true);
  };
  addEventListener("resize", () => follow(), { passive: true });
  addEventListener("scroll", follow, { passive: true, capture: true });
}

/* ---------------- filter bersegmen yang digulir ---------------- */
function segScroll() {
  for (const seg of $$<HTMLElement>(".seg")) {
    const sync = () => {
      const over = seg.scrollWidth > seg.clientWidth + 1;
      seg.classList.toggle("is-scroll", over);
      seg.classList.toggle("at-end", !over || seg.scrollLeft + seg.clientWidth >= seg.scrollWidth - 2);
    };
    seg.addEventListener("scroll", sync, { passive: true });
    new ResizeObserver(sync).observe(seg);
    // segmen aktif terlihat (mis. "Ditunda" di ujung kanan)
    const cur = seg.querySelector<HTMLElement>("[aria-current], [aria-pressed='true']");
    if (cur && seg.scrollWidth > seg.clientWidth + 1)
      seg.scrollLeft = cur.offsetLeft - (seg.clientWidth - cur.offsetWidth) / 2;
    sync();
  }
}

/* ---------------- flash ---------------- */
function flash() {
  const url = new URL(location.href);
  if (url.searchParams.has("ok") || url.searchParams.has("err")) {
    url.searchParams.delete("ok");
    url.searchParams.delete("err");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  }
  const wrap = document.querySelector<HTMLElement>(".flash-wrap");
  if (!wrap) return;
  const drop = (el: Element | null) => {
    el?.remove();
    if (wrap.querySelector(".flash")) return;
    wrap.remove();
    // ruang gulir #anchor untuk pesan (html.has-flash dari Dash.astro) tidak diperlukan lagi
    document.documentElement.classList.remove("has-flash");
  };
  // tutup: tanpa JS kotak centang + CSS :has() menyembunyikannya (halaman tidak dimuat ulang, #anchor tetap)
  for (const c of $$<HTMLElement>("[data-flash-close]", wrap)) {
    const input = c.querySelector("input");
    (input ?? c).addEventListener(input ? "change" : "click", (e) => {
      e.preventDefault();
      drop(c.closest(".flash"));
    });
  }
  // pesan berhasil hilang sendiri setelah 10 detik (kecuali sedang ditunjuk / difokus); error tetap
  const ok = wrap.querySelector<HTMLElement>('[data-flash="ok"]');
  if (ok && !ok.querySelector("a, button:not([data-flash-close])")) {
    const t = setTimeout(() => {
      if (ok.matches(":hover, :focus-within")) return;
      drop(ok);
    }, 10_000);
    ok.addEventListener("pointerenter", () => clearTimeout(t), { once: true });
  }
}

/* ---------------- baris tujuan & tautan ke <details> ---------------- */
function anchors(restored: HTMLFormElement | null, ok: string | null, err: string | null) {
  const hash = hashId();
  const target = hash ? document.getElementById(hash) : null;
  if (target) {
    reveal(target);
    if (!restored && target.hasAttribute("data-row")) target.focus({ preventScroll: true });
  } else if (hash && (ok || err) && !restored) {
    // baris tujuan sudah tidak tampil (mis. status diganti di daftar yang difilter): fokus ke judul bagian
    focusLater(document.querySelector<HTMLElement>("[data-anchor-fallback]") ?? document.getElementById("main"), false);
  }
  if (!restored) {
    const want = ok ? document.querySelector<HTMLElement>(`[data-focus-ok~="${CSS.escape(ok)}"]`) : null;
    if (want) {
      reveal(want);
      focusLater(want);
    } else if (!(target && target.hasAttribute("data-row"))) {
      const auto = document.querySelector<HTMLElement>("[autofocus]");
      if (auto && document.activeElement !== auto) focusLater(auto, false);
    }
  }
}
function hashLinks() {
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const el = document.getElementById(a.hash.slice(1));
    if (el) reveal(el);
    const focusSel = a.dataset.focus;
    if (focusSel) setTimeout(() => document.querySelector<HTMLElement>(focusSel)?.focus(), 0);
  });
}

/* ---------------- rupiah ---------------- */
/** Sama dengan parseRupiah di shared/format.ts */
function parseRupiah(v: string): number | null | "invalid" {
  const s = v
    .trim()
    .replace(/^rp\.?/i, "")
    .replace(/\s+/g, "");
  if (!s) return null;
  if (!/^\d+$/.test(s) && !/^\d{1,3}(\.\d{3})+$/.test(s)) return "invalid";
  const digits = s.replace(/\./g, "");
  return digits.length > 15 ? "invalid" : Number(digits);
}
function rupiah() {
  const fmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
  for (const input of $$<HTMLInputElement>("input[data-rupiah]")) {
    const out = input.closest(".field")?.querySelector<HTMLOutputElement>("[data-rupiah-out]");
    if (!out) continue;
    const sync = () => {
      const n = parseRupiah(input.value);
      out.textContent =
        n === "invalid" ? "Format tidak dikenali: tulis angka bulat, mis. 15.000.000" : n == null ? "" : fmt.format(n);
      out.classList.toggle("v-warn", n === "invalid");
    };
    input.addEventListener("input", sync);
    input.form?.addEventListener("restored", sync);
    sync();
  }
}

/* ---------------- tanggal: deadline ≥ mulai ---------------- */
function dateMins() {
  for (const input of $$<HTMLInputElement>("input[data-min-from]")) {
    const from = document.querySelector<HTMLInputElement>(input.dataset.minFrom!);
    if (!from) continue;
    const sync = () => (from.value ? (input.min = from.value) : input.removeAttribute("min"));
    from.addEventListener("input", sync);
    from.form?.addEventListener("restored", sync);
    sync();
  }
}

/* ---------------- textarea satu baris: Enter = kirim ---------------- */
function enterSubmit() {
  document.addEventListener(
    "keydown",
    (e) => {
      const ta = e.target;
      if (!(ta instanceof HTMLTextAreaElement) || !ta.hasAttribute("data-enter-submit")) return;
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      ta.form?.requestSubmit();
    },
    true,
  );
}

/** Popover lazy berisi form yang akan dipulihkan restore() (draf sesi berakhir / ?err=): dimuat dulu */
function lazyForRestore(err: string | null) {
  if (location.pathname === "/login") return null;
  const draft = readStore(DRAFT_KEY);
  if (draft?.at && Date.now() - draft.at <= DRAFT_TTL && draft.path === location.pathname && !formByKey(draft.key))
    return lazyOf(draft.key);
  if (!err) return null;
  const snap = readStore();
  const fromSnap = snap && snap.path === location.pathname && !formByKey(snap.key) ? lazyOf(snap.key) : null;
  if (fromSnap) return fromSnap;
  const hashEl = location.hash ? document.getElementById(hashId()) : null;
  if (!hashEl || hashEl instanceof HTMLFormElement || hashEl.querySelector("form[data-keep]")) return null;
  return hashEl.querySelector<HTMLDetailsElement>("details.pop[data-lazy]");
}

let done = false;
export function enhance() {
  if (done) return;
  done = true;
  const sp = new URL(location.href).searchParams;
  const err = sp.get("err");
  const ok = sp.get("ok");
  statusSelects();
  guard();
  snapshot();
  pending();
  popovers();
  segScroll();
  rupiah();
  dateMins();
  enterSubmit();
  hashLinks();
  const lazy = lazyForRestore(err);
  if (lazy) {
    flash();
    void loadPop(lazy).then(() => anchors(restore(err, ok), ok, err));
    return;
  }
  const restored = restore(err, ok);
  flash();
  anchors(restored, ok, err);
}
