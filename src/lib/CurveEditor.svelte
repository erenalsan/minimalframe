<script>
  // Tone-curve editor. Click to add a point, drag to move, double-click (or Delete) to remove.
  // Points are focusable: arrow keys move them, so the curve also works without a mouse.
  import { curveLUT } from "./color.js";

  let { points, onchange, color = "#fff", label = "Tone curve" } = $props();

  const S = 256; // drawing size in SVG units
  const sorted = $derived([...points].sort((a, b) => a[0] - b[0]));
  const path = $derived(
    "M" + Array.from(curveLUT(points), (v, i) => `${(i / 255) * S} ${S - (v / 255) * S}`).join(" L"),
  );

  let svg;
  let dragIndex = -1;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const toPoint = (e) => {
    const r = svg.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width), clamp(1 - (e.clientY - r.top) / r.height)];
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

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<svg
  bind:this={svg}
  viewBox="0 0 {S} {S}"
  role="application"
  aria-label="{label}: click to add a point, drag to move it"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={() => (dragIndex = -1)}
  onpointercancel={() => (dragIndex = -1)}
>
  {#each [1, 2, 3] as q (q)}
    <line x1={(q * S) / 4} y1="0" x2={(q * S) / 4} y2={S} class="grid" />
    <line x1="0" y1={(q * S) / 4} x2={S} y2={(q * S) / 4} class="grid" />
  {/each}
  <line x1="0" y1={S} x2={S} y2="0" class="diag" />
  <path d={path} style:stroke={color} />
  {#each sorted as p, i (i)}
    <circle
      cx={p[0] * S}
      cy={S - p[1] * S}
      r="7"
      style:fill={color}
      tabindex="0"
      role="slider"
      aria-label="Point {i + 1}: input {Math.round(p[0] * 100)}%"
      aria-valuenow={Math.round(p[1] * 100)}
      aria-valuemin="0"
      aria-valuemax="100"
      onkeydown={(e) => key(e, i)}
      ondblclick={() => remove(i)}
    />
  {/each}
</svg>

<style>
  svg {
    width: 100%;
    aspect-ratio: 1;
    display: block;
    background: rgb(0 0 0 / 0.25);
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
