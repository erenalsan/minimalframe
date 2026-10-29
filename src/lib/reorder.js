/**
 * reorder.js — move an item in a list by dragging it: hold it on a touch screen (a quick swipe still scrolls),
 * or just drag it with a mouse. A Svelte action for the list; its items carry data-index.
 * On release over another item, calls onmove(from, to). A tap is still a tap.
 * Checkboxes and remove buttons inside an item keep working.
 */
export function reorder(node, opts) {
  let o = opts;
  let drag = null;
  let timer;
  let quietUntil = 0; // swallow the click that follows a drag

  const items = () => [...node.querySelectorAll("[data-index]")];
  const mark = (el) => items().forEach((x) => x.classList.toggle("drop-target", x === el));
  function start() {
    if (!drag) return;
    drag.live = true;
    drag.el.classList.add("lifted");
    navigator.vibrate?.(8);
  }
  function stop() {
    clearTimeout(timer);
    if (drag) {
      drag.el.style.transform = "";
      drag.el.classList.remove("lifted");
    }
    mark(null);
    drag = null;
  }
  function down(e) {
    const el = e.target.closest("[data-index]");
    if (!el || !node.contains(el) || e.button > 0 || e.target.closest("input, label, .mini-del")) return;
    drag = { el, from: Number(el.dataset.index), to: null, x: e.clientX, y: e.clientY, id: e.pointerId, live: false, touch: e.pointerType !== "mouse" };
    if (drag.touch) timer = setTimeout(start, 280);
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.live) {
      if (Math.hypot(dx, dy) < 8) return;
      if (drag.touch) return stop(); // moved before the hold: a scroll
      start();
    }
    drag.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.06)`;
    const over = document
      .elementsFromPoint(e.clientX, e.clientY)
      .map((x) => x.closest?.("[data-index]"))
      .find((x) => x && x !== drag.el && node.contains(x));
    if (over) drag.to = Number(over.dataset.index);
    mark(over ?? null);
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    stop();
    if (!d.live) return;
    quietUntil = performance.now() + 400;
    if (d.to != null && d.to !== d.from) o.onmove(d.from, d.to);
  }
  const click = (e) => {
    if (performance.now() < quietUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  // While a photo is lifted, the finger moves it: no scrolling, no pulling the tray closed, no long-press menu.
  const touchmove = (e) => {
    if (!drag?.live) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  };
  const menu = (e) => drag && e.preventDefault();

  node.addEventListener("pointerdown", down);
  node.addEventListener("click", click, true);
  node.addEventListener("touchmove", touchmove, { passive: false });
  node.addEventListener("contextmenu", menu);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", stop);
  return {
    update(next) {
      o = next;
    },
    destroy() {
      stop();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("click", click, true);
      node.removeEventListener("touchmove", touchmove);
      node.removeEventListener("contextmenu", menu);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", stop);
    },
  };
}
