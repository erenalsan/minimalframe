<script>
  // Border and text colours: quick picks, colours from the photo, auto contrast, and saved pairs.
  import { QUICK_BACKGROUNDS } from "../../lib/catalog.js";
  import { tint } from "../../lib/palette.js";

  let { frame = $bindable(), photoPalette } = $props();

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
    <p class="label">Border color</p>
    <div class="swatches">
      {#each QUICK_BACKGROUNDS as c (c)}
        <button class="swatch" style:background={c} aria-pressed={frame.backgroundColor.toLowerCase() === c} aria-label="Border color {c}" onclick={() => (frame.backgroundColor = c)}></button>
      {/each}
      <label class="swatch swatch-custom" title="Pick any color">
        <input type="color" bind:value={frame.backgroundColor} />
        <span class="sr-only">Custom border color</span>
      </label>
    </div>
  </div>
  {#if photoPalette?.length}
    <div>
      <p class="label">From this photo</p>
      <div class="swatches">
        {#each photoPalette.flatMap((c) => [tint(c), c]) as c (c)}
          <button class="swatch" style:background={c} aria-pressed={frame.backgroundColor.toLowerCase() === c} aria-label="Border color {c}" onclick={() => (frame.backgroundColor = c)}></button>
        {/each}
      </div>
    </div>
  {/if}
  <label class="switch">
    <input type="checkbox" role="switch" bind:checked={frame.autoContrast} />
    <span class="switch-track" aria-hidden="true"></span>
    Pick text color automatically
  </label>
  {#if !frame.autoContrast}
    <label class="color-row">
      <input type="color" bind:value={frame.textColor} />
      Text color <span class="hint">{frame.textColor}</span>
    </label>
  {/if}
  {#if palettes.length > 0}
    <div>
      <p class="label">Saved pairs</p>
      <div class="swatches">
        {#each palettes as pal, i (i)}
          <span class="pair">
            <button class="swatch" style:background={pal.bg} onclick={() => applyPalette(pal)} aria-label="Use saved pair {i + 1}">
              <span class="pair-dot" style:background={pal.text}></span>
            </button>
            <button class="mini-del" onclick={() => deletePalette(i)} aria-label="Delete saved pair {i + 1}">×</button>
          </span>
        {/each}
      </div>
    </div>
  {/if}
  <button class="btn ghost" onclick={savePalette}>Save this color pair</button>
</div>

<style>
  /* Colors */
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .swatch {
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 25%, transparent);
    display: grid;
    place-items: center;
  }
  .swatch[aria-pressed="true"] {
    outline: 2px solid var(--accent-ink);
    outline-offset: 3px;
  }
  .swatch-custom {
    cursor: pointer;
    background: conic-gradient(#ff5c8a, #ffb13e, #e6ff3e, #3effa8, #3eb8ff, #8a3eff, #ff5c8a);
    overflow: hidden;
  }
  .swatch-custom input {
    opacity: 0;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
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
  }
  .color-row input {
    width: 40px;
    height: 32px;
    border: 1px solid var(--glass-line);
    border-radius: 8px;
    background: none;
  }
</style>
