<script>
  // First screen, before any photo is open: a contact sheet of real prints from one photo.
  // Tapping a print opens your photo in that frame; the empty print well opens it as it is.
  import { BUILTIN_PRESETS, FILM_PRESETS } from "../lib/catalog.js";

  // bare: just the print well, standing in for the photo on the workbench once every photo has been removed.
  import Icon from "./Icon.svelte";
  import { t } from "../lib/i18n.svelte.js";
  import LanguagePicker from "./LanguagePicker.svelte";
  // langInWell: phones, where the top bar has no room for the language button.
  let { bare = false, langInWell = false, isLoading, loadingStatus, isDragging, onchoose, onsample, onpick, onsaved } = $props();

  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches; // no dragging files on phones
  const isApp = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
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
</script>

{#snippet well()}
  <div class="well" class:over={isDragging}>
    <span class="mark tl"></span><span class="mark tr"></span><span class="mark bl"></span><span class="mark br"></span>
    {#if bare}<button class="plus" onclick={onchoose} disabled={isLoading} tabindex="-1" aria-hidden="true"><Icon name="add" /></button>{/if}
    {#if !touch || isDragging}<p class="well-title">{isDragging ? t("Drop to open") : t("Drop photos here")}</p>{/if}
    <button class="ink" onclick={onchoose} disabled={isLoading}>
      {#if isLoading}<span class="spinner" aria-hidden="true"></span>{loadingStatus || t("Opening…")}{:else}{t("Open photos")}{/if}
    </button>
    {#if !bare}<button class="link" onclick={onsample} disabled={isLoading}>{t("or try the sample")}</button>{/if}
    {#if onsaved}<button class="link saved-link" onclick={onsaved}><Icon name="gallery" />{t("Your saved photos")}</button>{/if}
    <p class="mono">JPEG · PNG · HEIC · RAW</p>
    {#if bare && langInWell}<LanguagePicker inline />{/if}
  </div>
{/snippet}

{#if bare}
  <div class="bare">{@render well()}</div>
{:else}
<div class="contact">
  <section class="head">
    <div class="intro">
      <h1>{t("Frame your photos for the feed.")}</h1>
      <p class="lead">{t("Borders, captions with your camera details, and carousels, plus film looks if you want to edit. Pick a frame below, or start with a plain photo.")}</p>
      <p class="mono">{isApp ? t("Works offline · nothing uploaded") : t("Runs in your browser · works offline · nothing uploaded")}</p>
    </div>

    {@render well()}
  </section>

  <div class="rule mono"><span>{t("One photo, seven frames")}</span><span>{t("Tap a print to start with it")}</span></div>

  <div class="grid">
    {#each PRINTS as p, i (p.img)}
      <button class="print" class:wide={p.wide} onclick={() => onpick(p.preset)} disabled={isLoading} aria-label={t("Start with {name}", { name: t(p.label) })}>
        <span class="mono">{String(i + 1).padStart(2, "0")} {t(p.label)}</span>
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
    overflow: auto;
    padding: 40px clamp(16px, 4vw, 48px) 56px;
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

  .head {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: 48px;
    align-items: center;
    padding-bottom: 40px;
  }
  .intro {
    display: grid;
    gap: 18px;
  }
  h1 {
    font-weight: 750;
    font-stretch: 118%;
    font-size: clamp(2.2rem, 5vw, 4.2rem);
    line-height: 0.98;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }
  .lead {
    max-width: 46ch;
    font-size: 1.08rem;
    line-height: 1.55;
    color: var(--muted);
    text-wrap: pretty;
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

  @media (max-width: 899px) {
    .head { grid-template-columns: 1fr; gap: 28px; padding-bottom: 32px; }
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 16px; }
  }
  @media (max-width: 600px) {
    .contact { padding-top: 20px; }
    .well { min-height: 0; padding: 28px 16px; }
    .rule span:last-child { display: none; }
    .print .mono { font-size: 0.66rem; }
  }
</style>
