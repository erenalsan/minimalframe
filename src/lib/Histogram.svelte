<script>
  // RGB + luminance histogram. Clipped ends are flagged so blown highlights / crushed shadows are obvious.
  let { bins } = $props();

  const W = 256;
  const H = 64;

  // Scale to the tallest interior bin so a spike of pure black or white doesn't flatten everything else.
  const peak = $derived(Math.max(1, ...Array.from(bins.l).slice(1, -1), ...Array.from(bins.r).slice(1, -1), ...Array.from(bins.b).slice(1, -1)));
  const path = (arr) =>
    `M0 ${H} ` + Array.from(arr, (v, i) => `L${(i / 63) * W} ${H - Math.min(1, v / peak) * H}`).join(" ") + ` L${W} ${H} Z`;
  const total = $derived(bins.l.reduce((a, b) => a + b, 0) || 1);
  const clipLow = $derived(bins.l[0] / total > 0.01);
  const clipHigh = $derived(bins.l[63] / total > 0.01);
</script>

<figure class="histo">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="Histogram of the edited photo">
    <path d={path(bins.r)} fill="#ff5a5a" />
    <path d={path(bins.g)} fill="#5aff7a" />
    <path d={path(bins.b)} fill="#5a8cff" />
    <path class="lum" d={path(bins.l)} fill="#f2f2ee" />
  </svg>
  <figcaption>
    <span class:on={clipLow}>{clipLow ? "Shadows clipped" : "Shadows"}</span>
    <span class:on={clipHigh}>{clipHigh ? "Highlights clipped" : "Highlights"}</span>
  </figcaption>
</figure>

<style>
  .histo {
    display: grid;
    gap: 6px;
  }
  svg {
    width: 100%;
    height: 64px;
    display: block;
    background: #1c1c20;
    border-radius: 12px;
  }
  path {
    mix-blend-mode: screen;
    opacity: 0.55;
  }
  path.lum {
    mix-blend-mode: normal;
    opacity: 0.3;
  }
  figcaption {
    display: flex;
    justify-content: space-between;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .on {
    color: var(--accent-ink, var(--accent));
    font-weight: 600;
  }
</style>
