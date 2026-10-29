<script>
  // Border and text colours: quick picks, colours from the photo, auto contrast, and saved pairs.
  import { QUICK_BACKGROUNDS } from "../../lib/catalog.js";
  import { tint } from "../../lib/palette.js";
  import { t } from "../../lib/i18n.svelte.js";
  import ColorPicker from "../../lib/ColorPicker.svelte";

  let { frame = $bindable(), photoPalette } = $props();
  let picking = $state(null); // "border" or "text": which colour the picker below is changing
  const toggle = (which) => (picking = picking === which ? null : which);

  function savePalette() {
    const exists = palettes.some(
      (p) => p.bg === frame.backgroundColor && p.text === frame.textColor,
    );
    if (!exists) {
      palettes = [...palettes, { bg: frame.backgroundColor, text: frame.textColor }];
      persistPalettes();
    }
  }

  function applyPalette(p) {
    frame.backgroundColor = p.bg;
    frame.textColor = p.text;
  }

  function deletePalette(i) {
    palettes = palettes.filter((_, idx) => idx !== i);
    persistPalettes();
  }
</script>

<script module>
  // Saved colour pairs, remembered on this device.
  const LS_KEY = "mf_palettes_v1";
  let palettes = $state([]);

  function loadPalettes() {
    try {
      palettes = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    } catch {
      palettes = [];
    }
  }
  function persistPalettes() {
    localStorage.setItem(LS_KEY, JSON.stringify(palettes));
  }
  loadPalettes();
</script>

<div class="stack">
  <div>
    <p class="label">{t("Border color")}</p>
    <div class="swatches">
      {#each QUICK_BACKGROUNDS as c (c)}
        <button class="swatch" style:background={c} aria-pressed={frame.backgroundColor.toLowerCase() === c} aria-label={t("Border color {c}", { c })} onclick={() => (frame.backgroundColor = c)}></button>
      {/each}
      <!-- any colour: the current one inside a soft colour ring; opens the picker below -->
      <button class="swatch swatch-custom" style:--c={frame.backgroundColor} aria-pressed={picking === "border"} aria-expanded={picking === "border"} title={t("Pick any color")} aria-label={t("Custom border color")} onclick={() => toggle("border")}></button>
    </div>
    {#if picking === "border"}
      <div class="pick"><ColorPicker label={t("Border color")} value={frame.backgroundColor} onchange={(c) => (frame.backgroundColor = c)} /></div>
    {/if}
  </div>
  {#if photoPalette?.length}
    <div>
      <p class="label">{t("From this photo")}</p>
      <div class="swatches">
        {#each photoPalette.flatMap((c) => [tint(c), c]) as c (c)}
          <button class="swatch" style:background={c} aria-pressed={frame.backgroundColor.toLowerCase() === c} aria-label={t("Border color {c}", { c })} onclick={() => (frame.backgroundColor = c)}></button>
        {/each}
      </div>
    </div>
  {/if}
  <label class="switch">
    <input type="checkbox" role="switch" bind:checked={frame.autoContrast} />
    <span class="switch-track" aria-hidden="true"></span>
    {t("Pick text color automatically")}
  </label>
  {#if !frame.autoContrast}
    <div>
      <button class="color-row" aria-expanded={picking === "text"} onclick={() => toggle("text")}>
        <span class="swatch" style:background={frame.textColor} aria-hidden="true"></span>
        {t("Text color")} <span class="hint">{frame.textColor.toUpperCase()}</span>
      </button>
      {#if picking === "text"}
        <div class="pick"><ColorPicker label={t("Text color")} value={frame.textColor} onchange={(c) => (frame.textColor = c)} /></div>
      {/if}
    </div>
  {/if}
  {#if palettes.length > 0}
    <div>
      <p class="label">{t("Saved pairs")}</p>
      <div class="swatches">
        {#each palettes as pal, i (i)}
          <span class="pair">
            <button class="swatch" style:background={pal.bg} onclick={() => applyPalette(pal)} aria-label={t("Use saved pair {n}", { n: i + 1 })}>
              <span class="pair-dot" style:background={pal.text}></span>
            </button>
            <button class="mini-del" onclick={() => deletePalette(i)} aria-label={t("Delete saved pair {n}", { n: i + 1 })}>×</button>
          </span>
        {/each}
      </div>
    </div>
  {/if}
  <button class="btn ghost" onclick={savePalette}>{t("Save this color pair")}</button>
</div>

<style>
  /* Colors (swatches: ui.css) */
  .swatch-custom {
    background: conic-gradient(#f87171, #fbbf24, #a3e635, #34d399, #60a5fa, #a78bfa, #f472b6, #f87171);
    box-shadow: none;
  }
  .swatch-custom::after {
    content: "";
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: var(--c);
    box-shadow:
      0 0 0 1.5px var(--surface),
      inset 0 0 0 1px color-mix(in srgb, var(--text) 18%, transparent);
  }
  .pick {
    margin-top: var(--sp-2);
  }
  .pair {
    position: relative;
  }
  .pair-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .color-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    font-size: var(--fs-label);
  }
  .color-row .hint {
    font-family: "Space Mono", ui-monospace, monospace;
  }
</style>
