<script>
  // Frame shape for each platform: feed, story, carousel, print.
  import { RATIOS } from "../../lib/catalog.js";

  let { frame = $bindable(), slices } = $props();
</script>

<div class="ratios">
  {#each RATIOS as r (r.id)}
    <button class="ratio" aria-pressed={frame.selectedRatioId === r.id} onclick={() => (frame.selectedRatioId = r.id)}>
      <span class="ratio-glyph" class:loose={!r.w} style:aspect-ratio={r.w ? `${r.w} / ${r.h}` : r.id === "orig" ? "3 / 3.6" : "3 / 2.4"}></span>
      <span>{r.label}</span>
    </button>
  {/each}
</div>
{#if slices > 1}
  <p class="hint">Exports {slices} separate 4:5 slides that line up seamlessly when people swipe your carousel.</p>
{/if}

<style>
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
