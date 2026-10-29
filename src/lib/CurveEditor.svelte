<script>
  import { t } from "./i18n.svelte.js";
  // Tone-curve editor. Click to add a point, drag to move, double-click (or Delete) to remove.
  // Points are focusable: arrow keys move them, so the curve also works without a mouse.
  import { curveLUT } from "./color.js";

  let { points, onchange, color = "#fff", label = "Tone curve" } = $props();

  // Drawn in on-screen pixels: square on wide screens, wide and short in a phone's tray.
  let W = $state(256);
  let H = $state(256);
  const P = 8; // inset, so the end points on the corners show whole and are easy to grab
  const X = (f) => P + f * (W - 2 * P); // 0–1 input → px
  const Y = (f) => H - P - f * (H - 2 * P); // 0–1 output → px
  const sorted = $derived([...points].sort((a, b) => a[0] - b[0]));
  const path = $derived("M" + Array.from(curveLUT(points), (v, i) => `${X(i / 255)} ${Y(v / 255)}`).join(" L"));

  let svg;
  let dragIndex = -1;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const toPoint = (e) => {
    const r = svg.getBoundingClientRect();
    return [clamp((e.clientX - r.left - P) / (r.width - 2 * P)), clamp(1 - (e.clientY - r.top - P) / (r.height - 2 * P))];
  };

  function update(i, [x, y]) {
    const next = sorted.map((p) => [...p]);
    const isEnd = i === 0 || i === next.length - 1;
    // End points slide only vertically; inner points stay between their neighbours.
    next[i] = isEnd ? [next[i][0], y] : [Math.min(next[i + 1][0] - 0.02, Math.max(next[i - 1][0] + 0.02, x)), y];
    onchange(next);
  }

  function down(e) {
    const [x, y] = toPoint(e);
    let i = sorted.findIndex((p) => Math.abs(p[0] - x) < 0.05 && Math.abs(p[1] - y) < 0.08);
    if (i === -1) {
      if (sorted.length >= 12 || x <= 0.02 || x >= 0.98) return;
      const next = [...sorted.map((p) => [...p]), [x, y]].sort((a, b) => a[0] - b[0]);
      onchange(next);
      i = next.findIndex((p) => p[0] === x);
    }
    dragIndex = i;
    svg.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (dragIndex >= 0) update(dragIndex, toPoint(e));
  }
  function remove(i) {
    if (i > 0 && i < sorted.length - 1) onchange(sorted.filter((_, j) => j !== i));
  }
  function key(e, i) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[e.key];
    if (d) {
      e.preventDefault();
      update(i, [sorted[i][0] + d[0], clamp(sorted[i][1] + d[1])]);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(i);
    }
  }
</script>

<!-- data-drag: dragging here moves points, never the tray it sits in (App.svelte) -->
<div class="curve" data-drag bind:clientWidth={W} bind:clientHeight={H}>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<svg
  bind:this={svg}
  viewBox="0 0 {W} {H}"
  role="application"
  aria-label={t("{label}: click to add a point, drag to move it", { label })}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={() => (dragIndex = -1)}
  onpointercancel={() => (dragIndex = -1)}
>
  {#each [1, 2, 3] as q (q)}
    <line x1={X(q / 4)} y1={Y(0)} x2={X(q / 4)} y2={Y(1)} class="grid" />
    <line x1={X(0)} y1={Y(q / 4)} x2={X(1)} y2={Y(q / 4)} class="grid" />
  {/each}
  <line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(1)} class="diag" />
  <path d={path} style:stroke={color} />
  {#each sorted as p, i (i)}
    <circle
      cx={X(p[0])}
      cy={Y(p[1])}
      r="7"
      style:fill={color}
      tabindex="0"
      role="slider"
      aria-label={t("Point {n}: input {value}%", { n: i + 1, value: Math.round(p[0] * 100) })}
      aria-valuenow={Math.round(p[1] * 100)}
      aria-valuemin="0"
      aria-valuemax="100"
      onkeydown={(e) => key(e, i)}
      ondblclick={() => remove(i)}
    />
  {/each}
</svg>
</div>

<style>
  .curve {
    width: 100%;
    aspect-ratio: 1;
  }
  /* Phones: the full width and whatever height the tray has left after the channel row
     (the row's 38 + gap 16 + the tray's own padding 20, and 2 to spare for rounding), so the whole curve
     shows without scrolling.
     Same query as COMPACT in App.svelte. */
  @media (max-width: 899px) and (min-height: 501px) {
    .curve {
      aspect-ratio: auto;
      height: calc(var(--tray-max, 200px) - 76px);
    }
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    background: #1c1c20;
    border-radius: 12px;
    touch-action: none;
    cursor: crosshair;
  }
  .grid {
    stroke: rgb(255 255 255 / 0.1);
    stroke-width: 1;
  }
  .diag {
    stroke: rgb(255 255 255 / 0.18);
    stroke-dasharray: 4 4;
  }
  path {
    fill: none;
    stroke-width: 2.5;
  }
  circle {
    stroke: rgb(0 0 0 / 0.5);
    stroke-width: 2;
    cursor: grab;
  }
  circle:focus-visible {
    outline: none;
    stroke: #fff;
    stroke-width: 3;
  }
</style>
