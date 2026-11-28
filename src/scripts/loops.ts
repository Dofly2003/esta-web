// Hemat CPU untuk animasi tanpa henti di website publik (marquee, dot-matrix, orb): hanya berjalan saat terlihat,
// dan seluruh animasi berhenti saat tab disembunyikan. Dipakai motion.ts (satu bundel dengannya).
import { ScrollTrigger } from "gsap/ScrollTrigger";

type Playable = { pause(): unknown; resume(): unknown };

/** Elemen punya kotak (bukan display:none, termasuk lewat leluhurnya) */
export const shown = (el: Element) => el.getClientRects().length > 0;

/**
 * Jalankan `anim` hanya selama `trigger` (bawaan: `target`) ada di layar dan `blocked()` false. Animasi dibuat dalam
 * keadaan dijeda; ScrollTrigger yang memutar/menjedanya. `target` tanpa kotak (display:none) tidak pernah diputar.
 */
export function whileVisible(target: Element, anim: Playable, blocked = () => false, trigger: Element = target) {
  anim.pause();
  const sync = (self: Pick<ScrollTrigger, "isActive">) =>
    self.isActive && !blocked() && shown(target) ? anim.resume() : anim.pause();
  return ScrollTrigger.create({ trigger, start: "top bottom", end: "bottom top", onToggle: sync, onRefresh: sync });
}

/** Tab disembunyikan: `timeline` (gsap.globalTimeline) dijeda, dilanjutkan dari titik yang sama saat kembali */
export function pauseWhileHidden(timeline: Playable, doc: Document = document) {
  doc.addEventListener("visibilitychange", () => (doc.hidden ? timeline.pause() : timeline.resume()));
}
