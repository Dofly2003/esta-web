// Semua animasi website publik (GSAP + ScrollTrigger + SplitText).
// Pola mengikuti skill resmi GSAP: matchMedia untuk prefers-reduced-motion,
// ScrollTrigger dibuat urut atas → bawah, animasi hanya transform/opacity/clip-path.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);
(window as unknown as { __estaMotion: boolean }).__estaMotion = true;

const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  gsap.utils.toArray<T>(root.querySelectorAll(sel));
const EASE = "power3.out";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const PIXEL = "steps(6)"; // gerak "patah-patah" untuk elemen pixel

/* ------------------------------------------------------------------ */
/* Menu overlay (jalan juga saat reduced motion, hanya tanpa durasi)   */
/* ------------------------------------------------------------------ */
function setupMenu() {
  const menu = document.querySelector<HTMLElement>("[data-menu]");
  const openBtn = document.querySelector<HTMLButtonElement>("[data-menu-open]");
  const closeBtn = document.querySelector<HTMLButtonElement>("[data-menu-close]");
  if (!menu || !openBtn || !closeBtn) return;

  const items = $$("[data-menu-item]", menu);
  // konten di belakang overlay dibuat inert selama menu terbuka
  const behind = [document.querySelector("main"), document.querySelector("footer"), openBtn.closest("header")].filter(
    Boolean,
  ) as HTMLElement[];
  const tl = gsap
    .timeline({ paused: true, defaults: { duration: 0.6, ease: EASE } })
    .set(menu, { display: "block" })
    .fromTo(
      menu,
      { clipPath: "inset(0 0 100% 0)" },
      { clipPath: "inset(0 0 0% 0)", ease: "power4.inOut", duration: 0.7 },
    )
    .from(items, { yPercent: 60, autoAlpha: 0, stagger: 0.06 }, "-=0.25");
  tl.eventCallback("onReverseComplete", () => gsap.set(menu, { display: "none" }));

  const open = () => {
    gsap.set(menu, { display: "block" }); // sinkron, supaya focus() di bawah berhasil
    if (reducedMotion()) tl.progress(1);
    else tl.timeScale(1).play();
    behind.forEach((el) => (el.inert = true));
    openBtn.setAttribute("aria-expanded", "true");
    document.documentElement.style.overflow = "hidden";
    closeBtn.focus();
  };
  const close = () => {
    if (openBtn.getAttribute("aria-expanded") !== "true") return;
    if (reducedMotion()) {
      tl.progress(0);
      gsap.set(menu, { display: "none" });
    } else tl.timeScale(1.6).reverse();
    behind.forEach((el) => (el.inert = false));
    openBtn.setAttribute("aria-expanded", "false");
    document.documentElement.style.overflow = "";
    openBtn.focus();
  };
  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  menu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return close();
    if (e.key !== "Tab") return;
    // focus trap: Tab berputar di dalam menu
    const focusables = $$("a[href], button", menu);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  // satu listener per link di dalam menu (bukan per item, supaya tidak dobel)
  menu.querySelectorAll("a[href]").forEach((a) => a.addEventListener("click", close));
}

/* ------------------------------------------------------------------ */
/* Tombol roll: panah tukar posisi + huruf naik bergantian              */
/* ------------------------------------------------------------------ */
function setupRollButtons() {
  $$("[data-roll-btn]").forEach((btn) => {
    const chars = $$(".roll-c > span", btn);
    const [a1, a2] = $$("[data-arrow]", btn);
    // geser sejauh lebar kotak ikon (44px) agar panah keluar/masuk penuh
    const box = btn.querySelector<HTMLElement>(".rbtn-icon")?.offsetWidth ?? 44;
    gsap.set(a2, { x: -box });
    const tl = gsap
      .timeline({ paused: true, defaults: { duration: 0.45, ease: "power3.inOut" } })
      .to(chars, { yPercent: -100, stagger: 0.025 }, 0)
      .to(a1, { x: box }, 0)
      .to(a2, { x: 0 }, 0);
    btn.addEventListener("mouseenter", () => tl.play());
    btn.addEventListener("mouseleave", () => tl.reverse());
    btn.addEventListener("focus", () => tl.play());
    btn.addEventListener("blur", () => tl.reverse());
  });
}

/* ------------------------------------------------------------------ */
/* Blok-blok yang dipakai di banyak section                            */
/* ------------------------------------------------------------------ */
function headingTimeline(heading: Element) {
  const lines = $$("[data-hl-line]", heading);
  return gsap
    .timeline()
    .fromTo(
      lines,
      { clipPath: "inset(0 100% 0 0)" },
      { clipPath: "inset(0 0% 0 0)", duration: 0.9, ease: "power4.inOut", stagger: 0.12 },
    );
}

function cornerTimeline(svg: Element) {
  const step = svg.querySelector("[data-step]");
  const dots = $$("[data-dot]", svg);
  return gsap
    .timeline()
    .from(svg, { scale: 0, duration: 0.9, ease: PIXEL })
    .from(step, { opacity: 0.4, duration: 0.6, ease: PIXEL }, 0)
    .from(dots, { scale: 0, transformOrigin: "50% 50%", stagger: 0.06, duration: 0.35, ease: "back.out(3)" }, "-=0.35");
}

function orbFloat(orb: Element, i: number) {
  gsap.to(orb, {
    y: i % 2 ? 14 : -14,
    rotation: i % 2 ? -6 : 6,
    duration: 3.2 + i * 0.4,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
  });
}

/* ------------------------------------------------------------------ */
/* Animasi penuh (pengguna tanpa preferensi reduced motion)            */
/* ------------------------------------------------------------------ */
function setupMotion() {
  setupRollButtons();

  // --- HERO intro (tanpa scroll) ---
  const hero = document.querySelector("[data-hero]");
  const heroHeadings = hero ? $$("[data-heading]", hero) : [];
  if (hero) {
    const tl = gsap.timeline({ defaults: { ease: EASE } });
    $$("svg[data-corner]", hero).forEach((c, i) => tl.add(cornerTimeline(c), i * 0.15));
    heroHeadings.forEach((h) => tl.add(headingTimeline(h), 0.25));
    tl.from(
      $$("[data-orb]", hero),
      { scale: 0, rotation: -90, duration: 1, ease: "back.out(1.6)", stagger: 0.15 },
      0.5,
    );
    tl.fromTo(
      $$("[data-fade]", hero),
      { autoAlpha: 0, y: 24 },
      { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.1 },
      0.8,
    );
    // grup bertahap di hero (mis. info kontak) — sebelumnya tidak pernah dianimasikan → tak terlihat
    $$("[data-stagger]", hero).forEach((g) =>
      tl.fromTo(g.children, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08 }, 1),
    );
    // parallax lembut saat hero di-scroll keluar
    gsap.to($$("svg[data-corner]", hero), {
      yPercent: -18,
      ease: "none",
      scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
    });
  }

  // --- urut dari atas ke bawah per section ---
  $$("[data-section]").forEach((section) => {
    if (section === hero) return;

    // sudut pixel
    $$("svg[data-corner]", section).forEach((c) => {
      const tl = cornerTimeline(c);
      ScrollTrigger.create({
        trigger: section,
        start: "top 75%",
        animation: tl,
        toggleActions: "play none none reverse",
      });
    });

    // judul highlight
    $$("[data-heading]", section).forEach((h) => {
      if (heroHeadings.includes(h)) return;
      ScrollTrigger.create({
        trigger: h,
        start: "top 85%",
        animation: headingTimeline(h),
        toggleActions: "play none none reverse",
      });
    });

    // orb
    $$("[data-orb]", section).forEach((o) => {
      gsap.from(o, {
        scale: 0,
        rotation: -90,
        duration: 1,
        ease: "back.out(1.6)",
        scrollTrigger: { trigger: section, start: "top 70%", toggleActions: "play none none reverse" },
      });
    });

    // fade satuan
    $$("[data-fade]", section).forEach((el) => {
      gsap.fromTo(
        el,
        { autoAlpha: 0, y: 32 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.9,
          ease: EASE,
          scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none reverse" },
        },
      );
    });

    // grup bertahap
    $$("[data-stagger]", section).forEach((group) => {
      gsap.fromTo(
        group.children,
        { autoAlpha: 0, y: 40 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.8,
          ease: EASE,
          stagger: 0.1,
          scrollTrigger: { trigger: group, start: "top 85%", toggleActions: "play none none reverse" },
        },
      );
    });
  });

  // --- counter angka ---
  $$("[data-count]").forEach((el) => {
    const end = Number(el.dataset.count) || 0;
    const obj = { v: 0 };
    gsap.to(obj, {
      v: end,
      duration: 1.6,
      ease: "power2.out",
      onUpdate: () => (el.textContent = String(Math.round(obj.v))),
      scrollTrigger: { trigger: el, start: "top 90%", once: true },
    });
  });

  // --- kalimat besar: baris terbuka dari bawah, lalu "menyala" mengikuti scroll ---
  $$("[data-lines]").forEach((el) => {
    SplitText.create(el, {
      type: "lines",
      mask: "lines",
      linesClass: "split-line",
      autoSplit: true,
      onSplit(self) {
        const tl = gsap.timeline({
          scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 45%", scrub: 0.6 },
        });
        tl.from(self.lines, { yPercent: 100, opacity: 0.15, stagger: 0.12, ease: "power2.out" });
        return tl;
      },
    });
  });

  // --- marquee tanpa henti (pita layanan, pita proses) ---
  $$("[data-marquee]").forEach((track) => {
    const dir = track.dataset.marquee === "right" ? 1 : -1;
    const loop = gsap.fromTo(
      track,
      { xPercent: dir < 0 ? 0 : -50 },
      { xPercent: dir < 0 ? -50 : 0, duration: Number(track.dataset.speed) || 30, ease: "none", repeat: -1 },
    );
    // berhenti saat di luar layar atau saat disorot pointer (kontrol jeda untuk loop panjang)
    let hovered = false;
    const strip = track.parentElement ?? track;
    strip.addEventListener("pointerenter", () => {
      hovered = true;
      loop.pause();
    });
    strip.addEventListener("pointerleave", () => {
      hovered = false;
      loop.play();
    });
    // scroll mempercepat sesaat
    ScrollTrigger.create({
      trigger: track,
      start: "top bottom",
      end: "bottom top",
      onToggle: (self) => (self.isActive && !hovered ? loop.play() : loop.pause()),
      onUpdate: (self) => {
        if (hovered) return;
        const v = Math.min(Math.abs(self.getVelocity()) / 300, 4);
        gsap.to(loop, { timeScale: 1 + v, duration: 0.2, overwrite: true });
        gsap.to(loop, { timeScale: 1, duration: 0.8, delay: 0.2 });
      },
    });
  });

  // --- kartu "Kenapa ESTA" bertangga ---
  $$("[data-steps]").forEach((wrap) => {
    gsap.from(wrap.children, {
      y: (i) => 120 + i * 40,
      autoAlpha: 0,
      rotation: (i) => (i % 2 ? 2 : -2),
      duration: 1,
      ease: EASE,
      stagger: 0.12,
      scrollTrigger: { trigger: wrap, start: "top 80%", toggleActions: "play none none reverse" },
    });
  });

  // --- panel layanan menumpuk (CSS sticky); panel di belakang mengecil & meredup ---
  // panel hanya menumpuk (sticky) mulai md; di ponsel panel mengalir biasa tanpa scale
  const panels = window.matchMedia("(min-width: 768px)").matches ? $$("[data-panel]") : [];
  panels.forEach((panel, i) => {
    const next = panels[i + 1];
    if (!next) return;
    gsap.to(panel.querySelector("[data-panel-inner]"), {
      scale: 0.9,
      opacity: 0.35,
      ease: "none",
      scrollTrigger: { trigger: next, start: "top bottom", end: "top top", scrub: true },
    });
  });

  // --- matriks titik bergelombang di panel layanan ---
  $$("[data-dotwave]").forEach((grid) => {
    const dots = $$("i", grid);
    gsap.fromTo(
      dots,
      { scale: 0.25, opacity: 0.35 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.9,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: { each: 0.05, grid: "auto", from: grid.dataset.from === "end" ? "end" : "center" },
      },
    );
  });

  // --- orb: mengambang + sedikit berputar mengikuti scroll ---
  $$("[data-orb]").forEach((o, i) => {
    orbFloat(o, i);
    gsap.to(o, {
      rotation: "+=120",
      ease: "none",
      scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 1 },
    });
  });

  // --- kartu portofolio: gambar sedikit membesar saat hover ---
  $$("[data-card]").forEach((card) => {
    const img = card.querySelector("[data-card-media]");
    const tl = gsap.timeline({ paused: true }).to(img, { scale: 1.06, duration: 0.6, ease: EASE });
    card.addEventListener("mouseenter", () => tl.play());
    card.addEventListener("mouseleave", () => tl.reverse());
  });

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

/* ------------------------------------------------------------------ */
/* Akordeon (proses & FAQ)                                             */
/* ------------------------------------------------------------------ */
function setupAccordions() {
  $$("[data-acc]").forEach((acc, a) => {
    const items = $$("[data-acc-item]", acc);
    // hubungkan tombol ↔ panel untuk pembaca layar
    items.forEach((item, i) => {
      const panel = item.querySelector<HTMLElement>("[data-acc-panel]")!;
      const btn = item.querySelector<HTMLButtonElement>("[data-acc-btn]")!;
      panel.id ||= `acc-${a}-${i}`;
      btn.id ||= `${panel.id}-btn`;
      btn.setAttribute("aria-controls", panel.id);
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-labelledby", btn.id);
    });
    const toggle = (item: HTMLElement, open: boolean) => {
      const panel = item.querySelector<HTMLElement>("[data-acc-panel]")!;
      const btn = item.querySelector<HTMLButtonElement>("[data-acc-btn]")!;
      const icon = item.querySelector("[data-acc-icon]");
      btn.setAttribute("aria-expanded", String(open));
      gsap.to(panel, {
        height: open ? "auto" : 0,
        autoAlpha: open ? 1 : 0,
        duration: reducedMotion() ? 0 : 0.5,
        ease: "power3.inOut",
        onComplete: () => ScrollTrigger.refresh(),
      });
      gsap.to(icon, { rotation: open ? 45 : 0, duration: reducedMotion() ? 0 : 0.35, ease: EASE });
      item.dataset.open = String(open);
    };
    items.forEach((item, i) => {
      const panel = item.querySelector<HTMLElement>("[data-acc-panel]")!;
      const open = i === 0 && acc.dataset.acc === "first";
      gsap.set(panel, { height: open ? "auto" : 0, autoAlpha: open ? 1 : 0, overflow: "hidden" });
      item.dataset.open = String(open);
      item.querySelector("[data-acc-btn]")?.setAttribute("aria-expanded", String(open));
      item.querySelector("[data-acc-btn]")?.addEventListener("click", () => {
        const willOpen = item.dataset.open !== "true";
        items.forEach((other) => other !== item && other.dataset.open === "true" && toggle(other, false));
        toggle(item, willOpen);
      });
    });
  });
}

/* ------------------------------------------------------------------ */
// Interaksi (menu, akordeon) dipasang sekali; matchMedia hanya mengatur animasi,
// sehingga listener tidak dobel saat preferensi motion berubah.
setupMenu();
setupAccordions();

const mm = gsap.matchMedia();
mm.add({ motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
  const { reduce } = ctx.conditions as { motion: boolean; reduce: boolean };
  if (reduce) {
    gsap.set("[data-hl-line]", { clipPath: "none" });
    gsap.set("[data-fade], [data-stagger] > *", { autoAlpha: 1 });
    return;
  }
  setupMotion();
});
