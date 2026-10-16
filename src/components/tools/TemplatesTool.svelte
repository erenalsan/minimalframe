<script>
  // Ready-made and saved frame templates, plus backing up / importing your own templates and looks.
  import { BUILTIN_PRESETS, RATIOS, SYSTEM_FONTS } from "../../lib/catalog.js";
  import { getContrastingColor } from "../../lib/imageUtils.js";
  import { allFonts } from "../../lib/fontLibrary.svelte.js";

  let { userPresets, hasLooks, libraryMessage, onapply, ondelete, onsave, onexport, onimport } = $props();
</script>

<div class="templates">
  {#each [...BUILTIN_PRESETS, ...userPresets] as p (p.id)}
    {@const r = RATIOS.find((x) => x.id === p.selectedRatioId)}
    {@const f = allFonts().find((x) => x.id === p.selectedFontId) || SYSTEM_FONTS[0]}
    <div class="template">
      <button onclick={() => onapply(p)} aria-label="Apply template {p.name}">
        <span
          class="template-mini"
          style:background={p.backgroundColor}
          style:color={getContrastingColor(p.backgroundColor)}
          style:aspect-ratio={r?.w ? `${r.w} / ${r.h}` : p.captionSpace > 16 ? "4 / 5" : "5 / 5.4"}
          style:padding="{Math.max(6, p.customMarginH)}%"
        >
          <span class="template-photo"></span>
          <span class="template-cap" style:font-family={f.css} style:text-align={p.textAlign}>Aa Camera</span>
        </span>
        <span class="template-name">{p.name}</span>
      </button>
      {#if userPresets.includes(p)}
        <button class="mini-del" onclick={(e) => ondelete(p.id, e)} aria-label="Delete template {p.name}">×</button>
      {/if}
    </div>
  {/each}
</div>
<button class="btn ghost" onclick={onsave}>Save current settings as a template</button>
<div class="row-btns">
  <button class="btn ghost" onclick={onexport} disabled={!userPresets.length && !hasLooks}>Back up my templates and looks</button>
  <label class="btn ghost">
    Import
    <input type="file" accept=".json,application/json" onchange={onimport} class="sr-only" />
  </label>
</div>
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
    transition: transform 150ms;
  }
  .template > button:hover .template-mini {
    transform: translateY(-2px);
  }
  .template-photo {
    flex: 1;
    min-height: 30%;
    background: linear-gradient(160deg, hsl(var(--hue) 60% 70%), hsl(calc(var(--hue) + 40) 40% 30%));
  }
  .template-cap {
    font-size: 0.6rem;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
  }
  .template-name {
    font-size: 0.8rem;
    color: var(--muted);
  }
  /* Compact tray (phones, portrait tablets): one swipeable row, so the photo keeps the screen. Same query as COMPACT in App.svelte. */
  @media (max-width: 899px) and (min-height: 501px) {
    .templates {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      scrollbar-width: none;
      margin: 0 -14px;
      padding: 4px 14px;
    }
    .template {
      flex: 0 0 84px;
    }
  }
</style>
