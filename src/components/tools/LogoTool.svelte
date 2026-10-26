<script>
  // Your logo or signature as a watermark: upload, snap to a corner, size, opacity and position.
  import Dial from "../../lib/Dial.svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { logoLib, useLogo, deleteLogo } from "../../lib/logoLibrary.svelte.js";

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

{#snippet saved()}
  {#if logoLib.list.length}
    <div>
      <p class="label">{t("Your logos")}</p>
      <div class="logos">
        {#each logoLib.list as l (l.id)}
          <div class="logo-cell">
            <button class="logo-pick" aria-pressed={logoLib.current === l.id} onclick={() => useLogo(l.id)} title={l.name} aria-label={t("Use {name}", { name: l.name })}>
              <img src={l.url} alt="" />
            </button>
            <button class="mini-del" onclick={() => deleteLogo(l.id)} aria-label={t("Delete {name}", { name: l.name })}>×</button>
          </div>
        {/each}
        <label class="logo-pick logo-add" title={t("Add a logo")}>
          <input type="file" accept=".png,.svg,.webp,.jpg,.jpeg" onchange={onupload} class="sr-only" />
          <span aria-hidden="true">+</span><span class="sr-only">{t("Add a logo")}</span>
        </label>
      </div>
    </div>
  {/if}
{/snippet}

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
    {@render saved()}
  </div>
{:else if logoLib.list.length}
  <div class="stack">
    {@render saved()}
    <p class="hint">{t("Tap one of your logos to put it on the photo, or add a new one with +.")}</p>
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
  .logos {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .logo-cell {
    position: relative;
  }
  .logo-pick {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    padding: 8px;
    border-radius: 12px;
    border: 1.5px solid transparent;
    background: color-mix(in srgb, var(--text) 10%, transparent);
    cursor: pointer;
  }
  .logo-pick img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .logo-pick[aria-pressed="true"] {
    border-color: var(--text);
  }
  .logo-add {
    border: 1.5px dashed color-mix(in srgb, var(--text) 30%, transparent);
    background: none;
    font-size: 1.4rem;
    color: var(--muted);
  }
</style>
