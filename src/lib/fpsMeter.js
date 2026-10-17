// Frame-rate meter for testing on real devices: open the app with ?fps in the address. Shows the last
// second's frame rate, how many frames ran late (over 1.5x the screen's normal frame time) and the slowest
// frame, plus the worst second of the last ten, so a screenshot taken after an animation still shows it.

export function startFpsMeter() {
  const el = Object.assign(document.createElement("div"), { role: "status" });
  el.style.cssText =
    "position:fixed;top:4px;left:4px;z-index:9999;padding:4px 8px;border-radius:6px;background:rgb(0 0 0/.75);" +
    "color:#fff;font:600 11px/1.4 ui-monospace,monospace;pointer-events:none;white-space:pre";
  document.body.append(el);
  let frames = [];
  let last = performance.now();
  let secondStart = last;
  let normal = 1000 / 60; // refined to the screen's real refresh rate as it runs
  const history = [];
  const tick = (now) => {
    frames.push(now - last);
    last = now;
    if (now - secondStart >= 1000) {
      const sorted = [...frames].sort((a, b) => a - b);
      normal = Math.min(normal, sorted[Math.floor(sorted.length * 0.2)] || normal);
      const late = frames.filter((f) => f > normal * 1.5).length;
      const worst = sorted.at(-1) ?? 0;
      history.push({ late, worst });
      if (history.length > 10) history.shift();
      const bad = history.reduce((a, b) => (b.late > a.late ? b : a));
      el.textContent =
        `${frames.length} fps · late ${late} · worst ${worst.toFixed(0)}ms\n` +
        `last 10 s: worst second had ${bad.late} late, ${bad.worst.toFixed(0)}ms`;
      frames = [];
      secondStart = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
