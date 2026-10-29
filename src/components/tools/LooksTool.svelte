<script>
  // Looks: built-in and saved looks, imported LUTs, matching another photo, and pasted Fujifilm recipes.
  import Dial from "../../lib/Dial.svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { DEV_DEFAULTS, freshDev, develop, cssFilterFor } from "../../lib/developEngine.js";
  import { LOOKS } from "../../lib/catalog.js";
  import { parseRecipe } from "../../lib/recipes.js";
  import { recipeFromPhoto } from "../../lib/fujiRecipe.js";
  import { imageStats, matchLook, autoTarget } from "../../lib/matchLook.js";
  import { lutLib, importLutFiles, deleteLut } from "../../lib/lutLibrary.svelte.js";

  let {
    dev = $bindable(),
    item = $bindable(), // the active photo
    filesList = $bindable(),
    selectedCount,
    canDevelop,
    userLooks,
    onsavelook, // (suggested name) → App opens the save dialog
    ondeletelook,
    onerror,
  } = $props();

  let recipeDialog = $state.raw(null);
  // shared text (openRecipe) opens the dialog as soon as the Looks tool is on screen
  $effect(() => {
    if (ui.open && recipeDialog) {
      ui.open = false;
      recipeDialog.showModal();
    }
  });
  function useRecipeText(text) {
    ui.recipeText = text;
    ui.recipeNote = "";
    ui.recipeApplied = false;
  }
  async function recipeFromFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await recipeFromPhoto(file);
    if (text) useRecipeText(text);
    else ui.recipeNote = t("No Fujifilm recipe found in this photo.");
  }

  // Copies (never shares) the look's nested curve and mixer, so later edits don't change the look itself.
  const applyLook = (l) => Object.assign(dev, freshDev(), JSON.parse(JSON.stringify(l.params)));

  // Copy the active photo's edits to every other selected photo.
  function applyEditsToSelected() {
    const src = $state.snapshot(dev);
    for (const f of filesList) if (f.selected && f !== item) Object.assign(f.dev, JSON.parse(JSON.stringify(src)));
  }

  // LUTs live in lutLibrary (loaded at startup); this tool imports, previews and removes them.
  async function importLuts(e) {
    const { ids, errors } = await importLutFiles(Array.from(e.target.files || []));
    e.target.value = "";
    if (ids.length) dev.lut = ids.at(-1);
    if (errors.length) onerror(errors.join(" "));
  }
  async function removeLut(id) {
    for (const f of filesList) if (f.dev.lut === id) f.dev.lut = "";
    await deleteLut(id);
  }

  // ─── Fujifilm recipes ──────────────────────────────────────────────────────
  function applyRecipe() {
    const r = parseRecipe(ui.recipeText);
    if (!r.sim && JSON.stringify(r.params) === JSON.stringify(freshDev())) {
      ui.recipeNote = t("No recipe settings found. Paste lines like “Film Simulation: Classic Chrome”, “Highlight: -1”.");
      ui.recipeApplied = false;
      return;
    }
    Object.assign(dev, r.params);
    ui.recipeName = r.name;
    ui.recipeNote = r.ignored.length
      ? t("Applied. Not available here: {settings}.", { settings: r.ignored.map((l) => l.split(":")[0]).join(", ") })
      : t("Applied.");
    ui.recipeApplied = true;
  }

  // ─── Match look ────────────────────────────────────────────────────────────
  // Makes photos look like one shoot: brightness, white balance, contrast and colour follow a reference photo.
  const pixels = (c) => c.getContext("2d").getImageData(0, 0, c.width, c.height).data;

  // ─── Auto ──────────────────────────────────────────────────────────────────
  // Brightness, contrast, white balance and colour worked out from this photo (see autoTarget), on top of no
  // other edits, like any look. Computed on the 160px proxy, so it's instant.
  function computeAuto(small, work) {
    const measure = (p) => imageStats(pixels(develop(small, p, work)));
    const params = matchLook(freshDev(), autoTarget(measure(freshDev())), measure);
    return { id: "auto", name: "Auto", params, thumb: develop(small, params, work).toDataURL("image/jpeg", 0.8) };
  }
  function matchItemTo(item, ref) {
    const work = document.createElement("canvas");
    const target = imageStats(pixels(develop(ref.small, ref.dev, work)));
    const next = matchLook($state.snapshot(item.dev), target, (p) => imageStats(pixels(develop(item.small, p, work))));
    Object.assign(item.dev, next);
  }
  function matchSelectedToActive() {
    for (const f of filesList) if (f.selected && f !== item) matchItemTo(f, item);
  }

  const allLooks = $derived([...LOOKS, ...userLooks]);
  // Deep compare: curve and mixer are nested.
  const isLookActive = (l) =>
    Object.keys(DEV_DEFAULTS).every(
      (k) => JSON.stringify(l.params[k] ?? DEV_DEFAULTS[k]) === JSON.stringify(dev[k] ?? DEV_DEFAULTS[k]),
    );

  // Thumbnails (looks, LUTs, Auto) come from the real develop engine on the active photo, so they match the
  // result. They're kept per photo, and rendered the first time only after the tray has finished opening,
  // so opening stays smooth.
  let lookThumbs = $state({});
  let lutThumbs = $state({});
  let autoLook = $state(null);
  $effect(() => {
    const small = item?.small;
    const looks = allLooks;
    const luts = lutLib.list;
    if (!small || !canDevelop) {
      lookThumbs = lutThumbs = {};
      autoLook = null;
      return;
    }
    if (!thumbCache.has(small)) thumbCache.set(small, new Map());
    const cache = thumbCache.get(small);
    const lutParams = (l) => ({ ...freshDev(), lut: l.id });
    // One thumbnail per task, so a first render never holds up a frame for long.
    let stop = false;
    const run = async (yieldBetween) => {
      const out = document.createElement("canvas");
      const thumb = async (p) => {
        const k = JSON.stringify(p);
        if (!cache.has(k)) {
          if (yieldBetween) await new Promise((r) => setTimeout(r));
          if (stop) return null;
          cache.set(k, develop(small, p, out).toDataURL("image/jpeg", 0.8));
        }
        return cache.get(k);
      };
      if (!cache.has("auto")) cache.set("auto", computeAuto(small, out));
      autoLook = cache.get("auto");
      // each thumbnail shows as soon as it's ready (the others keep their CSS-filter stand-in meanwhile)
      for (const l of looks) {
        const src = await thumb(l.params);
        if (stop) return;
        lookThumbs = { ...lookThumbs, [l.id]: src };
      }
      for (const l of luts) {
        const src = await thumb(lutParams(l));
        if (stop) return;
        lutThumbs = { ...lutThumbs, [l.id]: src };
      }
    };
    const cached = cache.has("auto") && [...looks.map((l) => l.params), ...luts.map(lutParams)].every((p) => cache.has(JSON.stringify(p)));
    if (cached) {
      run(false);
      return () => (stop = true);
    }
    autoLook = null;
    lookThumbs = lutThumbs = {}; // another photo's thumbnails must not linger
    const t = setTimeout(() => run(true), 360);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  });
</script>

<script module>
  // Survives switching tools, like the rest of the panel.
  const ui = $state({ recipeText: "", recipeNote: "", recipeName: "", recipeApplied: false, open: false });
  /** A recipe from elsewhere (shared text): fills the dialog and opens it when the Looks tool shows. */
  export function openRecipe(text) {
    Object.assign(ui, { recipeText: text, recipeNote: "", recipeApplied: false, open: true });
  }
  // Rendered thumbnails per photo (its 160px proxy) → { params JSON or "auto" → image }; gone with the photo.
  const thumbCache = new WeakMap();
</script>

<div class="looks fade-x">
  {#if canDevelop && item?.small}
    <div class="look-cell">
      <button class="look auto" aria-pressed={autoLook ? isLookActive(autoLook) : false} disabled={!autoLook} onclick={() => applyLook(autoLook)} title={t("Fixes brightness, contrast, white balance and colour for this photo")}>
        <img src={autoLook?.thumb ?? item.thumbUrl} alt="" />
        <span>{t("Auto")}</span>
      </button>
    </div>
  {/if}
  {#each allLooks as look (look.id)}
    <div class="look-cell">
      <button class="look" aria-pressed={isLookActive(look)} onclick={() => applyLook(look)}>
        {#if lookThumbs[look.id]}
          <img src={lookThumbs[look.id]} alt="" />
        {:else}
          <img src={item?.thumbUrl} alt="" style:filter={cssFilterFor(look.params)} />
        {/if}
        <span>{t(look.name)}</span>
      </button>
      {#if userLooks.includes(look)}
        <button class="mini-del" onclick={() => ondeletelook(look.id)} aria-label={t("Delete look {name}", { name: look.name })}>×</button>
      {/if}
    </div>
  {/each}
</div>
<div class="row-btns">
  <button class="btn ghost" onclick={() => recipeDialog.showModal()}>{t("Fujifilm recipe")}</button>
  <button class="btn ghost" onclick={() => onsavelook("")}>{t("Save as my look")}</button>
</div>
{#if selectedCount > 1}
  <button class="btn ghost" onclick={applyEditsToSelected}>{t("Apply these edits to the other {n} selected", { n: selectedCount - 1 })}</button>
{/if}

{#if canDevelop}
  <section class="sub">
    <p class="label">LUTs</p>
    <p class="hint">{t("Import .cube files from Lightroom, Resolve or your favourite creators.")}</p>
    <div class="looks fade-x">
      {#each lutLib.list as l (l.id)}
        <div class="look-cell">
          <button class="look" aria-pressed={dev.lut === l.id} onclick={() => (dev.lut = dev.lut === l.id ? "" : l.id)}>
            <img src={lutThumbs[l.id] ?? item?.thumbUrl} alt="" />
            <span>{l.name}</span>
          </button>
          <button class="mini-del" onclick={() => removeLut(l.id)} aria-label={t("Delete LUT {name}", { name: l.name })}>×</button>
        </div>
      {/each}
      <label class="look look-add">
        <input type="file" accept=".cube" multiple class="sr-only" onchange={importLuts} />
        <span aria-hidden="true">+</span><span>{t("Import .cube")}</span>
      </label>
    </div>
    {#if dev.lut}
      <Dial id="d-lut" label={t("LUT strength")} bind:value={dev.lutAmount} unit="%" reset={100} hint={t("Blend between your edit and the LUT. Applied on top of all other edits.")} />
    {/if}
  </section>

  {#if filesList.length > 1}
    <section class="sub">
      <p class="label">{t("Match look")}</p>
      <p class="hint">{t("Make this photo's brightness, white balance, contrast and colour follow another photo.")}</p>
      <div class="match-row">
        {#each filesList as f, i (f.id)}
          {#if f !== item}
            <button class="match-pick" onclick={() => matchItemTo(item, f)} aria-label={t("Match to {name}", { name: f.name })} title={t("Match to {name}", { name: f.name })}>
              <img src={f.thumbUrl} alt="" />
            </button>
          {/if}
        {/each}
      </div>
      {#if selectedCount > 1}
        <button class="btn ghost" onclick={matchSelectedToActive}>{t("Match the other {n} selected to this photo", { n: selectedCount - 1 })}</button>
      {/if}
    </section>
  {/if}
{/if}

<!-- Fujifilm recipe: its own small dialog, opened from the button above -->
<dialog class="sheet glass" bind:this={recipeDialog} aria-labelledby="recipe-title" onclick={(e) => e.target === recipeDialog && recipeDialog.close()}>
  <div class="sheet-in recipe">
    <div class="sheet-head">
      <h2 id="recipe-title">{t("Fujifilm recipe")}</h2>
      <button class="close" onclick={() => recipeDialog.close()} aria-label={t("Close")}>×</button>
    </div>
    <p class="hint" role="note">{t("Paste a recipe's settings, one per line. It becomes a look you can save.")}</p>
    <div class="row-btns">
      {#if item?.fujiRecipe}
        <button class="btn ghost" onclick={() => useRecipeText(item.fujiRecipe)}>{t("Use this photo's recipe")}</button>
      {/if}
      <label class="btn ghost">
        {t("From a Fujifilm photo…")}
        <input type="file" accept="image/jpeg,.jpg,.jpeg" class="sr-only" onchange={recipeFromFile} />
      </label>
    </div>
    <textarea
      class="text"
      rows="7"
      bind:value={ui.recipeText}
      placeholder={"Film Simulation: Classic Chrome\nDynamic Range: DR400\nHighlight: -1\nShadow: +1\nColor: +2\nWhite Balance: Daylight, +2 Red & -4 Blue\nGrain Effect: Weak, Small"}
      aria-label={t("Fujifilm recipe text")}
    ></textarea>
    <div class="row-btns">
      <button class="btn accent" onclick={applyRecipe} disabled={!ui.recipeText.trim()}>{t("Apply recipe")}</button>
      {#if ui.recipeApplied}
        <button class="btn ghost" onclick={() => (recipeDialog.close(), onsavelook(ui.recipeName))}>{t("Save as my look")}</button>
      {/if}
    </div>
    {#if ui.recipeNote}<p class="hint" role="status">{ui.recipeNote}</p>{/if}
    <p class="hint" role="note">{t("Film simulations are approximations of Fujifilm's in-camera looks.")}</p>
  </div>
</dialog>

<style>
  /* Looks */
  .looks {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px 10px;
  }
  .look {
    display: grid;
    gap: 6px;
    font-size: var(--fs-label);
    color: var(--muted);
  }
  .look img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 12px;
    outline: 2px solid transparent;
    outline-offset: 2px;
    transition: outline-color 150ms, scale 120ms;
  }
  /* pressed and hover: as every tile (ui.css, Touch and pointer feedback) */
  .look:active img {
    scale: 0.96;
  }
  @media (hover: hover) {
    .look:hover:not([aria-pressed="true"]) img {
      outline-color: color-mix(in srgb, var(--text) 30%, transparent);
    }
  }
  .look[aria-pressed="true"] {
    color: var(--text);
  }
  .look[aria-pressed="true"] img {
    outline-color: var(--accent-ink);
  }
  /* Auto stands out from the looks: an amber sparkle on its name */
  .look.auto span::before {
    content: "✦ ";
    color: var(--accent-ink, var(--accent));
  }
  .look-cell {
    position: relative;
  }
  .look-add {
    display: grid;
    place-content: center;
    gap: 2px;
    aspect-ratio: 1;
    border: 1px dashed color-mix(in srgb, var(--text) 30%, transparent);
    border-radius: 12px;
    color: var(--muted);
    font-size: var(--fs-label);
    text-align: center;
    cursor: pointer;
  }
  .look-add span:first-of-type {
    font-size: 1.5rem;
    line-height: 1;
  }
  .match-row {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .match-pick {
    flex: none;
    width: 56px;
    height: 56px;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid var(--glass-line);
  }
  .match-pick:hover {
    outline: 2px solid var(--accent-ink);
  }
  .match-pick img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .recipe {
    display: grid;
    gap: 12px;
  }
  .recipe textarea {
    width: 100%;
    resize: vertical;
    font: 0.85rem/1.45 ui-monospace, "Space Mono", monospace;
  }
  /* Compact tray (phones, portrait tablets): one swipeable row, so the photo keeps the screen. Same query as COMPACT in App.svelte. */
  @media (max-width: 599px), (max-width: 899px) and (min-height: 501px) {
    .looks {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      scrollbar-width: none;
      margin: 0 calc(-1 * var(--sp-3));
      padding: 2px var(--sp-3) 4px;
    }
    .looks > :global(*) {
      flex: 0 0 74px;
    }
  }
</style>
