/**
 * segMotion.js — in every choice bar (.seg, ui.css), the raised pill slides from the old choice to the new one
 * instead of jumping. One listener for the whole page, so no bar needs wiring: it reads where the pill was
 * before the click and, once the app has marked the new choice, slides a stand-in pill across.
 */
const SELECTED = '[aria-pressed="true"], [aria-selected="true"]';

export function startSegMotion(root = document) {
  if (typeof matchMedia === "undefined") return;
  root.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest?.(".seg button");
      const seg = btn?.closest(".seg");
      if (!seg || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const from = seg.querySelector(SELECTED);
      if (!from || from === btn) return;
      const box = (el) => {
        const r = el.getBoundingClientRect();
        const s = seg.getBoundingClientRect();
        return { x: r.left - s.left + seg.scrollLeft, y: r.top - s.top + seg.scrollTop, w: r.width, h: r.height };
      };
      const a = box(from);
      requestAnimationFrame(() => {
        const to = seg.querySelector(SELECTED);
        if (!to || to === from || !seg.isConnected) return;
        const b = box(to);
        const pill = document.createElement("span");
        pill.className = "seg-pill";
        pill.style.cssText = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`;
        seg.prepend(pill);
        to.classList.add("arriving"); // its own raised look waits until the pill arrives
        const done = () => {
          pill.remove();
          to.classList.remove("arriving");
        };
        pill
          .animate(
            [{ translate: `${a.x - b.x}px ${a.y - b.y}px`, width: `${a.w}px`, height: `${a.h}px` }, { translate: "0 0", width: `${b.w}px`, height: `${b.h}px` }],
            { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
          )
          .finished.then(done, done);
      });
    },
    true,
  );
}
