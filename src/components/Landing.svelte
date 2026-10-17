<script>
  // First screen, before any photo is open: what the app does, and two ways to start.
  import Icon from "./Icon.svelte";

  let { isLoading, loadingStatus, isDragging, onchoose, onsample } = $props();
</script>

<div class="hero">
  <div class="fan" aria-hidden="true">
    <div class="sample s-instant">
      <span class="sample-photo p-sunset"></span>
      <span class="sample-cap" style:font-family="Caveat">Kyoto, spring</span>
    </div>
    <div class="sample s-film">
      <span class="sample-photo p-sea"></span>
      <span class="sample-cap" style:font-family='"Space Mono"'>X-T5  23mm  ƒ/2</span>
    </div>
    <div class="sample s-mat">
      <span class="sample-photo p-forest"></span>
      <span class="sample-cap" style:font-family='"Cormorant Garamond"'>Fujifilm X-T5</span>
    </div>
  </div>
  <p class="eyebrow">For Instagram, VSCO and every feed</p>
  <h1>Social-media-ready frames, with your EXIF <em>beautifully set.</em></h1>
  <p class="lead">100% private: zero server uploads. Everything runs entirely in your browser.</p>
  <ul class="badges" aria-label="Features">
    <li>🔒 100% Private (Local Processing)</li>
    <li>⚡ Instant Batch Export</li>
    <li>📸 RAW &amp; EXIF Support</li>
    <li>✨ Film Grain &amp; Bloom</li>
  </ul>
  <div class="dropzone" class:over={isDragging}>
    <Icon name="upload" />
    <p class="dz-title">{isDragging ? "Drop to open" : "Drag & drop one photo or a whole shoot"}</p>
    <div class="dz-actions">
      <button class="btn accent big" onclick={onchoose} disabled={isLoading}>
        {#if isLoading}<span class="spinner" aria-hidden="true"></span>{loadingStatus || "Opening…"}{:else}Choose photos{/if}
      </button>
      <button class="btn ghost big" onclick={onsample} disabled={isLoading}>Try sample photo</button>
    </div>
    <p class="fine">JPEG, PNG, WebP and RAW from Sony, Canon, Nikon, Fujifilm and more.</p>
  </div>
</div>

<style>
  .hero {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: safe center;
    gap: 16px;
    padding: 24px 16px;
    text-align: center;
    overflow: auto;
  }
  .fan {
    position: relative;
    flex: none;
    width: 360px;
    max-width: 90vw;
    height: 180px;
    margin-bottom: 4px;
  }
  .sample {
    position: absolute;
    top: 0;
    left: 50%;
    width: 124px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.08), 0 18px 36px -16px rgb(0 0 0 / 0.4);
    transition: transform 300ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .sample-photo {
    display: block;
    aspect-ratio: 1;
  }
  .sample-cap {
    font-size: 0.8rem;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
  }
  .s-instant {
    background: #fbfaf6;
    color: #222;
    padding: 9px 9px 0;
    transform: translateX(-140%) rotate(-9deg) translateY(16px);
  }
  .s-instant .sample-cap {
    font-size: 1.05rem;
    padding: 9px 0 12px;
    text-align: center;
  }
  .s-film {
    background: #000;
    color: #ddd;
    padding: 6px;
    z-index: 1;
    transform: translateX(-50%) translateY(-4px);
  }
  .s-film .sample-cap {
    font-size: 0.62rem;
    padding: 6px 0 2px;
  }
  .s-mat {
    background: #f2efe8;
    color: #333;
    padding: 18px 18px 0;
    transform: translateX(40%) rotate(8deg) translateY(20px);
  }
  .s-mat .sample-cap {
    font-size: 0.85rem;
    padding: 10px 0 14px;
    text-align: center;
  }
  .fan:hover .s-instant { transform: translateX(-155%) rotate(-12deg) translateY(10px); }
  .fan:hover .s-mat { transform: translateX(55%) rotate(11deg) translateY(14px); }
  .p-sunset { background: linear-gradient(170deg, #ffb26b 0%, #ff7a7a 45%, #4a3a6b 100%); }
  .p-sea { background: linear-gradient(180deg, #9fd3ff 0%, #4f8fc0 50%, #1d3d5c 100%); }
  .p-forest { background: linear-gradient(160deg, #cfe8a0 0%, #5f9a5a 50%, #23402c 100%); }
  .hero h1 em {
    font-style: normal;
    background: linear-gradient(90deg, var(--accent-ink), #f97316);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .hero h1 {
    font-weight: 700;
    font-size: clamp(1.9rem, 4vw, 2.8rem);
    line-height: 1.1;
    letter-spacing: -0.025em;
    max-width: 20ch;
    text-wrap: balance;
  }
  .lead {
    max-width: 44ch;
    font-size: 1.08rem;
    line-height: 1.5;
    color: var(--muted);
    text-wrap: pretty;
  }
  .fine {
    max-width: 52ch;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .eyebrow {
    font-size: 0.78rem;
    font-weight: 650;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent-ink);
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    max-width: 640px;
    padding: 0;
    list-style: none;
  }
  .badges li {
    padding: 7px 13px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    font-size: 0.85rem;
    font-weight: 550;
    white-space: nowrap;
  }
  .dropzone {
    flex: none;
    display: grid;
    justify-items: center;
    gap: 12px;
    width: min(560px, 100%);
    margin-top: 8px;
    padding: 26px 20px 20px;
    border: 1.5px dashed color-mix(in srgb, var(--text) 22%, transparent);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    transition: border-color 150ms, background 150ms, transform 150ms;
  }
  .dropzone.over {
    border-color: var(--accent-ink);
    background: color-mix(in srgb, var(--text) 8%, transparent);
    transform: scale(1.01);
  }
  .dropzone > :global(svg) {
    width: 30px;
    height: 30px;
    color: var(--accent-ink);
  }
  .dz-title {
    font-weight: 600;
  }
  .dz-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }
  /* Keep the dropzone above the fold: shrink the fan on short screens, drop it on phones. */
  @media (max-width: 600px) {
    .fan {
      display: none;
    }
    .hero {
      gap: 12px;
    }
    .badges li {
      padding: 5px 10px;
      font-size: 0.76rem;
    }
    .dropzone {
      padding: 18px 14px 14px;
    }
    .dropzone .btn.big {
      padding: 12px 20px;
      font-size: 0.98rem;
    }
  }
</style>
