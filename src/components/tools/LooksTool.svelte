<script>
  // Looks: built-in and saved looks, imported LUTs, matching another photo, and pasted Fujifilm recipes.
  import Dial from "../../lib/Dial.svelte";
  import { DEV_DEFAULTS, freshDev, develop, cssFilterFor } from "../../lib/developEngine.js";
  import { LOOKS } from "../../lib/catalog.js";
  import { parseRecipe } from "../../lib/recipes.js";
  import { imageStats, matchLook } from "../../lib/matchLook.js";
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

  function resetColorAdjustments() {
    Object.assign(dev, freshDev());
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
  // Per-LUT previews of the active photo, rendered by the real engine.
  let lutThumbs = $state({});
  $effect(() => {
    const small = item?.small;
    const list = lutLib.list;
    if (!small || !canDevelop) return;
    const out = document.createElement("canvas");
    lutThumbs = Object.fromEntries(list.map((l) => [l.id, develop(small, { ...freshDev(), lut: l.id }, out).toDataURL("image/jpeg", 0.8)]));
  });

  // ─── Fujifilm recipes ──────────────────────────────────────────────────────
  function applyRecipe() {
    const r = parseRecipe(ui.recipeText);
    if (!r.sim && JSON.stringify(r.params) === JSON.stringify(freshDev())) {
      ui.recipeNote = "No recipe settings found. Paste lines like “Film Simulation: Classic Chrome”, “Highlight: -1”.";
      return;
    }
    Object.assign(dev, r.params);
    ui.recipeName = r.name;
    ui.recipeNote = r.ignored.length ? `Applied. Not available here: ${r.ignored.map((l) => l.split(":")[0]).join(", ")}.` : "Applied.";
  }

  // ─── Match look ────────────────────────────────────────────────────────────
  // Makes photos look like one shoot: brightness, white balance, contrast and colour follow a reference photo.
  const pixels = (c) => c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
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

  // Look thumbnails rendered by the real develop engine from the active photo, so they match the result.
  let lookThumbs = $state({});
  $effect(() => {
    const small = item?.small;
    const looks = allLooks;
    if (!small || !canDevelop) {
      lookThumbs = {};
      return;
    }
    const out = document.createElement("canvas");
    lookThumbs = Object.fromEntries(looks.map((l) => [l.id, develop(small, l.params, out).toDataURL("image/jpeg", 0.8)]));
  });
</script>

<script module>
  // Survives switching tools, like the rest of the panel.
  const ui = $state({ recipeText: "", recipeNote: "", recipeName: "" });
</script>

<div class="looks">
  {#each allLooks as look (look.id)}
    <div class="look-cell">
      <button class="look" aria-pressed={isLookActive(look)} onclick={() => applyLook(look)}>
        {#if lookThumbs[look.id]}
          <img src={lookThumbs[look.id]} alt="" />
        {:else}
          <img src={item?.thumbUrl} alt="" style:filter={cssFilterFor(look.params)} />
        {/if}
        <span>{look.name}</span>
      </button>
      {#if userLooks.includes(look)}
        <button class="mini-del" onclick={() => ondeletelook(look.id)} aria-label="Delete look {look.name}">×</button>
      {/if}
    </div>
  {/each}
</div>
<div class="row-btns">
  <button class="btn ghost" onclick={() => onsavelook("")}>Save as my look</button>
  <button class="btn ghost" onclick={resetColorAdjustments}>Reset all edits</button>
</div>
{#if selectedCount > 1}
  <button class="btn ghost" onclick={applyEditsToSelected}>Apply these edits to the other {selectedCount - 1} selected</button>
{/if}

{#if canDevelop}
  <section class="sub">
    <p class="label">LUTs</p>
    <p class="hint">Import .cube files from Lightroom, Resolve or your favourite creators.</p>
    <div class="looks">
      {#each lutLib.list as l (l.id)}
        <div class="look-cell">
          <button class="look" aria-pressed={dev.lut === l.id} onclick={() => (dev.lut = dev.lut === l.id ? "" : l.id)}>
            <img src={lutThumbs[l.id] ?? item?.thumbUrl} alt="" />
            <span>{l.name}</span>
          </button>
          <button class="mini-del" onclick={() => removeLut(l.id)} aria-label="Delete LUT {l.name}">×</button>
        </div>
      {/each}
      <label class="look look-add">
        <input type="file" accept=".cube" multiple class="sr-only" onchange={importLuts} />
        <span aria-hidden="true">+</span><span>Import .cube</span>
      </label>
    </div>
    {#if dev.lut}
      <Dial id="d-lut" label="LUT strength" bind:value={dev.lutAmount} unit="%" reset={100} hint="Blend between your edit and the LUT. Applied on top of all other edits." />
    {/if}
  </section>

  {#if filesList.length > 1}
    <section class="sub">
      <p class="label">Match look</p>
      <p class="hint">Make this photo's brightness, white balance, contrast and colour follow another photo.</p>
      <div class="match-row">
        {#each filesList as f, i (f.id)}
          {#if f !== item}
            <button class="match-pick" onclick={() => matchItemTo(item, f)} aria-label="Match to {f.name}" title="Match to {f.name}">
              <img src={f.thumbUrl} alt="" />
            </button>
          {/if}
        {/each}
      </div>
      {#if selectedCount > 1}
        <button class="btn ghost" onclick={matchSelectedToActive}>Match the other {selectedCount - 1} selected to this photo</button>
      {/if}
    </section>
  {/if}
{/if}

<details class="sub recipe">
  <summary class="label">Paste a Fujifilm recipe</summary>
  <textarea
    class="text"
    rows="7"
    bind:value={ui.recipeText}
    placeholder={"Film Simulation: Classic Chrome\nDynamic Range: DR400\nHighlight: -1\nShadow: +1\nColor: +2\nWhite Balance: Daylight, +2 Red & -4 Blue\nGrain Effect: Weak, Small"}
    aria-label="Fujifilm recipe text"
  ></textarea>
  <div class="row-btns">
    <button class="btn accent" onclick={applyRecipe} disabled={!ui.recipeText.trim()}>Apply recipe</button>
    {#if ui.recipeNote.startsWith("Applied")}
      <button class="btn ghost" onclick={() => onsavelook(ui.recipeName)}>Save as my look</button>
    {/if}
  </div>
  {#if ui.recipeNote}<p class="hint" role="status">{ui.recipeNote}</p>{/if}
  <p class="hint">Film simulations are approximations of Fujifilm's in-camera looks.</p>
</details>

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
    font-size: 0.8rem;
    color: var(--muted);
  }
  .look img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 12px;
    outline: 2px solid transparent;
    outline-offset: 2px;
    transition: outline-color 150ms;
  }
  .look[aria-pressed="true"] {
    color: var(--text);
  }
  .look[aria-pressed="true"] img {
    outline-color: var(--accent-ink);
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
    font-size: 0.78rem;
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
  .recipe summary {
    cursor: pointer;
  }
  .recipe textarea {
    width: 100%;
    resize: vertical;
    font: 0.85rem/1.45 ui-monospace, "Space Mono", monospace;
  }
  /* Compact tray (phones, portrait tablets): one swipeable row, so the photo keeps the screen. Same query as COMPACT in App.svelte. */
  @media (max-width: 899px) and (min-height: 501px) {
    .looks {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      scrollbar-width: none;
      margin: 0 -14px;
      padding: 2px 14px 4px;
    }
    .looks > :global(*) {
      flex: 0 0 74px;
    }
  }
</style>
