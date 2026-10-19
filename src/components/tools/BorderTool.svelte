<script>
  // Border size. In a fixed ratio one side fills by itself (autoAxis), so only the other slider is shown.
  import Dial from "../../lib/Dial.svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { RATIOS } from "../../lib/catalog.js";

  let { frame = $bindable(), autoAxis } = $props();
</script>

<div class="stack">
  {#if autoAxis !== "h"}
    <Dial id="d-margin-h" label={autoAxis ? t("Border") : t("Sides")} bind:value={frame.customMarginH} min={0} max={40} unit="%" reset={8} />
  {/if}
  {#if autoAxis !== "v"}
    <Dial id="d-margin-v" label={autoAxis ? t("Border") : t("Top and bottom")} bind:value={frame.customMarginV} min={0} max={40} unit="%" reset={8} />
  {/if}
  {#if frame.selectedRatioId === "carousel"}
    <p class="hint">{t("An even border around the whole strip. The photo is cropped to fill the slides inside it.")}</p>
  {:else if autoAxis}
    <p class="hint">
      {t(autoAxis === "v" ? "Top and bottom fill in by themselves to keep the {shape} shape." : "The sides fill in by themselves to keep the {shape} shape.", {
        shape: t(RATIOS.find((r) => r.id === frame.selectedRatioId)?.label ?? ""),
      })}
      {t("Choose Even border in Ratio to set every side yourself.")}
    </p>
  {/if}
  {#if frame.selectedRatioId === "orig"}
    <Dial id="d-caption-space" hint={t("Extra frame space reserved for the caption text.")} label={t("Caption space")} bind:value={frame.captionSpace} min={0} max={40} unit="%" reset={12} />
  {/if}
  <p class="hint">{t("The border under the caption always grows enough to fit it.")}</p>
</div>
