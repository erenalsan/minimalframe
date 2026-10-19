<script>
  // Crop ratio, straighten, rotate and flip. The crop box itself is drawn over the photo by App.
  import Dial from "../../lib/Dial.svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { CROP_RATIOS } from "../../lib/geometry.js";

  let { crop, canReset, onratio, onturn, onchange, onreset } = $props();
</script>

<div class="stack">
  <div>
    <p class="label">{t("Crop ratio")}</p>
    <div class="seg wrap">
      {#each CROP_RATIOS as r (r.id)}
        <button aria-pressed={crop.ratio === r.id} onclick={() => onratio(r.id)}>{t(r.label)}</button>
      {/each}
    </div>
  </div>
  <Dial
    id="d-straighten"
    label={t("Straighten")}
    bind:value={() => crop.angle, (v) => onchange({ angle: v })}
    min={-45}
    max={45}
    step={0.1}
    unit="°"
    reset={0}
    signed
  />
  <div class="row-btns">
    <button class="btn ghost" onclick={() => onturn(-1)}>{t("Rotate left")}</button>
    <button class="btn ghost" onclick={() => onturn(1)}>{t("Rotate right")}</button>
    <button class="btn ghost" onclick={() => onchange({ flip: !crop.flip })}>{t("Flip")}</button>
  </div>
  <button class="btn ghost" onclick={onreset} disabled={!canReset}>{t("Reset crop")}</button>
  <p class="hint">{t("Drag the box or its corners. The crop shows on the photo when you switch to another tool.")}</p>
</div>

<style>
  /* Compact tray (phones, portrait tablets): one swipeable row, so the photo keeps the screen. Same query as COMPACT in App.svelte. */
  @media (max-width: 899px) and (min-height: 501px) {
    .seg.wrap {
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .seg.wrap button {
      flex: none;
    }
  }
</style>
