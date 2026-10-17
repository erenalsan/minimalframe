<script>
  // Frame shape for each platform: feed, story, carousel, print.
  import Dial from "../../lib/Dial.svelte";
  import { RATIOS } from "../../lib/catalog.js";

  // item: the active photo (its carousel position). fillAxis: which way the photo can move inside the strip.
  let { frame = $bindable(), item = $bindable(), slices, fillAxis } = $props();
  const setFill = (axis, v) => (item.fill = { ...item.fill, [axis]: v / 100 });
  const setSlides = (n) => (frame.slides = Math.min(10, Math.max(2, n)));
</script>

<div class="ratios">
  {#each RATIOS as r (r.id)}
    <button class="ratio" aria-pressed={frame.selectedRatioId === r.id} onclick={() => (frame.selectedRatioId = r.id)}>
      <span class="ratio-glyph" class:loose={!r.w} style:aspect-ratio={r.w ? `${r.w} / ${r.h}` : r.id === "orig" ? "3 / 3.6" : r.id === "carousel" ? "12 / 5" : "3 / 2.4"}></span>
      <span>{r.label}</span>
    </button>
  {/each}
</div>
{#if frame.selectedRatioId === "carousel"}
  <div class="carousel">
    <div class="stepper" role="group" aria-label="Number of slides">
      <span class="label">Slides</span>
      <button onclick={() => setSlides(slices - 1)} disabled={slices <= 2} aria-label="Fewer slides">−</button>
      <output aria-live="polite">{slices}</output>
      <button onclick={() => setSlides(slices + 1)} disabled={slices >= 10} aria-label="More slides">+</button>
    </div>
    <div class="seg" role="group" aria-label="Slide shape">
      <button aria-pressed={frame.slideShape !== "1:1"} onclick={() => (frame.slideShape = "4:5")}>4:5</button>
      <button aria-pressed={frame.slideShape === "1:1"} onclick={() => (frame.slideShape = "1:1")}>Square</button>
    </div>
  </div>
  {#if fillAxis && item}
    <Dial
      id="d-fill"
      label={fillAxis === "y" ? "Position: top ↔ bottom" : "Position: left ↔ right"}
      hint="Which part of the photo fills the slides. You can also drag the photo itself."
      bind:value={() => Math.round(item.fill[fillAxis] * 100), (v) => setFill(fillAxis, v)}
      min={0}
      max={100}
      unit="%"
      reset={50}
    />
  {/if}
  <p class="hint">
    Your photo fills all {slices} slides (drag the photo to choose which part) and they line up seamlessly as people swipe.
    Each slide is saved at up to {frame.slideShape === "1:1" ? "1080 × 1080" : "1080 × 1350"}, Instagram's full size, so
    wide shots keep their detail.
  </p>
{/if}

<style>
  .carousel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .stepper .label {
    margin-right: 6px;
  }
  .stepper button {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--field);
    font-size: 1.2rem;
    line-height: 1;
  }
  .stepper output {
    min-width: 2ch;
    text-align: center;
    font-size: 1.1rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  /* Ratios */
  .ratios {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .ratio {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--text) 5%, transparent);
    border: 1px solid transparent;
    font-size: 0.88rem;
    text-align: left;
    color: var(--muted);
  }
  .ratio-glyph {
    flex: none;
    height: 24px;
    border: 2px solid currentColor;
    border-radius: 3px;
  }
  .ratio-glyph.loose {
    border-style: dashed;
  }
  .ratio[aria-pressed="true"] {
    border-color: var(--accent-ink);
    color: var(--text);
  }
  .ratio[aria-pressed="true"] .ratio-glyph {
    color: var(--accent-ink);
  }
  @media (max-width: 600px) {
    .ratio {
      gap: 8px;
      padding: 8px 10px;
      font-size: 0.82rem;
    }
  }
  /* Compact tray (phones, portrait tablets): one swipeable row, so the photo keeps the screen. Same query as COMPACT in App.svelte. */
  @media (max-width: 899px) and (min-height: 501px) {
    .ratios {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
      margin: 0 -14px;
      padding: 2px 14px 4px;
    }
    .ratio {
      flex: none;
      white-space: nowrap;
    }
  }
</style>
