<script>
  // Crop ratio, straighten, rotate and flip. The crop box itself is drawn over the photo by App.
  import Dial from "../../lib/Dial.svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { CROP_RATIOS } from "../../lib/geometry.js";
  import Icon from "../Icon.svelte";

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
  <div class="row-btns turn">
    <button class="btn ghost" onclick={() => onturn(-1)}>{t("Rotate left")}</button>
    <button class="btn ghost" onclick={() => onturn(1)}>{t("Rotate right")}</button>
    <button class="btn ghost" onclick={() => onchange({ flip: !crop.flip })}>{t("Flip")}</button>
    <button class="btn ghost" onclick={onreset} disabled={!canReset}><Icon name="revert" />{t("Reset crop")}</button>
  </div>
  <p class="hint">{t("Drag the box or its corners. The crop shows on the photo when you switch to another tool.")}</p>
</div>

<style>
  /* one row, so the crop tool stays short and the photo keeps the screen */
  .turn {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
  }
  .turn .btn :global(svg) {
    width: 14px;
    height: 14px;
    flex: none;
  }
  .turn .btn {
    gap: 4px;
    padding: 9px 4px;
    font-size: var(--fs-label);
    line-height: 1.15;
  }
</style>
