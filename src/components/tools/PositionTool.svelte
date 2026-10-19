<script>
  // Fine placement of the caption inside its border.
  import Dial from "../../lib/Dial.svelte";
  import { t } from "../../lib/i18n.svelte.js";

  let { frame = $bindable(), onreset } = $props();
</script>

{#if frame.showExif}
  <div class="stack">
    <Dial id="d-text-x" label={t("Across the photo")} bind:value={frame.textPosX} unit="%" />
    <Dial id="d-text-y" label={t("Distance from photo")} bind:value={frame.textPosY} unit="%" reset={50} />
    <p class="hint">{t("The caption always stays inside the frame and never covers your photo.")}</p>
    <button class="btn ghost" onclick={onreset}>{t("Reset caption position")}</button>
  </div>
{:else}
  <p class="hint">{t("Turn on camera details under Caption to place them.")}</p>
{/if}
