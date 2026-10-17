<script>
  // Border size. In a fixed ratio one side fills by itself (autoAxis), so only the other slider is shown.
  import Dial from "../../lib/Dial.svelte";
  import { RATIOS } from "../../lib/catalog.js";

  let { frame = $bindable(), autoAxis } = $props();
</script>

<div class="stack">
  {#if autoAxis !== "h"}
    <Dial id="d-margin-h" label={autoAxis ? "Border" : "Sides"} bind:value={frame.customMarginH} min={0} max={40} unit="%" reset={8} />
  {/if}
  {#if autoAxis !== "v"}
    <Dial id="d-margin-v" label={autoAxis ? "Border" : "Top and bottom"} bind:value={frame.customMarginV} min={0} max={40} unit="%" reset={8} />
  {/if}
  {#if frame.selectedRatioId === "carousel"}
    <p class="hint">An even border around the whole strip. The photo is cropped to fill the slides inside it.</p>
  {:else if autoAxis}
    <p class="hint">
      {autoAxis === "v" ? "Top and bottom fill" : "The sides fill"} in by themselves to keep the
      {RATIOS.find((r) => r.id === frame.selectedRatioId)?.label} shape. Choose Even border in Ratio to set every side yourself.
    </p>
  {/if}
  {#if frame.selectedRatioId === "orig"}
    <Dial id="d-caption-space" hint="Extra frame space reserved for the caption text." label="Caption space" bind:value={frame.captionSpace} min={0} max={40} unit="%" reset={12} />
  {/if}
  <p class="hint">The border under the caption always grows enough to fit it.</p>
</div>
