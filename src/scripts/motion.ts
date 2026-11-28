// Semua animasi website publik (GSAP + ScrollTrigger). Kalimat SplitText beranda: scripts/lines.ts (modul terpisah).
// Pola mengikuti skill resmi GSAP: matchMedia untuk prefers-reduced-motion,
// ScrollTrigger dibuat urut atas → bawah, animasi hanya transform/opacity/clip-path.
// Hemat CPU: hero dibangun dulu (paint pertama tidak menunggu seluruh halaman), section lain setelah satu frame;
// tween yang status awalnya sudah diatur CSS (global .js [data-fade] dst.) tidak dirender saat dibuat
// (immediateRender: false → tanpa getComputedStyle paksa per elemen); loop tanpa henti (marquee, dot-matrix, orb)
// hanya berjalan saat terlihat di layar, dan semua animasi berhenti saat tab disembunyikan.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { pauseWhileHidden, shown, whileVisible } from "./loops";

gsap.registerPlugin(ScrollTrigger);
(window as unknown as { __estaMotion: boolean }).__estaMotion = true;

const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  gsap.utils.toArray<T>(root.querySelectorAll(sel));
const EASE = "power3.out";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const PIXEL = "steps(6)"; // gerak "patah-patah" untuk elemen pixel
/** lebar kotak ikon tombol roll (.rbtn-icon di site.css: width 44px) */
const ROLL_BOX = 44;
/** geser awal [data-fade] (dipakai juga untuk mengoreksi posisi pemicu, lihat setupSections) */
const FADE_Y = 32;

/** Satu frame tergambar dulu, lalu task baru (memberi browser kesempatan paint & input) */
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/* ------------------------------------------------------------------ */
/* Menu overlay (jalan juga saat reduced motion, hanya tanpa durasi)   */
/* ------------------------------------------------------------------ */
function setupMenu() {
  const menu = document.querySelector<HTMLElement>("[data-menu]");
  const openBtn = document.querySelector<HTMLButtonElement>("[data-menu-open]");
  const closeBtn = document.querySelector<HTMLButtonElement>("[data-menu-close]");
  if (!menu || !openBtn || !closeBtn) return;

  // konten di belakang overlay dibuat inert selama menu terbuka
  const behind = [document.querySelector("main"), document.querySelector("footer"), openBtn.closest("header")].filter(
    Boolean,
  ) as HTMLElement[];
  // timeline dibuat saat menu pertama kali dibuka (tidak membebani muat halaman)
  let tl: gsap.core.Timeline | null = null;
  const timeline = () => {
    if (tl) return tl;
    tl = gsap
      .timeline({ paused: true, defaults: { duration: 0.6, ease: EASE } })
      .set(menu, { display: "block" })
      .fromTo(
        menu,
        { clipPath: "inset(0 0 100% 0)" },
        { clipPath: "inset(0 0 0% 0)", ease: "power4.inOut", duration: 0.7 },
      )
      .from($$("[data-menu-item]", menu), { yPercent: 60, autoAlpha: 0, stagger: 0.06 }, "-=0.25");
    tl.eventCallback("onReverseComplete", () => gsap.set(menu, { display: "none" }));
    return tl;
  };

  const open = () => {
    gsap.set(menu, { display: "block" }); // sinkron, supaya focus() di bawah berhasil
    if (reducedMotion()) timeline().progress(1);
    else timeline().timeScale(1).play();
    behind.forEach((el) => (el.inert = true));
    openBtn.setAttribute("aria-expanded", "true");
    document.documentElement.style.overflow = "hidden";
    closeBtn.focus();
  };
  const close = () => {
    if (openBtn.getAttribute("aria-expanded") !== "true") return;
    if (reducedMotion()) {
      timeline().progress(0);
      gsap.set(menu, { display: "none" });
    } else timeline().timeScale(1.6).reverse();
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
  // satu listener untuk semua link di dalam menu
  menu.addEventListener("click", (e) => (e.target as Element).closest("a[href]") && close());
}

/* ------------------------------------------------------------------ */
/* Hover sederhana: timeline dibuat saat pertama kali disentuh          */
/* ------------------------------------------------------------------ */
function hoverTimeline(el: HTMLElement, build: () => gsap.core.Timeline, focus = false) {
  let tl: gsap.core.Timeline | null = null;
  const play = () => (tl ??= build()).play();
  const back = () => tl?.reverse();
  el.addEventListener("mouseenter", play);
  el.addEventListener("mouseleave", back);
  if (focus) {
    el.addEventListener("focus", play);
    el.addEventListener("blur", back);
  }
}

/* Tombol roll: panah tukar posisi + huruf naik bergantian. Posisi awal panah kedua (-44px) sudah dari CSS. */
function setupRollButtons() {
  $$("[data-roll-btn]").forEach((btn) =>
    hoverTimeline(
      btn,
      () => {
        const [a1, a2] = $$("[data-arrow]", btn);
        return gsap
          .timeline({ paused: true, defaults: { duration: 0.45, ease: "power3.inOut" } })
          .to($$(".roll-c > span", btn), { yPercent: -100, stagger: 0.025 }, 0)
          .to(a1, { x: ROLL_BOX }, 0)
          .fromTo(a2, { x: -ROLL_BOX }, { x: 0 }, 0);
      },
      true,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Blok-blok yang dipakai di banyak section                            */
/* ------------------------------------------------------------------ */
/** Baris highlight terbuka dari kiri. Status awal (clip-path) sudah dari CSS → render awal bisa dilewati. */
function headingTimeline(heading: Element, immediateRender = true) {
  const lines = $$("[data-hl-line]", heading);
  return gsap
    .timeline()
    .fromTo(
      lines,
      { clipPath: "inset(0 100% 0 0)" },
      { clipPath: "inset(0 0% 0 0)", duration: 0.9, ease: "power4.inOut", stagger: 0.12, immediateRender },
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

/* ------------------------------------------------------------------ */
/* Animasi penuh (pengguna tanpa preferensi reduced motion)            */
/* ------------------------------------------------------------------ */
/** Hero intro (tanpa scroll): dibangun paling awal supaya frame pertamanya tidak menunggu section lain */
function setupHero() {
  const hero = document.querySelector("[data-hero]");
  if (!hero) return null;
  const tl = gsap.timeline({ defaults: { ease: EASE } });
  $$("svg[data-corner]", hero).forEach((c, i) => tl.add(cornerTimeline(c), i * 0.15));
  $$("[data-heading]", hero).forEach((h) => tl.add(headingTimeline(h), 0.25));
  tl.from($$("[data-orb]", hero), { scale: 0, rotation: -90, duration: 1, ease: "back.out(1.6)", stagger: 0.15 }, 0.5);
  tl.fromTo($$("[data-fade]", hero), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.1 }, 0.8);
  // grup bertahap di hero (mis. info kontak)
  $$("[data-stagger]", hero).forEach((g) =>
    tl.fromTo(g.children, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08 }, 1),
  );
  // parallax lembut saat hero di-scroll keluar
  gsap.to($$("svg[data-corner]", hero), {
    yPercent: -18,
    ease: "none",
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
  });
  return hero;
}

/** Section di bawah hero (urut atas → bawah) */
function setupSections(hero: Element | null) {
  setupRollButtons();
  const toggle = "play none none reverse";

  $$("[data-section]").forEach((section) => {
    if (section === hero) return;

    // sudut pixel
    $$("svg[data-corner]", section).forEach((c) => {
      ScrollTrigger.create({ trigger: section, start: "top 75%", animation: cornerTimeline(c), toggleActions: toggle });
    });

    // judul highlight (clip-path awal dari CSS)
    $$("[data-heading]", section).forEach((h) => {
      ScrollTrigger.create({
        trigger: h,
        start: "top 85%",
        animation: headingTimeline(h, false),
        toggleActions: toggle,
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

    // fade satuan: opacity 0 + visibility hidden dari CSS. Dulu y:32 dirender saat dibuat sehingga pemicu diukur
    // 32px lebih bawah; "top+=32" menjaga titik mulai yang sama tanpa render awal.
    $$("[data-fade]", section).forEach((el) => {
      gsap.fromTo(
        el,
        { autoAlpha: 0, y: FADE_Y },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.9,
          ease: EASE,
          immediateRender: false,
          scrollTrigger: { trigger: el, start: `top+=${FADE_Y} 88%`, toggleActions: toggle },
        },
      );
    });

    // grup bertahap (anak-anaknya disembunyikan CSS; transform anak tidak mengubah kotak pemicu)
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
          immediateRender: false,
          scrollTrigger: { trigger: group, start: "top 85%", toggleActions: toggle },
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

  // --- marquee tanpa henti (pita layanan, pita proses): hanya berjalan saat terlihat dan tidak disorot ---
  $$("[data-marquee]").forEach((track) => {
    const dir = track.dataset.marquee === "right" ? 1 : -1;
    const loop = gsap.fromTo(
      track,
      { xPercent: dir < 0 ? 0 : -50 },
      { xPercent: dir < 0 ? -50 : 0, duration: Number(track.dataset.speed) || 30, ease: "none", repeat: -1 },
    );
    let hovered = false;
    const st = whileVisible(track, loop, () => hovered);
    const strip = track.parentElement ?? track;
    strip.addEventListener("pointerenter", () => {
      hovered = true;
      loop.pause();
    });
    strip.addEventListener("pointerleave", () => {
      hovered = false;
      if (st.isActive) loop.resume();
    });
    // scroll mempercepat sesaat (0,2 dtk), lalu kembali ke 1 dalam 0,8 dtk — tween dipakai ulang, tanpa alokasi per frame
    const up = gsap.quickTo(loop, "timeScale", { duration: 0.2 });
    const down = gsap.quickTo(loop, "timeScale", { duration: 0.8 });
    const settle = gsap.delayedCall(0.2, () => down(1)).pause();
    ScrollTrigger.create({
      trigger: track,
      start: "top bottom",
      end: "bottom top",
      onUpdate: (self) => {
        if (hovered) return;
        down.tween.pause();
        up(1 + Math.min(Math.abs(self.getVelocity()) / 300, 4));
        settle.restart(true);
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

  // --- matriks titik bergelombang di panel layanan: hanya berjalan saat terlihat ---
  $$("[data-dotwave]").forEach((grid) => {
    const dots = $$("i", grid);
    // jumlah kolom dari kelas grid-cols-N (sama dengan hasil grid "auto", tanpa mengukur posisi tiap titik)
    const cols = Number(/\bgrid-cols-(\d+)\b/.exec(grid.className)?.[1]) || 0;
    const wave = gsap.fromTo(
      dots,
      { scale: 0.25, opacity: 0.35 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.9,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: {
          each: 0.05,
          grid: cols ? [Math.ceil(dots.length / cols), cols] : "auto",
          from: grid.dataset.from === "end" ? "end" : "center",
        },
      },
    );
    whileVisible(grid, wave);
  });

  // --- kartu portofolio: gambar sedikit membesar saat hover ---
  $$("[data-card]").forEach((card) =>
    hoverTimeline(card, () =>
      gsap
        .timeline({ paused: true })
        .to(card.querySelector("[data-card-media]"), { scale: 1.06, duration: 0.6, ease: EASE }),
    ),
  );
}

/**
 * Orb: mengambang + sedikit berputar mengikuti scroll. Hanya orb yang tampil (ponsel: display:none lewat
 * hidden md:grid / lg:grid); dibangun ulang saat melewati breakpoint itu. Mengambang hanya saat terlihat.
 * Nilai awal mengambang = keadaan setelah intro from() (rotasi -90, y 0), sama seperti saat dibuat langsung dulu.
 */
function setupOrbs() {
  const mm = gsap.matchMedia();
  mm.add(
    { md: "(min-width: 768px)", lg: "(min-width: 1024px)", motion: "(prefers-reduced-motion: no-preference)" },
    (ctx) => {
      if (!(ctx.conditions as { motion: boolean }).motion) return;
      $$("[data-orb]").forEach((o, i) => {
        if (!shown(o)) return;
        const float = gsap.fromTo(
          o,
          { y: 0, rotation: -90 },
          {
            y: i % 2 ? 14 : -14,
            rotation: i % 2 ? -6 : 6,
            duration: 3.2 + i * 0.4,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            immediateRender: false,
          },
        );
        // pemicu = wadah orb (kotak orb sendiri ber-transform scale 0 saat intro belum jalan)
        whileVisible(o, float, undefined, o.parentElement ?? o);
        gsap.to(o, {
          rotation: "+=120",
          ease: "none",
          scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 1 },
        });
      });
    },
  );
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
    /** `refresh`: hanya tween terakhir per klik yang menghitung ulang ScrollTrigger (satu layout penuh per klik) */
    const toggle = (item: HTMLElement, open: boolean, refresh: boolean) => {
      const panel = item.querySelector<HTMLElement>("[data-acc-panel]")!;
      const btn = item.querySelector<HTMLButtonElement>("[data-acc-btn]")!;
      const icon = item.querySelector("[data-acc-icon]");
      btn.setAttribute("aria-expanded", String(open));
      gsap.to(panel, {
        height: open ? "auto" : 0,
        autoAlpha: open ? 1 : 0,
        duration: reducedMotion() ? 0 : 0.5,
        ease: "power3.inOut",
        onComplete: refresh ? () => ScrollTrigger.refresh() : undefined,
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
        items.forEach((other) => other !== item && other.dataset.open === "true" && toggle(other, false, false));
        toggle(item, willOpen, true);
      });
    });
  });
}

/** Font yang baru selesai SETELAH window load (refresh bawaan ScrollTrigger saat load sudah lewat) → satu refresh */
function refreshAfterLateFonts() {
  const check = () => {
    if (document.fonts && document.fonts.status !== "loaded")
      void document.fonts.ready.then(() => ScrollTrigger.refresh());
  };
  if (document.readyState === "complete") check();
  else window.addEventListener("load", check, { once: true });
}

/* ------------------------------------------------------------------ */
// Interaksi (menu, akordeon) dipasang sekali; matchMedia hanya mengatur animasi,
// sehingga listener tidak dobel saat preferensi motion berubah.
setupMenu();

// tab disembunyikan: seluruh animasi berhenti (dilanjutkan dari titik yang sama saat kembali)
pauseWhileHidden(gsap.globalTimeline);

// Sisa halaman dibangun setelah frame pertama hero tergambar (tugas panjang dipecah; konten di bawah tetap
// tersembunyi oleh CSS sampai pemicunya ada). Bila preferensi motion berubah setelahnya, langsung dibangun.
let booted = false;
let rest: (() => void) | null = null;
const mm = gsap.matchMedia();
mm.add({ motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
  const { reduce } = ctx.conditions as { motion: boolean; reduce: boolean };
  if (reduce) {
    gsap.set("[data-hl-line]", { clipPath: "none" });
    gsap.set("[data-fade], [data-stagger] > *", { autoAlpha: 1 });
    return;
  }
  const hero = setupHero();
  const build = () => {
    ctx.add(() => setupSections(hero));
    refreshAfterLateFonts();
  };
  if (booted) build();
  else rest = build;
});
void nextFrame().then(() => {
  booted = true;
  // akordeon dulu (mengubah tinggi halaman), baru pemicu section dihitung
  setupAccordions();
  rest?.();
  rest = null;
  setupOrbs();
});
