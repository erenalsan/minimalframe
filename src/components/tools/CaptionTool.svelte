<script>
  // Caption: which camera details show, their text (per photo), layout, font, size, alignment and place.
  import Dial from "../../lib/Dial.svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { EXIF_FIELDS, ALIGN_X } from "../../lib/catalog.js";
  import { allFonts, addFont, rememberFont, registerFile } from "../../lib/fontLibrary.svelte.js";

  let { frame = $bindable(), item = $bindable() } = $props(); // item: the active photo (its caption text)

  function setAlignment(align) {
    frame.textAlign = align;
    frame.textPosX = ALIGN_X[align];
  }

  const canBrowseLocalFonts = typeof window !== "undefined" && "queryLocalFonts" in window;
  let localFamilies = $state([]);
  let fontError = $state("");

  async function browseLocalFonts() {
    fontError = "";
    try {
      const fonts = await window.queryLocalFonts();
      localFamilies = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
    } catch (err) {
      fontError = t("Font access was blocked. Allow it in the browser's site settings, or upload a font file instead.");
      console.warn("[MinimalFrame] queryLocalFonts:", err);
    }
  }

  function useLocalFont(family) {
    if (!family || !localFamilies.includes(family)) return;
    frame.selectedFontId = addFont(`local:${family}`, family, `"${family}"`);
    rememberFont({ kind: "local", family });
  }

  async function onFontFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    fontError = "";
    const family = file.name.replace(/\.[^.]+$/, "");
    try {
      const buffer = await file.arrayBuffer();
      const f = await registerFile(family, buffer.slice(0));
      frame.selectedFontId = addFont(f.id, f.label, f.css);
      rememberFont({ kind: "file", family, buffer });
    } catch {
      fontError = t("{name} is not a font this browser can read. Use a .ttf, .otf, .woff or .woff2 file.", { name: file.name });
    }
  }
</script>

<div class="stack">
  <label class="switch">
    <input type="checkbox" role="switch" bind:checked={frame.showExif} />
    <span class="switch-track" aria-hidden="true"></span>
    {t("Show camera details")}
  </label>
  {#if frame.showExif}
    <div>
      <p class="label">{t("Layout")}</p>
      <div class="seg">
        <button aria-pressed={frame.captionStyle === "stack"} onclick={() => (frame.captionStyle = "stack")}>{t("Stacked")}</button>
        <button aria-pressed={frame.captionStyle === "bar"} onclick={() => (frame.captionStyle = "bar")} title={t("Model and lens on the left; brand and settings on the right, like a camera watermark")}>{t("Brand bar")}</button>
        <button aria-pressed={frame.captionStyle === "spread"} onclick={() => (frame.captionStyle = "spread")} title={t("Settings spread across one slim row under the photo, camera name on the photo: the photo gets almost the whole frame")}>{t("Spread")}</button>
      </div>
    </div>
    {#if item}
      <div class="fields">
        {#each EXIF_FIELDS as [key, name, example] (key)}
          <div class="field">
            <label class="field-check">
              <input type="checkbox" bind:checked={frame.exifDisplay[key]} />
              {t(name)}
            </label>
            <input class="text" type="text" bind:value={item.exifOverride[key]} placeholder={example} aria-label={t(name)} disabled={!frame.exifDisplay[key]} />
          </div>
        {/each}
      </div>
      <p class="hint">{t("Missing details? Type them in. Changes apply to this photo only.")}</p>
    {/if}

    <div>
      <p class="label">{t("Font")}</p>
      <div class="fonts">
        {#each allFonts() as f (f.id)}
          <button class="font" aria-pressed={frame.selectedFontId === f.id} onclick={() => (frame.selectedFontId = f.id)}>
            <span class="font-aa" style:font-family={f.css}>Aa</span>
            <span class="font-name">{t(f.label)}</span>
          </button>
        {/each}
      </div>
    </div>

    <div>
      <p class="label">{t("Alignment")}</p>
      <div class="seg">
        <button aria-pressed={frame.textAlign === "left"} onclick={() => setAlignment("left")}>{t("Left")}</button>
        <button aria-pressed={frame.textAlign === "center"} onclick={() => setAlignment("center")}>{t("Center")}</button>
        <button aria-pressed={frame.textAlign === "right"} onclick={() => setAlignment("right")}>{t("Right")}</button>
      </div>
    </div>
    <div>
      <p class="label">{t("Place")}</p>
      <div class="seg">
        <button aria-pressed={frame.textZone === "bottom"} onclick={() => (frame.textZone = "bottom")}>{t("Below photo")}</button>
        <button aria-pressed={frame.textZone === "top"} onclick={() => (frame.textZone = "top")}>{t("Above photo")}</button>
      </div>
    </div>
    <div>
      <p class="label">{t("Size")}</p>
      <div class="seg">
        <button aria-pressed={frame.autoFontSize} onclick={() => (frame.autoFontSize = true)}>{t("Fit automatically")}</button>
        <button aria-pressed={!frame.autoFontSize} onclick={() => (frame.autoFontSize = false)}>{t("Set by hand")}</button>
      </div>
    </div>
    {#if !frame.autoFontSize}
      <Dial id="d-font" label={t("Text size")} bind:value={frame.manualFontSize} min={10} max={80} reset={24} />
    {/if}
    <details class="more">
      <summary>{t("More")}</summary>
      <div class="stack">
        <label class="switch" title={t("Turns codes like ILCE-7RM4 or XF35mmF2 into Sony A7R IV and Fujifilm XF 35mm f/2")}>
          <input type="checkbox" role="switch" bind:checked={frame.cleanNames} />
          <span class="switch-track" aria-hidden="true"></span>
          {t("Clean metadata names")}
        </label>
        <div class="font-more">
          {#if canBrowseLocalFonts}
            {#if localFamilies.length}
              <label class="label" for="local-font">{t("Fonts on this computer")}</label>
              <input
                id="local-font"
                class="text"
                list="local-font-list"
                placeholder={t("Type to search {n} fonts", { n: localFamilies.length })}
                onchange={(e) => useLocalFont(e.currentTarget.value)}
              />
              <datalist id="local-font-list">
                {#each localFamilies as fam (fam)}<option value={fam}></option>{/each}
              </datalist>
            {:else}
              <button class="btn ghost" onclick={browseLocalFonts}>{t("Use a font from this computer")}</button>
            {/if}
          {/if}
          <label class="btn ghost upload-font">
            {t("Upload a font file")}
            <input type="file" accept=".ttf,.otf,.woff,.woff2" onchange={onFontFile} class="sr-only" />
          </label>
          {#if fontError}<p class="hint warn" role="alert">{fontError}</p>{/if}
        </div>
      </div>
    </details>
  {/if}
</div>

<style>
  /* Caption fields & fonts */
  .fields {
    display: grid;
    gap: 8px;
  }
  .field {
    display: grid;
    grid-template-columns: 8rem 1fr;
    align-items: center;
    gap: 10px;
  }
  .field-check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--fs-label);
    color: var(--muted);
    cursor: pointer;
  }
  .field-check input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent-ink);
  }
  .fonts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .font {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .font-aa {
    display: grid;
    place-items: center;
    height: 52px;
    border-radius: 10px;
    background: var(--field);
    font-size: 1.5rem;
    line-height: 1.1;
    outline: 2px solid transparent;
    outline-offset: 2px;
    transition: outline-color 150ms, scale 120ms;
  }
  /* pressed and hover: as every tile (ui.css, Touch and pointer feedback) */
  .font:active .font-aa {
    scale: 0.96;
  }
  @media (hover: hover) {
    .font:hover:not([aria-pressed="true"]) .font-aa {
      outline-color: color-mix(in srgb, var(--text) 30%, transparent);
    }
  }
  .font-name {
    font-size: var(--fs-label);
    color: var(--muted);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .font[aria-pressed="true"] .font-aa {
    outline-color: var(--text);
  }
  .font[aria-pressed="true"] .font-name {
    color: var(--text);
  }
  .font-more {
    display: grid;
    gap: 8px;
  }
  .upload-font {
    cursor: pointer;
  }
  @media (max-width: 899px) {
    .field {
      grid-template-columns: 7rem 1fr;
    }
  }
</style>
