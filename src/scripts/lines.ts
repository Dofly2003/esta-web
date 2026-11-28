// Kalimat besar [data-lines] (hanya beranda): baris terbuka dari bawah, lalu "menyala" mengikuti scroll.
// Modul terpisah dari motion.ts supaya SplitText hanya diunduh halaman yang memakainya (gsap & ScrollTrigger
// dibagi lewat chunk bersama, tanpa loader dynamic import). Dipecah setelah font siap: tidak dipecah ulang
// saat Geist tiba (autoSplit tetap menangani resize). Reduced motion: tidak dipecah (teks statis).
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

const els = gsap.utils.toArray<HTMLElement>(document.querySelectorAll("[data-lines]"));
if (els.length) {
  const fonts = document.fonts?.ready ?? Promise.resolve();
  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", (ctx) => {
    void fonts.then(() =>
      ctx.add(() => {
        for (const el of els) {
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
        }
      }),
    );
  });
}
