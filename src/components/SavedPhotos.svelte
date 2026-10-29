<script>
  // The Android app's own little gallery: every photo MinimalFrame exported (the phone's MinimalFrame album),
  // newest first, to look at, share again or delete. GalleryPlugin.java does the reading.
  import { tick } from "svelte";
  import { Capacitor } from "@capacitor/core";
  import Icon from "./Icon.svelte";
  import { t, i18n } from "../lib/i18n.svelte.js";

  let { open = $bindable(false), Gallery, closeOnBack } = $props();

  let dialog = $state.raw(null);
  let items = $state.raw(null); // null while loading
  let thumbs = $state({}); // id → data URL, filled in a few at a time
  let viewing = $state(-1); // index of the photo shown full screen
  let asking = $state(false); // "Delete this photo?" is showing
  let busy = $state(false);
  let failed = $state("");

  async function load() {
    failed = "";
    try {
      items = (await Gallery.list()).items;
    } catch (err) {
      items = [];
      failed = t("Couldn't read your saved photos.");
      return;
    }
    // thumbnails one after another, so a long album doesn't flood the phone
    for (const it of items) {
      if (!open) return;
      if (thumbs[it.id]) continue;
      try {
        thumbs[it.id] = (await Gallery.thumb({ id: it.id })).src;
      } catch {}
    }
  }

  $effect(() => {
    if (!open || !dialog) return;
    dialog.showModal();
    load();
    return closeOnBack(() => (open = false));
  });
  $effect(() => {
    if (!open && dialog?.open) dialog.close();
  });
  const viewerOpen = $derived(viewing >= 0);
  $effect(() => {
    if (viewerOpen) return closeOnBack(hide);
  });

  // Today / Yesterday / 12 October: one heading per day
  const sections = $derived.by(() => {
    if (!items) return [];
    const day = (ms) => new Date(ms).toDateString();
    const today = day(Date.now());
    const yesterday = day(Date.now() - 86_400_000);
    const out = [];
    items.forEach((it, i) => {
      const d = day(it.date);
      const label =
        d === today ? t("Today") : d === yesterday ? t("Yesterday")
        : new Date(it.date).toLocaleDateString(i18n.lang, { day: "numeric", month: "long", year: new Date(it.date).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
      if (out.at(-1)?.label !== label) out.push({ label, list: [] });
      out.at(-1).list.push({ it, i });
    });
    return out;
  });

  const current = $derived(items?.[viewing]);

  // ── Motion ── the photos lie side by side on one strip that moves like a page under the finger: it can be
  // caught at any moment, pushed on or pulled back, and after letting go it carries the finger's speed into
  // a spring that settles on the nearest photo. Opening grows the thumbnail into the photo; closing shrinks
  // it back into its place. Everything is off for "reduce motion".
  const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
  const GAP = 24; // black space between neighbouring photos
  let viewer = $state.raw(null);
  let track = $state.raw(null);
  let pulling = $state(false); // a finger is moving the photos: the arrows step aside
  let near = $state(0); // the photo nearest the middle right now (which photos to keep ready)
  let leaving = false; // closing animation running
  // positions are in photos (2.5 = half way between the 3rd and 4th); the strip is painted straight to the
  // DOM every frame, so only crossing into another photo touches Svelte
  let pos = 0;
  let vel = 0; // photos per second
  let goal = 0;
  let raf = 0;
  let lastT = 0;
  const pitch = () => (track?.clientWidth ?? 0) + GAP;
  // the photos around both where the strip is and where it's heading, ready before they slide in
  const panels = $derived.by(() => {
    if (!current) return [];
    const out = [];
    for (let i = Math.max(0, Math.min(near, viewing) - 2); i <= Math.min(items.length - 1, Math.max(near, viewing) + 2); i++) out.push({ i, it: items[i] });
    return out;
  });
  const src = (it) => Capacitor.convertFileSrc(it.uri);
  const pic = () => viewer?.querySelector(".panel.cur .pic");

  function paint() {
    if (track) track.style.transform = `translate3d(${-pos * pitch()}px, 0, 0)`;
    const n = Math.round(pos);
    if (n !== near) near = n;
  }
  // a critically damped spring: the quickest settle with no wobble, starting at the finger's speed
  function run(t) {
    const dt = lastT ? Math.min(0.032, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    const k = 240;
    vel += (-k * (pos - goal) - 2 * Math.sqrt(k) * vel) * dt;
    pos += vel * dt;
    if (Math.abs(pos - goal) < 0.0004 && Math.abs(vel) < 0.02) {
      pos = goal;
      vel = 0;
      raf = 0;
      paint();
      return;
    }
    paint();
    raf = requestAnimationFrame(run);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    lastT = 0;
  }
  function glide() {
    if (still) {
      pos = goal;
      vel = 0;
      paint();
    } else if (!raf) {
      lastT = 0;
      raf = requestAnimationFrame(run);
    }
  }
  function goTo(i) {
    goal = Math.max(0, Math.min(items.length - 1, i));
    if (goal !== viewing) asking = false;
    viewing = goal; // the counter and arrows show where it's going at once
    glide();
  }
  // arrows and keys add up: three quick taps go three photos on
  const step = (dir) => goTo(goal + dir);
  // jump without motion (opening, after a delete)
  async function place(i) {
    stop();
    pos = goal = viewing = i;
    vel = 0;
    near = i;
    await tick();
    paint();
  }

  // the transform + clip that make the full photo sit exactly over a grid tile (a square crop of it)
  function over(tile, box) {
    const s = Math.max(tile.width / box.width, tile.height / box.height);
    const ix = Math.max(0, (box.width - tile.width / s) / 2);
    const iy = Math.max(0, (box.height - tile.height / s) / 2);
    const tx = tile.left + tile.width / 2 - (box.left + box.width / 2);
    const ty = tile.top + tile.height / 2 - (box.top + box.height / 2);
    return { transform: `translate(${tx}px, ${ty}px) scale(${s})`, clipPath: `inset(${iy}px ${ix}px)` };
  }
  const FULL = { transform: "none", clipPath: "inset(0px 0px)" };
  const chrome = () => viewer.querySelectorAll(".v-head, .v-bar, .nav:not(.off)");

  async function show(i, tileEl) {
    asking = false;
    await place(i);
    if (still) return;
    const el = pic();
    if (!el || !tileEl) return;
    el.animate([over(tileEl.getBoundingClientRect(), el.getBoundingClientRect()), FULL], { duration: 380, easing: EASE });
    viewer.querySelector(".backdrop").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: "ease-out" });
    for (const c of chrome()) c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 140, fill: "backwards" });
  }

  async function hide() {
    if (leaving || viewing < 0) return;
    drag = null;
    pulling = false;
    if (raf || pos !== goal) await place(goal); // closing mid-glide: land first
    if (!still) {
      leaving = true;
      const el = pic();
      const tileEl = dialog.querySelector(`.tile[data-id="${current.id}"]`);
      tileEl?.scrollIntoView({ block: "nearest" });
      const tile = tileEl?.getBoundingClientRect();
      const box = el?.getBoundingClientRect();
      const anims = [viewer.querySelector(".backdrop").animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: "ease-in", fill: "forwards" })];
      for (const c of chrome()) anims.push(c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" }));
      if (el && tile && tile.bottom > 0 && tile.top < innerHeight) anims.push(el.animate([FULL, over(tile, box)], { duration: 340, easing: EASE, fill: "forwards" }));
      else if (el) anims.push(el.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(0.92)" }], { duration: 220, easing: "ease-in", fill: "forwards" }));
      await Promise.all(anims.map((a) => a.finished)).catch(() => {});
      leaving = false;
    }
    viewing = -1;
    asking = false;
  }

  // the finger: catches the strip wherever it is; the direction is decided after a few pixels, and
  // vertical moves are left alone
  let drag = null;
  function down(e) {
    if (leaving || e.button > 0 || e.target.closest("button")) return;
    stop(); // caught mid-glide: it stays under the finger
    vel = 0;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: pos, heading: goal, axis: null, track: [[e.timeStamp, pos]] };
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const mx = e.clientX - drag.x;
    if (!drag.axis) {
      if (Math.hypot(mx, e.clientY - drag.y) < 8) return;
      drag.axis = Math.abs(mx) > Math.abs(e.clientY - drag.y) ? "x" : "y";
      if (drag.axis !== "x") return glide(); // a vertical move lets a caught glide carry on
      pulling = true;
      drag.x += Math.sign(mx) * 8; // only the dead zone is left out, never the move itself
    }
    if (drag.axis === "x") follow(e);
  }
  // the strip under the finger, and a record of where it was when, for the speed at release
  function follow(e) {
    const last = items.length - 1;
    const raw = drag.from - (e.clientX - drag.x) / pitch();
    // past the first or last photo the strip stretches, a third as far
    pos = raw < 0 ? raw / 3 : raw > last ? last + (raw - last) / 3 : raw;
    drag.track.push([e.timeStamp, pos]);
    if (drag.track.length > 6) drag.track.shift();
    const n = Math.round(Math.max(0, Math.min(last, pos)));
    if (n !== viewing) (viewing = n), (asking = false);
    paint();
  }
  function up(e) {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    // a fast flick may send only a move or two: where the finger lifts counts too
    if (d.axis === "x" && e.type === "pointerup") follow(e);
    drag = null;
    pulling = false;
    if (d.axis !== "x") return glide(); // a tap on a moving strip lets it land
    // speed over the last ~100 ms, always against an earlier point than the last
    const now = d.track.at(-1);
    let j = d.track.length - 1;
    while (j > 0 && now[0] - d.track[j - 1][0] <= 100) j--;
    const then = d.track[j === d.track.length - 1 ? Math.max(0, j - 1) : j];
    vel = now[0] > then[0] ? ((now[1] - then[1]) / (now[0] - then[0])) * 1000 : 0;
    // like turning pages: a flick turns one more from the page the motion was heading to (flicking again
    // while one still turns turns the next), a flick the other way goes back, and it never lands behind
    // the finger; a slow release settles on the nearest
    if (Math.abs(vel) <= 0.5) goTo(Math.round(pos));
    else goTo(vel > 0 ? Math.max(d.heading + 1, Math.ceil(pos)) : Math.min(d.heading - 1, Math.floor(pos)));
  }

  async function share() {
    try {
      await Gallery.share({ ids: [current.id] });
    } catch {
      failed = t("Couldn't share this photo.");
    }
  }

  async function remove() {
    busy = true;
    try {
      await Gallery.remove({ ids: [current.id] });
      // the photo shrinks away, then the next one eases into its place
      if (!still) await pic()?.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(0.9)" }], { duration: 220, easing: "ease-in", fill: "forwards" }).finished;
      const gone = current.id;
      asking = false;
      if (items.length === 1) {
        viewing = -1;
        items = [];
      } else {
        const at = Math.min(viewing, items.length - 2);
        items = items.filter((x) => x.id !== gone);
        await place(at);
        if (!still) pic()?.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: EASE });
      }
    } catch {
      failed = t("Couldn't delete this photo.");
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onresize={() => viewing >= 0 && paint()} />

<dialog bind:this={dialog} class="saved" aria-labelledby="saved-title" oncancel={(e) => (e.preventDefault(), (open = false))}>
  <div class="head">
    <button class="icon-btn" onclick={() => (open = false)} aria-label={t("Close")}><Icon name="close" /></button>
    <h2 id="saved-title" tabindex="-1" autofocus>{t("Saved photos")}</h2>
    {#if items?.length}<span class="count">{items.length}</span>{/if}
  </div>

  {#if failed}<p class="note warn" role="alert">{failed}</p>{/if}

  {#if items === null}
    <p class="note"><span class="spinner" aria-hidden="true"></span>{t("Loading…")}</p>
  {:else if !items.length && !failed}
    <div class="empty">
      <Icon name="gallery" />
      <p><strong>{t("Nothing saved yet")}</strong>{t("Photos you export appear here, and in your phone's gallery in the MinimalFrame album.")}</p>
    </div>
  {:else}
    <div class="scroll">
      {#each sections as s (s.label)}
        <h3>{s.label}</h3>
        <div class="grid">
          {#each s.list as { it, i } (it.id)}
            <button class="tile" class:lifted={i === viewing} data-id={it.id} onclick={(e) => show(i, e.currentTarget)} aria-label={t("Open {name}", { name: it.name })}>
              {#if thumbs[it.id]}<img src={thumbs[it.id]} alt="" />{/if}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  {#if current}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="viewer" bind:this={viewer} role="group" aria-label={current.name} onkeydown={(e) => (e.key === "ArrowLeft" ? step(-1) : e.key === "ArrowRight" && step(1))}>
      <div class="backdrop"></div>
      <div class="v-head">
        <button class="icon-btn" onclick={hide} aria-label={t("Back")}><Icon name="close" /></button>
        <span>{t("{n} of {total}", { n: viewing + 1, total: items.length })}</span>
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="v-photo" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
        <div class="track" bind:this={track}>
          {#each panels as { i, it } (it.id)}
            <div class="panel" class:cur={i === viewing} style:left="calc({i} * (100% + {GAP}px))" aria-hidden={i !== viewing}>
              <div class="pic" style:--ar="{it.width || 4} / {it.height || 5}">
                {#if thumbs[it.id]}<img class="lo" src={thumbs[it.id]} alt="" draggable="false" />{/if}
                <!-- full images only next to where the strip is: big exports, mid-range phones -->
                {#if Math.abs(i - near) <= 1 || i === viewing}<img class="hi" src={src(it)} alt={i === viewing ? it.name : ""} draggable="false" decoding="async" />{/if}
              </div>
            </div>
          {/each}
        </div>
        <button class="nav prev" class:off={viewing === 0} class:aside={pulling} disabled={viewing === 0} onclick={() => step(-1)} aria-label={t("Previous photo")}><Icon name="chev-left" /></button>
        <button class="nav next" class:off={viewing === items.length - 1} class:aside={pulling} disabled={viewing === items.length - 1} onclick={() => step(1)} aria-label={t("Next photo")}><Icon name="chev-right" /></button>
      </div>
      {#if asking}
        <div class="v-bar ask" role="alertdialog" aria-labelledby="del-q">
          <p id="del-q"><strong>{t("Delete this photo?")}</strong>{t("It's also removed from your phone's gallery.")}</p>
          <button class="btn ghost" onclick={() => (asking = false)} disabled={busy}>{t("Keep")}</button>
          <button class="btn danger" onclick={remove} disabled={busy}>{t("Delete")}</button>
        </div>
      {:else}
        <div class="v-bar">
          <button class="btn ghost" onclick={() => (asking = true)}><Icon name="trash" />{t("Delete")}</button>
          <button class="btn accent" onclick={share}><Icon name="share" />{t("Share")}</button>
        </div>
      {/if}
    </div>
  {/if}
</dialog>

<style>
  .saved {
    position: fixed;
    inset: 0;
    width: 100%;
    max-width: none;
    height: 100dvh;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: var(--bg);
    color: var(--text);
  }
  .saved[open] {
    display: flex;
    flex-direction: column;
    animation: rise 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .saved[open] {
      animation: none;
    }
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    padding: calc(var(--sp-1) + env(safe-area-inset-top)) var(--sp-3) var(--sp-1) var(--sp-1);
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }
  h2 {
    outline: none;
    font-size: 1.05rem;
    font-weight: 650;
  }
  .icon-btn {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text);
  }
  .icon-btn :global(svg) {
    width: 20px;
    height: 20px;
  }
  .count {
    min-width: 24px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--field);
    font-size: var(--fs-label);
    font-weight: 600;
    text-align: center;
  }
  .note {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    margin: var(--sp-3);
    color: var(--muted);
    font-size: var(--fs-label);
  }
  .note.warn {
    color: var(--warn);
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: var(--sp-2);
    margin: auto;
    padding: var(--sp-4);
    max-width: 320px;
    text-align: center;
    color: var(--muted);
  }
  .empty :global(svg) {
    width: 40px;
    height: 40px;
  }
  .empty p {
    display: grid;
    gap: 4px;
    font-size: var(--fs-label);
    line-height: 1.45;
  }
  .empty strong {
    color: var(--text);
    font-size: var(--fs-value);
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0 2px calc(var(--sp-3) + env(safe-area-inset-bottom));
  }
  h3 {
    padding: var(--sp-3) var(--sp-2) var(--sp-1);
    font-size: var(--fs-section);
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 2px;
  }
  .tile {
    aspect-ratio: 1;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: var(--field);
    overflow: hidden;
  }
  .tile.lifted {
    visibility: hidden;
  }
  .tile img {
    transition: scale 160ms ease-out;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    animation: fade-in 200ms ease-out;
  }
  .tile:active img {
    scale: 0.96;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  /* one photo, full screen, on black like any gallery */
  .viewer {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    color: #e5e7eb;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    background: #000;
  }
  .v-head,
  .v-bar {
    position: relative; /* above the backdrop */
  }
  .v-head {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    padding: calc(var(--sp-1) + env(safe-area-inset-top)) var(--sp-3) var(--sp-1) var(--sp-1);
    font-size: var(--fs-label);
  }
  .v-head .icon-btn {
    color: inherit;
  }
  .v-photo {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    touch-action: pan-y;
  }
  .track {
    position: absolute;
    inset: 0;
    will-change: transform;
  }
  .panel {
    position: absolute;
    top: 0;
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    container-type: size;
  }
  /* exactly the photo's shape, as large as fits: the box the open/close motion moves */
  .pic {
    position: relative;
    aspect-ratio: var(--ar);
    width: min(100cqw, 100cqh * (var(--ar)));
    will-change: transform;
  }
  .pic img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  /* quiet round buttons over the photo's edge: readable on white and on black photos alike */
  .nav {
    position: absolute;
    top: 50%;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    margin: 0 10px;
    border: 1px solid rgb(255 255 255 / 0.16);
    border-radius: 50%;
    background: rgb(18 18 18 / 0.55);
    color: #fff;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.25);
    translate: 0 -50%;
    transition: opacity 180ms ease-out, scale 120ms ease-out;
  }
  .nav :global(svg) {
    width: 20px;
    height: 20px;
  }
  .nav:active {
    scale: 0.92;
  }
  .nav.off,
  .nav.aside {
    opacity: 0;
    pointer-events: none;
  }
  .prev {
    left: 0;
  }
  .next {
    right: 0;
  }
  .v-bar {
    display: flex;
    gap: var(--sp-2);
    justify-content: center;
    padding: var(--sp-2) var(--sp-3) calc(var(--sp-3) + env(safe-area-inset-bottom));
  }
  .v-bar .btn {
    flex: 1;
    max-width: 200px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-1);
  }
  .v-bar .btn.ghost {
    color: #e5e7eb;
    border-color: rgb(229 231 235 / 0.25);
  }
  .v-bar :global(svg) {
    width: 18px;
    height: 18px;
  }
  .ask {
    flex-wrap: wrap;
  }
  .ask p {
    flex-basis: 100%;
    display: grid;
    gap: 2px;
    text-align: center;
    font-size: var(--fs-label);
    color: rgb(229 231 235 / 0.7);
  }
  .ask strong {
    color: #e5e7eb;
    font-size: var(--fs-value);
  }
  .btn.danger {
    background: #dc2626;
    border-color: #dc2626;
    color: #fff;
  }
</style>
