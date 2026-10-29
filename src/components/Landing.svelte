<script>
  // First screen, before any photo is open. The hero is a pile of real prints from one photo (the app's own
  // output) that deals itself out and then turns over, one frame after another, so the app is seen working
  // before anything is tapped; tapping the pile starts with the frame on top. Below, the contact sheet of
  // every frame. Tapping a print opens your photo in that frame.
  import { BUILTIN_PRESETS, FILM_PRESETS } from "../lib/catalog.js";

  // bare: just the print well, standing in for the photo on the workbench once every photo has been removed.
  import Icon from "./Icon.svelte";
  import { t } from "../lib/i18n.svelte.js";
  import LanguagePicker from "./LanguagePicker.svelte";
  // langInWell: phones, where the top bar has no room for the language button.
  let { bare = false, langInWell = false, isLoading, loadingStatus, isDragging, onchoose, onsample, onpick, onsaved } = $props();

  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches; // no dragging files on phones
  const isApp = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
  const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const preset = (id) => [...FILM_PRESETS, ...BUILTIN_PRESETS].find((p) => p.id === `preset_${id}`);
  // Images in /landing are the app's own output (the sample photo, one look per print).
  const PRINTS = [
    { img: "brandbar", w: 560, h: 764, label: "Brand bar", alt: "Photo above a white bar with the camera logo and settings", preset: preset("brandbar") },
    { img: "museum", w: 560, h: 700, label: "Museum mat", alt: "Photo in a wide cream mat", preset: preset("museum") },
    { img: "film35", w: 560, h: 700, label: "35 mm", alt: "Photo in a 35 mm film strip with sprocket holes and edge print", preset: preset("film35") },
    { img: "spread", w: 560, h: 700, label: "Spread", alt: "Photo with its caption spread across the bottom", preset: preset("spread") },
    { img: "instant", w: 560, h: 700, label: "Instant", alt: "Photo as an instant print with a handwritten line", preset: preset("instant") },
    { img: "midnight", w: 560, h: 700, label: "Midnight", alt: "Photo on a near-black border", preset: preset("midnight") },
    { img: "carousel", w: 864, h: 360, label: "Carousel · 3 slides", alt: "A wide photo split into three slides", wide: true,
      preset: { selectedRatioId: "carousel", slides: 3, slideShape: "4:5" } },
  ];

  // ── The pile ── order[0] is on top. Each frame stays on top while its progress bar fills, then is tossed
  // aside (left and right in turn) and slips under the pile. A mouse resting on it holds it still.
  const PILE = PRINTS.filter((p) => !p.wide);
  const DEAL = 1300; // the prints are dealt onto the pile first
  let order = $state(PILE.map((_, i) => i));
  let tossing = $state(false);
  let tossDir = $state(1);
  let turns = $state(0);
  let dealt = $state(still);
  let resting = $state(false);
  const top = $derived(order[0]);
  $effect(() => {
    if (bare || still) return;
    const timer = setTimeout(() => (dealt = true), DEAL);
    return () => clearTimeout(timer);
  });
  // the progress bar's end turns the pile, so pausing it (mouse resting, page hidden) pauses both
  function toss() {
    tossing = true;
    setTimeout(() => {
      order = [...order.slice(1), order[0]];
      tossing = false;
      tossDir = -tossDir;
      turns++;
    }, 460);
  }
  const num = (p) => String(PRINTS.indexOf(p) + 1).padStart(2, "0");

  // contact-sheet prints come in as they scroll into view, as if dropped on a table and straightened
  function reveal(node, i) {
    if (still || typeof IntersectionObserver === "undefined") return node.classList.add("in");
    node.style.setProperty("--tilt", `${(i % 2 ? 1 : -1) * (1.5 + (i % 3))}deg`);
    node.style.transitionDelay = `${(i % 4) * 70}ms`;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (node.classList.add("in"), io.disconnect()), { threshold: 0.15 });
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }
</script>

{#snippet well()}
  <div class="well" class:over={isDragging}>
    <span class="mark tl"></span><span class="mark tr"></span><span class="mark bl"></span><span class="mark br"></span>
    {#if bare}<button class="plus" onclick={onchoose} disabled={isLoading} tabindex="-1" aria-hidden="true"><Icon name="add" /></button>{/if}
    {#if !touch || isDragging}<p class="well-title">{isDragging ? t("Drop to open") : t("Drop photos here")}</p>{/if}
    <button class="ink" onclick={onchoose} disabled={isLoading}>
      {#if isLoading}<span class="spinner" aria-hidden="true"></span>{loadingStatus || t("Opening…")}{:else}{t("Open photos")}{/if}
    </button>
    {#if onsaved}<button class="link saved-link" onclick={onsaved}><Icon name="gallery" />{t("Your saved photos")}</button>{/if}
    <p class="mono">JPEG · PNG · HEIC · RAW</p>
    {#if bare && langInWell}<LanguagePicker inline />{/if}
  </div>
{/snippet}

{#if bare}
  <div class="bare">{@render well()}</div>
{:else}
{@const words = t("Frame your photos for the feed.").split(" ")}
<div class="contact">
  <section class="hero">
    <h1>
      {#each words as w, i (i + w)}<span class="w" class:last={i === words.length - 1} style:--i={i}>{w}</span>{" "}{/each}
    </h1>

    <div class="pile-col">
      <button
        class="pile"
        class:over={isDragging}
        class:resting
        onclick={() => onpick(PILE[top].preset)}
        onpointerenter={(e) => e.pointerType === "mouse" && (resting = true)}
        onpointerleave={() => (resting = false)}
        disabled={isLoading}
        aria-label={t("Start with {name}", { name: t(PILE[top].label) })}
      >
        <span class="mark tl"></span><span class="mark tr"></span><span class="mark bl"></span><span class="mark br"></span>
        {#each PILE as p, i (p.img)}
          {@const r = order.indexOf(i)}
          <span class="slot" data-r={Math.min(r, 3)} style:z-index={10 - r}>
            <span class="card" class:dealing={!dealt} class:toss={tossing && r === 0} style:--deal="{(PILE.length - 1 - i) * 90 + 220}ms" style:--tilt={i % 2 ? 9 : -9} style:--dir={tossDir}>
              <img src="/landing/{p.img}.webp" width={p.w} height={p.h} alt="" decoding="async" />
            </span>
          </span>
        {/each}
      </button>
      <div class="pile-foot">
        <p class="mono now">{#key top}<span class="now-in">{num(PILE[top])} · {t(PILE[top].label)}</span>{/key}</p>
        {#if !still}
          <div class="segs" class:resting aria-hidden="true">
            {#each PILE as _, i}
              <span class="tick">{#if i === top}<i class="fill" style:animation-delay={turns === 0 ? `${DEAL}ms` : "0ms"} onanimationend={toss}></i>{/if}</span>
            {/each}
          </div>
        {/if}
        {#if !touch}<p class="mono drop-hint" class:on={isDragging}>{isDragging ? t("Drop to open") : t("Drop photos here")}</p>{/if}
      </div>
    </div>

    <div class="cta rise" style:--d="380ms">
      <button class="btn accent big open" onclick={onchoose} disabled={isLoading}>
        {#if isLoading}<span class="spinner" aria-hidden="true"></span>{loadingStatus || t("Opening…")}{:else}<Icon name="add" />{t("Open photos")}{/if}
      </button>
      <button class="link sample" onclick={onsample} disabled={isLoading}>{t("or try the sample")}</button>
      {#if onsaved}<button class="link saved-link" onclick={onsaved}><Icon name="gallery" />{t("Your saved photos")}</button>{/if}
    </div>

    <p class="lead rise" style:--d="520ms">{t("Borders, captions with your camera details, and carousels, plus film looks if you want to edit. Pick a frame below, or start with a plain photo.")}</p>

    <ol class="steps rise" style:--d="640ms" aria-label={t("How it works")}>
      <li style:--i="0"><span class="num">01</span>{t("Open a photo")}</li>
      <li style:--i="1"><span class="num">02</span>{t("Pick a frame")}</li>
      <li style:--i="2"><span class="num">03</span>{t("Save or share")}</li>
    </ol>

    <p class="mono note rise" style:--d="760ms">JPEG · PNG · HEIC · RAW<br />{isApp ? t("Works offline · nothing uploaded") : t("Runs in your browser · works offline · nothing uploaded")}</p>
  </section>

  <div class="rule mono"><span>{t("One photo, seven frames")}</span><span>{t("Tap a print to start with it")}</span></div>

  <div class="grid">
    {#each PRINTS as p, i (p.img)}
      <button class="print" class:wide={p.wide} use:reveal={i} onclick={() => onpick(p.preset)} disabled={isLoading} aria-label={t("Start with {name}", { name: t(p.label) })}>
        <span class="mono">{num(p)} {t(p.label)}</span>
        <img src="/landing/{p.img}.webp" width={p.w} height={p.h} alt={t(p.alt)} loading="lazy" decoding="async" />
      </button>
    {/each}
  </div>

  <footer class="mono">
    <span>{t("Brand logos & EXIF captions")}</span>
    <span>{t("Film looks · LUTs · recipes")}</span>
    <span>{t("Batch export")}</span>
    <span>{t("Location removed on export")}</span>
  </footer>
</div>
{/if}

<style>
  .contact {
    position: absolute;
    inset: 0;
    overflow: hidden auto; /* a tossed print may fly past the edge: never a sideways scroll */
    padding: 32px clamp(16px, 4vw, 48px) 56px;
    background: var(--bg);
  }
  .contact > * {
    max-width: 1180px;
    margin-inline: auto;
  }
  .mono {
    font-family: "Space Mono", ui-monospace, monospace;
    font-size: 0.74rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }

  /* ── Hero: words and buttons on the left, the pile on the right (stacked on phones) ── */
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
    grid-template-rows: 1fr auto auto auto auto auto 1fr;
    grid-template-areas: ". pile" "title pile" "cta pile" "lead pile" "steps pile" "note pile" ". pile";
    column-gap: 64px;
    row-gap: 22px;
    min-height: min(calc(100svh - 120px), 760px); /* the first screen is the hero; the contact sheet waits below */
    padding-bottom: 48px;
  }
  h1 {
    grid-area: title;
    font-weight: 750;
    font-stretch: 118%;
    font-size: clamp(2.2rem, 5.2vw, 4.4rem);
    line-height: 0.98;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }
  .w {
    display: inline-block;
  }
  /* the last word gets an amber stroke, drawn after the words have risen */
  .w.last {
    position: relative;
  }
  .w.last::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -0.06em;
    height: 0.1em;
    border-radius: 0.05em;
    background: var(--accent);
    transform-origin: left;
  }
  .cta {
    grid-area: cta;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
  }
  .open {
    position: relative;
    min-height: 52px;
    padding-inline: 26px 30px;
    box-shadow: 0 6px 20px -8px color-mix(in srgb, var(--accent) 70%, transparent);
  }
  .open :global(svg) {
    width: 20px;
    height: 20px;
  }
  .lead {
    grid-area: lead;
    max-width: 46ch;
    font-size: 1.05rem;
    line-height: 1.55;
    color: var(--muted);
    text-wrap: pretty;
  }
  .note {
    grid-area: note;
    line-height: 1.8;
  }

  /* 1 → 2 → 3: an amber line runs across the steps once, the app's promise of speed */
  .steps {
    grid-area: steps;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    max-width: 520px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }
  .steps li {
    position: relative;
    display: grid;
    gap: 4px;
    padding-top: 12px;
    border-top: 2px solid var(--line);
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1.3;
  }
  .steps li::before {
    content: "";
    position: absolute;
    top: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent);
    transform-origin: left;
  }
  .num {
    font-family: "Space Mono", ui-monospace, monospace;
    font-size: 0.72rem;
    font-weight: 400;
    color: var(--accent);
  }

  /* ── The pile ── */
  .pile-col {
    grid-area: pile;
    align-self: center;
    justify-self: center;
    display: grid;
    justify-items: center;
    gap: 14px;
    width: 100%;
  }
  .pile {
    position: relative;
    width: min(100%, 440px, calc((100svh - 160px) * 0.8));
    aspect-ratio: 4 / 5;
    padding: 0;
    transition: transform 200ms;
  }
  .pile.over {
    transform: scale(1.02);
  }
  .pile:disabled {
    opacity: 1;
  }
  .slot {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    transition:
      transform 460ms cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 460ms ease-out;
  }
  .slot[data-r="0"] {
    transform: rotate(-1.2deg);
  }
  .slot[data-r="1"] {
    transform: translate(4%, 1.5%) rotate(3.5deg);
  }
  .slot[data-r="2"] {
    transform: translate(-4%, 2.5%) rotate(-5deg);
  }
  /* under the pile: out of sight at once, so a tossed print never drifts back across the others */
  .slot[data-r="3"] {
    transform: translate(0, 3%) rotate(1deg) scale(0.96);
    opacity: 0;
    transition: none;
  }
  .card {
    display: block;
    width: 76%;
  }
  .card img {
    display: block;
    width: 100%;
    height: auto;
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.16),
      0 18px 40px -16px rgb(0 0 0 / 0.45);
  }
  .pile:hover:not(:disabled) .slot[data-r="0"] .card {
    transform: translateY(-6px);
    transition: transform 200ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .pile .mark {
    width: 26px;
    height: 26px;
    border-color: var(--text);
    z-index: 20;
  }
  .pile .tl, .pile .tr { top: 0; }
  .pile .bl, .pile .br { bottom: 0; }
  .pile .tl, .pile .bl { left: 0; }
  .pile .tr, .pile .br { right: 0; }

  .pile-foot {
    display: grid;
    justify-items: center;
    gap: 10px;
    width: min(100%, 300px);
  }
  .now {
    color: var(--text);
    min-height: 1.3em;
  }
  .now-in {
    display: inline-block;
  }
  .segs {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 5px;
    width: 100%;
  }
  .tick {
    height: 3px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left;
    animation: fill 2600ms linear both;
  }
  .segs.resting .fill {
    animation-play-state: paused;
  }
  .drop-hint.on {
    color: var(--text);
  }

  /* ── Motion: only transform and opacity, all of it off for "reduce motion" ── */
  @media (prefers-reduced-motion: no-preference) {
    .w {
      animation: word 760ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      animation-delay: calc(var(--i) * 55ms + 60ms);
    }
    .w.last::after {
      animation: stroke 620ms cubic-bezier(0.6, 0, 0.2, 1) both;
      animation-delay: 820ms;
    }
    .rise {
      animation: rise 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      animation-delay: var(--d);
    }
    .steps li::before {
      animation: stroke 420ms cubic-bezier(0.6, 0, 0.2, 1) both;
      animation-delay: calc(1100ms + var(--i) * 260ms);
    }
    /* the start button glows once, as the steps finish */
    .open::after {
      content: "";
      position: absolute;
      inset: -4px;
      border-radius: inherit;
      border: 2px solid var(--accent);
      opacity: 0;
      animation: ring 1100ms ease-out 1900ms;
      pointer-events: none;
    }
    .pile .mark {
      animation: corner 640ms cubic-bezier(0.2, 0.8, 0.2, 1) 120ms both;
    }
    .pile .tl { transform-origin: top left; }
    .pile .tr { transform-origin: top right; }
    .pile .bl { transform-origin: bottom left; }
    .pile .br { transform-origin: bottom right; }
    .card.dealing {
      animation: deal 640ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      animation-delay: var(--deal);
    }
    .card.toss {
      animation: toss 460ms cubic-bezier(0.5, 0, 0.75, 0.4) forwards;
    }
    .now-in {
      animation: rise 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .pile-foot {
      animation: rise 600ms ease-out 900ms both;
    }
    .print {
      opacity: 0;
      transform: translateY(28px) rotate(var(--tilt, 0deg));
      transition:
        opacity 600ms ease-out,
        transform 760ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .print:global(.in) {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes word {
    from {
      opacity: 0;
      transform: translateY(0.45em);
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
  }
  @keyframes stroke {
    from {
      transform: scaleX(0);
    }
  }
  @keyframes ring {
    0% {
      opacity: 0.9;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1.12, 1.35);
    }
  }
  @keyframes corner {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
  }
  @keyframes deal {
    from {
      opacity: 0;
      transform: translateY(-34%) rotate(calc(var(--tilt) * 1deg)) scale(1.08);
    }
  }
  @keyframes toss {
    to {
      opacity: 0;
      transform: translate(calc(var(--dir) * 118%), -7%) rotate(calc(var(--dir) * 16deg));
    }
  }
  @keyframes fill {
    from {
      transform: scaleX(0);
    }
  }

  .bare {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    container-type: size;
    padding: clamp(16px, 4vh, 40px);
  }
  /* Sized like a feed print, in the photo's place. */
  .bare .well {
    width: min(100cqw, 80cqh, 512px); /* the largest 4:5 that fits the stage */
    aspect-ratio: 4 / 5;
    min-height: 0;
    border: 1.5px dashed color-mix(in srgb, var(--text) 25%, transparent);
  }
  .plus {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    margin-bottom: 4px;
    border: 0;
    border-radius: 50%;
    background: var(--field);
    color: var(--text);
    cursor: pointer; /* the + people tap first; "Open photos" below is the labelled one */
    transition: background 150ms, transform 150ms;
  }
  .plus:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 14%, transparent);
  }
  .plus:active:not(:disabled) {
    transform: scale(0.95);
  }
  .plus :global(svg) {
    width: 34px;
    height: 34px;
  }

  /* The empty print well: crop marks around a drop target. */
  .well {
    position: relative;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 12px;
    min-height: 300px;
    padding: 32px 24px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    text-align: center;
    transition: border-color 150ms, transform 150ms;
  }
  .well.over {
    border-color: var(--text);
    transform: scale(1.01);
  }
  .mark {
    position: absolute;
    width: 18px;
    height: 18px;
    border: 0 solid var(--muted);
  }
  .tl { top: 14px; left: 14px; border-top-width: 1.5px; border-left-width: 1.5px; }
  .tr { top: 14px; right: 14px; border-top-width: 1.5px; border-right-width: 1.5px; }
  .bl { bottom: 14px; left: 14px; border-bottom-width: 1.5px; border-left-width: 1.5px; }
  .br { bottom: 14px; right: 14px; border-bottom-width: 1.5px; border-right-width: 1.5px; }
  .well-title {
    font-weight: 600;
    font-size: 1.05rem;
  }
  .ink {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 0 26px;
    border: 0;
    border-radius: 8px;
    background: var(--text);
    color: var(--bg);
    font: inherit;
    font-weight: 650;
    font-size: 1rem;
    cursor: pointer;
  }
  .saved-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .saved-link :global(svg) {
    width: 18px;
    height: 18px;
  }
  .link {
    min-height: 40px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .ink:disabled, .link:disabled, .print:disabled { opacity: 0.6; cursor: default; }

  .rule {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0 28px;
    border-top: 1px solid var(--text);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 36px 28px;
    align-items: start;
  }
  .print {
    display: grid;
    gap: 10px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .wide { grid-column: span 2; }
  .print img {
    width: 100%;
    height: auto;
    display: block;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.16), 0 10px 24px -8px rgb(0 0 0 / 0.22);
    transition: transform 200ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .print:hover:not(:disabled) img { transform: translateY(-4px); }
  .print:hover .mono, .print:focus-visible .mono { color: var(--text); }

  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 40px;
    margin-top: 64px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }

  /* Phones and portrait tablets: title, the pile, the button, then the rest */
  @media (max-width: 899px) {
    .hero {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: none;
      grid-template-areas: "title" "pile" "cta" "lead" "steps" "note";
      row-gap: 18px;
      min-height: 0;
      padding-bottom: 36px;
    }
    .pile {
      width: min(84vw, 360px, max(180px, calc((100svh - 400px) * 0.8)));
    }
    .cta {
      justify-content: center;
    }
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 16px; }
  }
  @media (max-width: 600px) {
    .contact { padding-top: 16px; }
    .well { min-height: 0; padding: 28px 16px; }
    .rule span:last-child { display: none; }
    .print .mono { font-size: 0.66rem; }
  }
</style>
