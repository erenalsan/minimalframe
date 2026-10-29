<script>
  // Ready-made and saved frame templates, plus backing up / importing your own templates and looks.
  // Film borders come first, with their few settings right under them once one is picked.
  import { BUILTIN_PRESETS, FILM_PRESETS, SYSTEM_FONTS, frameRatio } from "../../lib/catalog.js";
  import { getContrastingColor } from "../../lib/imageUtils.js";
  import { allFonts } from "../../lib/fontLibrary.svelte.js";
  import { t } from "../../lib/i18n.svelte.js";

  // index: the active photo's place in the list (its frame number counts up from the first photo's).
  let { frame = $bindable(), index = 0, userPresets, hasLooks, libraryMessage, onapply, ondelete, onsave, onexport, onimport } = $props();
  const INKS = [["Orange", "#f2a23c"], ["White", "#d9d6cc"], ["Yellow", "#ffd35a"]];
  const CARDS = [["White", "#f7f6f1"], ["Cream", "#efe4cc"], ["Black", "#1b1b1d"]];
  const film = $derived(frame.filmStyle);
</script>

<section>
<p class="label">{t("Film")}</p>
<div class="templates fade-x">
  {#each FILM_PRESETS as p (p.id)}
    <div class="template">
      <button onclick={() => onapply(p)} aria-pressed={film === p.filmStyle} aria-label={t("Apply template {name}", { name: t(p.name) })}>
        <span class="template-mini film-mini f-{p.filmStyle}" style:background={p.backgroundColor} style:aspect-ratio="4 / 5">
          <span class="obj"><span class="template-photo"></span></span>
        </span>
        <span class="template-name">{t(p.name)}</span>
      </button>
    </div>
  {/each}
</div>
</section>
{#if film && film !== "darkroom"}
  <div class="film-opts sub">
    {#if film === "35mm"}
      <label>
        <span class="label">{t("Film name")}</span>
        <input class="text" type="text" maxlength="24" bind:value={frame.filmName} />
      </label>
    {/if}
    {#if film === "35mm" || film === "slide"}
      <div class="stepper" role="group" aria-label={t("Frame number")}>
        <span class="label">{t("Frame number")}</span>
        <button onclick={() => (frame.filmFrame = Math.max(-index, frame.filmFrame - 1))} aria-label={t("Lower frame number")}>−</button>
        <output aria-live="polite">{frame.filmFrame + index}</output>
        <button onclick={() => (frame.filmFrame += 1)} aria-label={t("Raise frame number")}>+</button>
      </div>
    {/if}
    {#if film === "35mm"}
      <div class="swatches" role="group" aria-label={t("Print color")}>
        <span class="label">{t("Print color")}</span>
        {#each INKS as [name, color] (color)}
          <button class="swatch" style:background={color} aria-label={t(name)} aria-pressed={frame.filmInk === color} onclick={() => (frame.filmInk = color)}></button>
        {/each}
      </div>
      <label class="switch">
        <input type="checkbox" role="switch" bind:checked={frame.filmNeighbours} />
        <span class="switch-track" aria-hidden="true"></span>
        {t("Your other photos at the ends")}
      </label>
    {:else}
      <div class="seg" role="group" aria-label={film === "slide" ? t("Mount") : t("Card")}>
        {#each CARDS as [name, color] (color)}
          <button aria-pressed={frame.filmCard === color} onclick={() => (frame.filmCard = color)}>{t(name)}</button>
        {/each}
      </div>
    {/if}
    <label class="switch">
      <input type="checkbox" role="switch" bind:checked={frame.filmDate} />
      <span class="switch-track" aria-hidden="true"></span>
      {t("Date stamp")}
    </label>
  </div>
{/if}
<section>
<p class="label">{t("Classic")}</p>
<div class="templates fade-x">
  {#each [...BUILTIN_PRESETS, ...userPresets] as p (p.id)}
    {@const r = frameRatio(p)}
    {@const f = allFonts().find((x) => x.id === p.selectedFontId) || SYSTEM_FONTS[0]}
    <div class="template">
      <button onclick={() => onapply(p)} aria-label={t("Apply template {name}", { name: t(p.name) })}>
        <span
          class="template-mini"
          style:background={p.backgroundColor}
          style:color={getContrastingColor(p.backgroundColor)}
          style:aspect-ratio={r?.w ? `${r.w} / ${r.h}` : p.captionSpace > 16 ? "4 / 5" : "5 / 5.4"}
          style:padding="{Math.max(6, p.customMarginH)}%"
        >
          <span class="template-photo"></span>
          <span class="template-cap" style:font-family={f.css} style:text-align={p.textAlign}>{t("Aa Camera")}</span>
        </span>
        <span class="template-name">{t(p.name)}</span>
      </button>
      {#if userPresets.includes(p)}
        <button class="mini-del" onclick={(e) => ondelete(p.id, e)} aria-label={t("Delete template {name}", { name: p.name })}>×</button>
      {/if}
    </div>
  {/each}
</div>
</section>
<button class="btn ghost" onclick={onsave}>{t("Save current settings as a template")}</button>
<details class="more">
  <summary>{t("More")}</summary>
  <div class="row-btns">
  <button class="btn ghost" onclick={onexport} disabled={!userPresets.length && !hasLooks}>{t("Back up my templates and looks")}</button>
  <label class="btn ghost">
    {t("Import")}
    <input type="file" accept=".json,application/json" onchange={onimport} class="sr-only" />
  </label>
  </div>
</details>
{#if libraryMessage}<p class="hint" role="status">{libraryMessage}</p>{/if}

<style>
  /* Templates */
  .templates {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px 10px;
    align-items: end;
  }
  .template {
    position: relative;
  }
  .template > button:first-child {
    width: 100%;
    display: grid;
    gap: 6px;
    justify-items: center;
  }
  .template-mini {
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 7%;
    border-radius: 4px;
    box-shadow: 0 8px 18px -8px rgb(0 0 0 / 0.6);
    transition: scale 120ms, outline-color 150ms;
  }
  /* pressed and hover: as every tile (ui.css, Touch and pointer feedback) */
  .template > button:active .template-mini {
    scale: 0.96;
  }
  @media (hover: hover) {
    .template > button:hover:not([aria-pressed="true"]) .template-mini {
      outline: 2px solid color-mix(in srgb, var(--text) 30%, transparent);
      outline-offset: 2px;
    }
  }
  .template-photo {
    flex: 1;
    min-height: 30%;
    background: linear-gradient(160deg, #f6c177, #5b4a7a);
  }
  .template-cap {
    font-size: 0.6rem;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
  }
  .template-name {
    font-size: var(--fs-label);
    line-height: 1.25;
    text-align: center;
    color: var(--muted);
  }
  .template > button[aria-pressed="true"] .template-mini {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .template > button[aria-pressed="true"] .template-name {
    color: var(--text);
  }
  /* Film tiles: a tiny drawing of each border on its background */
  .film-mini {
    align-items: center;
    padding: 0;
    gap: 0;
  }
  .film-mini .obj {
    display: flex;
    box-sizing: border-box;
  }
  .film-mini .template-photo {
    min-height: 0;
    border-radius: 1px;
  }
  .f-35mm .obj {
    width: 100%;
    aspect-ratio: 46 / 35;
    padding: 15% 11%;
    /* sprocket holes: a row of light dashes along each edge */
    background:
      repeating-linear-gradient(90deg, #f2f1ed 0 3px, transparent 3px 6px) 1px 3px / 100% 3px no-repeat,
      repeating-linear-gradient(90deg, #f2f1ed 0 3px, transparent 3px 6px) 1px calc(100% - 3px) / 100% 3px no-repeat,
      #0b0b0c;
  }
  .f-instant .obj {
    width: 66%;
    aspect-ratio: 54 / 86;
    padding: 9% 7% 30%;
    background: #f7f6f1;
    border-radius: 2px;
    box-shadow: 0 2px 5px rgb(0 0 0 / 0.25);
  }
  .f-darkroom .obj {
    width: 84%;
    aspect-ratio: 3 / 2.15;
    padding: 4%;
    background: #101011;
    border-radius: 1px;
  }
  .f-slide .obj {
    width: 80%;
    aspect-ratio: 1;
    padding: 24% 15%;
    background: #f3f1ea;
    border-radius: 4px;
    box-shadow: 0 2px 5px rgb(0 0 0 / 0.25);
  }
  .film-opts {
    gap: 14px;
  }
  .swatches {
    flex-wrap: nowrap;
  }
  .swatches .label {
    margin: 0 auto 0 0;
  }
  /* Compact tray (phones, portrait tablets): one swipeable row, so the photo keeps the screen. Same query as COMPACT in App.svelte. */
  @media (max-width: 899px) and (min-height: 501px) {
    .templates {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      scrollbar-width: none;
      margin: 0 calc(-1 * var(--sp-3));
      padding: 4px var(--sp-3);
    }
    .template {
      flex: 0 0 84px;
    }
  }
</style>
