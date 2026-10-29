<script>
  // Frame shape for each platform: feed, story, carousel, print.
  import Dial from "../../lib/Dial.svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { RATIOS } from "../../lib/catalog.js";

  // item: the active photo (its carousel position). fillAxis: which way the photo can move inside the strip.
  let { frame = $bindable(), item = $bindable(), slices, fillAxis } = $props();
  const setFill = (axis, v) => (item.fill = { ...item.fill, [axis]: v / 100 });
  const setSlides = (n) => (frame.slides = Math.min(10, Math.max(2, n)));
</script>

<!-- tiles, like looks and templates: the shape on top, its name below -->
<div class="ratios fade-x">
  {#each RATIOS as r (r.id)}
    <button class="ratio" aria-pressed={frame.selectedRatioId === r.id} onclick={() => (frame.selectedRatioId = r.id)}>
      <span class="ratio-art">
        <span class="ratio-glyph" class:loose={!r.w} style:aspect-ratio={r.w ? `${r.w} / ${r.h}` : r.id === "orig" ? "3 / 3.6" : r.id === "carousel" ? "12 / 5" : "3 / 2.4"}></span>
      </span>
      <span>{t(r.label)}</span>
    </button>
  {/each}
</div>
{#if frame.selectedRatioId === "carousel"}
  <div class="carousel">
    <div class="stepper" role="group" aria-label={t("Number of slides")}>
      <span class="label">{t("Slides")}</span>
      <button onclick={() => setSlides(slices - 1)} disabled={slices <= 2} aria-label={t("Fewer slides")}>−</button>
      <output aria-live="polite">{slices}</output>
      <button onclick={() => setSlides(slices + 1)} disabled={slices >= 10} aria-label={t("More slides")}>+</button>
    </div>
    <div class="seg" role="group" aria-label={t("Slide shape")}>
      <button aria-pressed={frame.slideShape !== "1:1"} onclick={() => (frame.slideShape = "4:5")}>4:5</button>
      <button aria-pressed={frame.slideShape === "1:1"} onclick={() => (frame.slideShape = "1:1")}>{t("Square")}</button>
    </div>
  </div>
  {#if fillAxis && item}
    <Dial
      id="d-fill"
      label={fillAxis === "y" ? t("Position: top ↔ bottom") : t("Position: left ↔ right")}
      hint={t("Which part of the photo fills the slides. You can also drag the photo itself.")}
      bind:value={() => Math.round(item.fill[fillAxis] * 100), (v) => setFill(fillAxis, v)}
      min={0}
      max={100}
      unit="%"
      reset={50}
    />
  {/if}
  <p class="hint">
    {t("Your photo fills all {n} slides (drag the photo to choose which part) and they line up seamlessly as people swipe.", { n: slices })}
    {t("Each slide is saved at up to {size}, Instagram's full size, so wide shots keep their detail.", {
      size: frame.slideShape === "1:1" ? "1080 × 1080" : "1080 × 1350",
    })}
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
  /* Ratios */
  .ratios {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px 10px;
  }
  .ratio {
    display: grid;
    align-content: start;
    gap: 6px;
    font-size: var(--fs-label);
    line-height: 1.25;
    text-align: center;
    color: var(--muted);
  }
  .ratio-art {
    display: grid;
    place-items: center;
    height: 56px;
    border-radius: 10px;
    background: var(--field);
    outline: 2px solid transparent;
    outline-offset: 2px;
    transition: outline-color 150ms, scale 120ms;
  }
  /* pressed and hover: as every tile (ui.css, Touch and pointer feedback) */
  .ratio:active .ratio-art {
    scale: 0.96;
  }
  @media (hover: hover) {
    .ratio:hover:not([aria-pressed="true"]) .ratio-art {
      outline-color: color-mix(in srgb, var(--text) 30%, transparent);
    }
  }
  .ratio-glyph {
    height: 26px;
    max-width: 80%;
    border: 2px solid currentColor;
    border-radius: 3px;
  }
  .ratio-glyph.loose {
    border-style: dashed;
  }
  .ratio[aria-pressed="true"] {
    color: var(--text);
  }
  .ratio[aria-pressed="true"] .ratio-art {
    outline-color: var(--text);
  }
  /* Compact tray (phones, portrait tablets): one swipeable row, so the photo keeps the screen. Same query as COMPACT in App.svelte. */
  @media (max-width: 899px) and (min-height: 501px) {
    .ratios {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      scrollbar-width: none;
      margin: 0 calc(-1 * var(--sp-3));
      padding: 4px var(--sp-3);
    }
    .ratio {
      flex: 0 0 76px;
    }
  }
</style>
