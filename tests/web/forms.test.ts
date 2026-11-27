// @vitest-environment happy-dom
// src/components/dash/forms.ts — peningkatan progresif form & popover dashboard, diuji di DOM happy-dom.
// enhance() hanya jalan sekali per modul, jadi setiap tes memuat ulang modulnya; listener yang dipasang di
// document/window oleh tes sebelumnya dilepas di afterEach.
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

type Reg = [EventTarget, string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined];
const registered: Reg[] = [];
for (const target of [document, window] as EventTarget[]) {
  const realAdd = target.addEventListener.bind(target);
  target.addEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (listener) registered.push([target, type, listener, options]);
    realAdd(type, listener, options);
  };
}

async function boot(html: string, url = "/dashboard/x") {
  history.replaceState(null, "", url);
  document.body.innerHTML = html;
  vi.resetModules();
  const { enhance } = await import("../../src/components/dash/forms");
  enhance();
}
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const submit = (form: HTMLFormElement) => {
  const e = new Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(e);
  return e;
};
const typeInto = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const store = (key: string) => JSON.parse(sessionStorage.getItem(key) ?? "null");

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  for (const [t, type, l, o] of registered.splice(0)) t.removeEventListener(type, l, o);
  document.body.innerHTML = "";
});

describe("pending state / double submit", () => {
  const html = `<form method="post" action="/api/tasks"><input name="title" value="a">
    <button type="submit" data-pending-label="Mengirim…"><b>Simpan</b></button></form>`;
  it("marks the form busy, relabels the button and blocks a second submit", async () => {
    await boot(html);
    const form = $<HTMLFormElement>("form");
    const btn = $<HTMLButtonElement>("button");
    expect(submit(form).defaultPrevented).toBe(false);
    expect(form.dataset.pending).toBe("");
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.textContent).toBe("Mengirim…");
    expect(submit(form).defaultPrevented).toBe(true);
  });
  it("back/forward cache restore re-enables the button", async () => {
    await boot(html);
    const form = $<HTMLFormElement>("form");
    expect(submit(form).defaultPrevented).toBe(false);
    const ev = new Event("pageshow");
    Object.defineProperty(ev, "persisted", { value: true });
    window.dispatchEvent(ev);
    expect(form.dataset.pending).toBe(undefined);
    expect(form.hasAttribute("aria-busy")).toBe(false);
    expect($("button").innerHTML).toBe("<b>Simpan</b>");
    expect($("button").hasAttribute("aria-disabled")).toBe(false);
    expect(submit(form).defaultPrevented).toBe(false);
  });
  it("GET forms and already-cancelled submits are left alone", async () => {
    await boot(`<form method="get"><button type="submit">Cari</button></form>`);
    submit($<HTMLFormElement>("form"));
    expect($<HTMLFormElement>("form").dataset.pending).toBe(undefined);
  });
});

describe("draft save / restore", () => {
  const form = (values: { name?: string; client?: string } = {}) => `
    <div class="flash-wrap"><div class="flash" data-flash="err"><span>Nama proyek wajib diisi.</span></div></div>
    <details id="d"><summary>Proyek baru</summary>
      <form method="post" action="/api/projects" data-keep="proyek-baru" data-guard>
        <input type="hidden" name="_back" value="/dashboard/projects">
        <div class="field"><input id="f-name" name="name" value="${values.name ?? ""}"></div>
        <div class="field"><input id="f-client" name="client" value="${values.client ?? ""}"></div>
        <input type="password" name="password" value="">
        <select name="type"><option value="WEBSITE" selected>Website</option><option value="WEB_APP">Web App</option></select>
        <input type="checkbox" name="urgent">
        <button type="submit">Simpan</button>
      </form>
    </details>`;

  it("snapshot on submit: changed flags, never passwords or hidden fields", async () => {
    await boot(form({ client: "Klien lama" }), "/dashboard/projects");
    typeInto($<HTMLInputElement>("#f-name"), "Proyek Baru");
    $<HTMLInputElement>("[name=password]").value = "rahasia-jangan-disimpan";
    $<HTMLSelectElement>("select").value = "WEB_APP";
    submit($<HTMLFormElement>("form"));
    const snap = store("esta-form-last");
    expect(snap.path).toBe("/dashboard/projects");
    expect(snap.key).toBe("proyek-baru");
    expect(snap.values).toEqual([
      ["name", "Proyek Baru", true],
      ["client", "Klien lama", false],
      ["type", "WEB_APP", true],
      ["urgent", false, false],
    ]);
    expect(JSON.stringify(snap)).not.toContain("rahasia");
    expect(JSON.stringify(snap)).not.toContain("_back");
  });
  it("after ?err= the changed fields come back, the error is marked next to the field", async () => {
    sessionStorage.setItem(
      "esta-form-last",
      JSON.stringify({
        path: "/dashboard/projects",
        key: "proyek-baru",
        values: [
          ["name", "Dari isian", true],
          ["client", "Isian lama", false],
          ["type", "WEB_APP", true],
        ],
      }),
    );
    await boot(form({ client: "Data server terbaru" }), "/dashboard/projects?err=project-name-required");
    expect($<HTMLInputElement>("#f-name").value).toBe("Dari isian");
    expect($<HTMLInputElement>("#f-client").value).toBe("Data server terbaru"); // untouched field not overwritten
    expect($<HTMLSelectElement>("select").value).toBe("WEB_APP");
    expect($<HTMLDetailsElement>("#d").open).toBe(true);
    expect($("#f-name").getAttribute("aria-invalid")).toBe("true");
    expect($("#f-name-err").textContent).toBe("Nama proyek wajib diisi.");
    expect($("#f-name").getAttribute("aria-describedby")).toBe("f-name-err");
    expect($<HTMLFormElement>("form").dataset.dirty).toBe("");
    expect(sessionStorage.getItem("esta-form-last")).toBe(null);
    expect(location.search).toBe(""); // ?err= removed from the address bar
  });
  it("snapshot of another page is not applied", async () => {
    sessionStorage.setItem(
      "esta-form-last",
      JSON.stringify({ path: "/dashboard/other", key: "proyek-baru", values: [["name", "X", true]] }),
    );
    await boot(form(), "/dashboard/projects?err=project-name-required");
    expect($<HTMLInputElement>("#f-name").value).toBe("");
  });
  it("session expired while submitting: the draft crosses the login page and is restored after login", async () => {
    const snap = { path: "/dashboard/projects", key: "proyek-baru", values: [["name", "Belum tersimpan", true]] };
    sessionStorage.setItem("esta-form-last", JSON.stringify(snap));
    await boot(
      `<form method="post" data-keep="login"><input name="email"></form>`,
      "/login?next=%2Fdashboard%2Fprojects&err=session-expired-draft",
    );
    const draft = store("esta-form-draft");
    expect(draft).toMatchObject(snap);
    expect(typeof draft.at).toBe("number");
    for (const [t, type, l, o] of registered.splice(0)) t.removeEventListener(type, l, o);

    await boot(form(), "/dashboard/projects");
    expect($<HTMLInputElement>("#f-name").value).toBe("Belum tersimpan");
    expect($("form > .draft-note").textContent).toContain("dipulihkan");
    expect($<HTMLDetailsElement>("#d").open).toBe(true);
    expect(sessionStorage.getItem("esta-form-draft")).toBe(null);
  });
  it("a draft older than 2 hours is dropped", async () => {
    sessionStorage.setItem(
      "esta-form-draft",
      JSON.stringify({
        path: "/dashboard/projects",
        key: "proyek-baru",
        at: Date.now() - 3 * 3600_000,
        values: [["name", "Lama", true]],
      }),
    );
    await boot(form(), "/dashboard/projects");
    expect($<HTMLInputElement>("#f-name").value).toBe("");
    expect(document.querySelector(".draft-note")).toBe(null);
    expect(sessionStorage.getItem("esta-form-draft")).toBe(null);
  });
  it("data-keep-ok refills only the listed fields after success", async () => {
    sessionStorage.setItem(
      "esta-form-last",
      JSON.stringify({
        path: "/dashboard/projects/1",
        key: "tambah",
        values: [
          ["title", "Tugas tadi", true],
          ["priority", "HIGH", true],
        ],
      }),
    );
    await boot(
      `<form method="post" data-keep="tambah" data-keep-ok="task-created" data-keep-fields="priority">
        <textarea name="title"></textarea>
        <select name="priority"><option value="MEDIUM" selected>Sedang</option><option value="HIGH">Tinggi</option></select></form>`,
      "/dashboard/projects/1?ok=task-created",
    );
    expect($<HTMLTextAreaElement>("textarea").value).toBe("");
    expect($<HTMLSelectElement>("select").value).toBe("HIGH");
  });
});

describe("unsaved changes (data-guard)", () => {
  it("input marks dirty, beforeunload warns, reset and submit clear it", async () => {
    await boot(`<form method="post" data-guard><input name="a" value="1"><button type="submit">S</button></form>`);
    const form = $<HTMLFormElement>("form");
    const unload = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(unload()).toBe(false);
    typeInto($<HTMLInputElement>("input"), "2");
    expect(form.dataset.dirty).toBe("");
    expect(unload()).toBe(true);
    form.dispatchEvent(new Event("reset"));
    expect(form.dataset.dirty).toBe(undefined);
    expect(unload()).toBe(false);
    typeInto($<HTMLInputElement>("input"), "3");
    submit(form);
    expect(form.dataset.dirty).toBe(undefined);
  });
  it("status select back to its initial value is not dirty", async () => {
    await boot(`<form method="post" class="status-form"><select name="status" data-autosubmit>
      <option value="TODO" selected>To do</option><option value="DONE">Done</option></select></form>`);
    const form = $<HTMLFormElement>("form");
    const sel = $<HTMLSelectElement>("select");
    form.requestSubmit = vi.fn();
    sel.value = "DONE";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(form.dataset.dirty).toBe("");
    sel.value = "TODO";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(form.dataset.dirty).toBe(undefined);
  });
});

describe("status select (data-autosubmit)", () => {
  const html = `<form method="post"><select name="status" data-autosubmit>
      <option value="TODO" selected>To do</option><option value="DONE">Done</option></select>
      <button type="submit" class="status-save">Simpan</button></form>`;
  it("mouse/touch change submits; keyboard change only reveals Simpan, Enter submits", async () => {
    await boot(html);
    const form = $<HTMLFormElement>("form");
    const sel = $<HTMLSelectElement>("select");
    const spy = vi.fn();
    form.requestSubmit = spy;
    sel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    sel.value = "DONE";
    sel.dispatchEvent(new Event("change"));
    expect(spy).not.toHaveBeenCalled();
    expect($(".status-save").classList.contains("is-dirty")).toBe(true);
    sel.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(spy).toHaveBeenCalledTimes(1);
    sel.value = "TODO";
    sel.dispatchEvent(new Event("pointerdown"));
    sel.value = "DONE";
    sel.dispatchEvent(new Event("change"));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("popovers (details.pop)", () => {
  const html = `
    <details class="pop" id="p1"><summary id="s1">Ubah</summary><div class="pop-panel">
      <form method="post" data-guard><input name="t" value="a"><button type="reset" data-pop-close>Batal</button></form>
    </div></details>
    <details class="pop" id="p2"><summary id="s2">Dua</summary><div class="pop-panel"><button data-pop-dismiss>x</button></div></details>
    <button id="outside">luar</button>`;
  const open = async (d: HTMLDetailsElement) => {
    d.open = true;
    d.dispatchEvent(new Event("toggle"));
    await tick();
  };
  const esc = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));

  it("only one open at a time; Esc closes and returns focus to the summary", async () => {
    await boot(html);
    const p1 = $<HTMLDetailsElement>("#p1");
    const p2 = $<HTMLDetailsElement>("#p2");
    await open(p1);
    await open(p2);
    expect(p1.open).toBe(false);
    expect(p2.open).toBe(true);
    esc();
    expect(p2.open).toBe(false);
    expect(document.activeElement).toBe($("#s2"));
  });
  it("closing with unsaved edits keeps them and marks the popover", async () => {
    await boot(html);
    const p1 = $<HTMLDetailsElement>("#p1");
    await open(p1);
    typeInto($<HTMLInputElement>("[name=t]"), "berubah");
    esc();
    expect(p1.open).toBe(false);
    expect(p1.dataset.unsaved).toBe("");
    expect($("#s1 .pop-unsaved").textContent).toContain("belum disimpan");
    expect($<HTMLInputElement>("[name=t]").value).toBe("berubah");
  });
  it("pointerdown outside closes; the dismiss button closes like Esc", async () => {
    await boot(html);
    const p1 = $<HTMLDetailsElement>("#p1");
    await open(p1);
    $("#outside").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(p1.open).toBe(false);
    const p2 = $<HTMLDetailsElement>("#p2");
    await open(p2);
    $("[data-pop-dismiss]").click();
    expect(p2.open).toBe(false);
  });
  it("Batal discards the edit (reset) and clears the unsaved mark", async () => {
    await boot(html);
    const p1 = $<HTMLDetailsElement>("#p1");
    await open(p1);
    typeInto($<HTMLInputElement>("[name=t]"), "berubah");
    const form = $<HTMLFormElement>("form");
    const batal = $<HTMLButtonElement>("[data-pop-close]");
    batal.click();
    form.reset(); // what the browser does for type="reset"
    await tick(20);
    expect(p1.open).toBe(false);
    expect(p1.dataset.unsaved).toBe(undefined);
    expect(form.dataset.dirty).toBe(undefined);
    expect($<HTMLInputElement>("[name=t]").value).toBe("a");
  });
});

describe("segmented filter scroll (.seg)", () => {
  it("is-scroll when it overflows, at-end once scrolled to the end", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    document.body.innerHTML = `<nav class="seg"><a href="#">A</a><a aria-current="true" href="#">B</a></nav>`;
    const seg = $(".seg");
    let left = 0;
    Object.defineProperty(seg, "scrollWidth", { value: 300, configurable: true });
    Object.defineProperty(seg, "clientWidth", { value: 100, configurable: true });
    Object.defineProperty(seg, "scrollLeft", {
      get: () => left,
      set: (v: number) => {
        left = v;
      },
      configurable: true,
    });
    vi.resetModules();
    const { enhance } = await import("../../src/components/dash/forms");
    enhance();
    expect(seg.classList.contains("is-scroll")).toBe(true);
    left = 200;
    seg.dispatchEvent(new Event("scroll"));
    expect(seg.classList.contains("at-end")).toBe(true);
    left = 0;
    seg.dispatchEvent(new Event("scroll"));
    expect(seg.classList.contains("at-end")).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("flash, anchors and small inputs", () => {
  it("ok/err are removed from the URL (hash kept); the close control removes the message", async () => {
    await boot(
      `<div class="flash-wrap"><div class="flash" data-flash="err"><span>Gagal</span>
        <label data-flash-close><input type="checkbox"></label></div></div><div id="task-1" data-row tabindex="-1"></div>`,
      "/dashboard/tasks?filter=all&err=stale#task-1",
    );
    expect(location.pathname + location.search + location.hash).toBe("/dashboard/tasks?filter=all#task-1");
    $("[data-flash-close] input").dispatchEvent(new Event("change"));
    expect(document.querySelector(".flash-wrap")).toBe(null);
    expect(document.activeElement).toBe($("#task-1"));
  });
  it("a malformed #hash does not stop the script", async () => {
    await boot(`<form method="post"><button type="submit">S</button></form>`, "/dashboard?err=stale#%E0%A4%A");
    submit($<HTMLFormElement>("form"));
    expect($<HTMLFormElement>("form").dataset.pending).toBe("");
  });
  it("rupiah preview and warning", async () => {
    await boot(`<div class="field"><input name="budget" data-rupiah><output data-rupiah-out></output></div>`);
    const input = $<HTMLInputElement>("input");
    typeInto(input, "15.000.000");
    expect($("output").textContent!.replace(/\s/g, " ")).toBe("Rp 15.000.000");
    typeInto(input, "1,5 juta");
    expect($("output").classList.contains("v-warn")).toBe(true);
    typeInto(input, "");
    expect($("output").textContent).toBe("");
  });
  it("deadline min follows the start date; Enter submits a one-line textarea, Shift+Enter does not", async () => {
    await boot(`<form method="post"><input id="start" type="date"><input id="due" type="date" data-min-from="#start">
      <textarea data-enter-submit name="title"></textarea></form>`);
    typeInto($<HTMLInputElement>("#start"), "2026-12-01");
    expect($<HTMLInputElement>("#due").min).toBe("2026-12-01");
    typeInto($<HTMLInputElement>("#start"), "");
    expect($("#due").hasAttribute("min")).toBe(false);
    const form = $<HTMLFormElement>("form");
    const spy = vi.fn();
    form.requestSubmit = spy;
    const ta = $("textarea");
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, cancelable: true }));
    expect(spy).not.toHaveBeenCalled();
    const e = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    ta.dispatchEvent(e);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });
  it("a link to a closed <details> opens it", async () => {
    await boot(`<a id="go" href="#edit">Ubah</a><details id="edit"><summary>Edit</summary></details>`);
    $("#go").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect($<HTMLDetailsElement>("#edit").open).toBe(true);
  });
});
