<script>
  // Your logo or signature as a watermark: upload, snap to a corner, size, opacity and position.
  import Dial from "../../lib/Dial.svelte";
  import { t } from "../../lib/i18n.svelte.js";

  let { frame = $bindable(), logoImage, logoName, onupload, onremove } = $props();

  function setLogoPreset(pos) {
    if (pos === "bottom-right") {
      frame.logoPosX = 92;
      frame.logoPosY = 93;
    } else if (pos === "bottom-left") {
      frame.logoPosX = 8;
      frame.logoPosY = 93;
    } else if (pos === "top-right") {
      frame.logoPosX = 92;
      frame.logoPosY = 7;
    } else if (pos === "top-left") {
      frame.logoPosX = 8;
      frame.logoPosY = 7;
    } else if (pos === "center") {
      frame.logoPosX = 50;
      frame.logoPosY = 50;
    }
  }
</script>

{#if logoImage}
  <div class="stack">
    <div class="logo-row">
      <img src={logoImage.src} alt="" />
      <span class="logo-name">{logoName || t("Your logo")}</span>
      <button class="btn ghost" onclick={onremove}>{t("Remove")}</button>
    </div>
    <div>
      <p class="label">{t("Snap to")}</p>
      <div class="seg wrap">
        <button onclick={() => setLogoPreset("top-left")}>{t("Top left")}</button>
        <button onclick={() => setLogoPreset("top-right")}>{t("Top right")}</button>
        <button onclick={() => setLogoPreset("center")}>{t("Center")}</button>
        <button onclick={() => setLogoPreset("bottom-left")}>{t("Bottom left")}</button>
        <button onclick={() => setLogoPreset("bottom-right")}>{t("Bottom right")}</button>
      </div>
    </div>
    <Dial id="d-logo-scale" label={t("Size")} bind:value={frame.logoScale} min={3} max={45} unit="%" reset={12} />
    <Dial id="d-logo-opacity" label={t("Opacity")} bind:value={frame.logoOpacity} min={5} max={100} unit="%" reset={85} />
    <Dial id="d-logo-x" label={t("Across")} bind:value={frame.logoPosX} unit="%" />
    <Dial id="d-logo-y" label={t("Up and down")} bind:value={frame.logoPosY} unit="%" />
  </div>
{:else}
  <label class="upload">
    <span class="upload-title">{t("Add your logo or signature")}</span>
    <span class="hint">{t("A PNG or SVG with a transparent background works best.")}</span>
    <input type="file" accept=".png,.svg,.webp,.jpg,.jpeg" onchange={onupload} class="sr-only" />
  </label>
{/if}

<style>
  /* Logo */
  .logo-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo-row img {
    width: 48px;
    height: 48px;
    object-fit: contain;
    padding: 6px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--text) 12%, transparent);
  }
  .logo-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.92rem;
  }
  .upload {
    display: grid;
    gap: 6px;
    padding: 22px 18px;
    border: 1px dashed color-mix(in srgb, var(--text) 35%, transparent);
    border-radius: 16px;
    cursor: pointer;
  }
  .upload:hover,
  .upload:focus-within {
    border-color: var(--accent-ink);
  }
  .upload-title {
    font-weight: 650;
  }
</style>
