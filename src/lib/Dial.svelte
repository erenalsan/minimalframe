<script>
  import { t } from "./i18n.svelte.js";
  // Glass-style slider. Native <input type="range"> underneath,
  // so keyboard, screen readers and rAF-throttled rendering keep working unchanged.
  let {
    label,
    value = $bindable(),
    min = 0,
    max = 100,
    step = 1,
    unit = "",
    reset = undefined, // double-tap target; omitted = no reset
    signed = false, // show "+" for positive values (bipolar sliders)
    track = undefined, // optional CSS gradient for the track (e.g. cool → warm)
    hint = "", // one-line explanation, shown on tap (touch has no hover tooltips)
    id,
  } = $props();

  const pct = (v) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
  const anchor = $derived(pct(reset ?? min));
  const pos = $derived(pct(value));
  const decimals = $derived(String(step).split(".")[1]?.length ?? 0);
  const shown = $derived(
    (signed && value > 0 ? "+" : "") + Number(value).toFixed(decimals),
  );
  const canReset = $derived(reset !== undefined && value !== reset);
  let hintOpen = $state(false);

  // Touch: double-tap the slider to reset it (dblclick only comes from a mouse). Two quick taps, not drags.
  let tap = null;
  let lastTap = 0;
  function tapDown(e) {
    tap = e.pointerType === "touch" ? { x: e.clientX, t: performance.now() } : null;
  }
  function tapUp(e) {
    if (!tap || reset === undefined) return;
    const now = performance.now();
    const isTap = now - tap.t < 250 && Math.abs(e.clientX - tap.x) < 8;
    if (isTap && now - lastTap < 350) {
      value = reset;
      lastTap = 0;
    } else lastTap = isTap ? now : 0;
  }

  // Fine-tune: drag the number sideways, one step per 8px, for values a fingertip can't hit on the track.
  let scrub = null;
  function scrubStart(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    scrub = { x: e.clientX, v: Number(value) };
  }
  function scrubMove(e) {
    if (!scrub) return;
    const v = scrub.v + Math.round((e.clientX - scrub.x) / 8) * step;
    value = Number(Math.min(max, Math.max(min, v)).toFixed(decimals));
  }
</script>

<div class="dial">
  <div class="dial-head">
    <label for={id}>{label}</label>
    {#if hint}
      <button
        type="button"
        class="dial-info"
        title={hint}
        aria-label={t("What does {label} do?", { label })}
        aria-expanded={hintOpen}
        onclick={() => (hintOpen = !hintOpen)}>i</button>
    {/if}
    {#if canReset}
      <button type="button" class="dial-reset" onclick={() => (value = reset)}>{t("Reset")}</button>
    {/if}
    <output
      for={id}
      class:changed={canReset}
      title={t("Drag sideways to fine-tune")}
      onpointerdown={scrubStart}
      onpointermove={scrubMove}
      onpointerup={() => (scrub = null)}
      onpointercancel={() => (scrub = null)}
    >{shown}<small>{unit}</small></output>
  </div>
  <input
    {id}
    type="range"
    {min}
    {max}
    {step}
    bind:value
    ondblclick={() => reset !== undefined && (value = reset)}
    onpointerdown={tapDown}
    onpointerup={tapUp}
    style:--lo="{Math.min(anchor, pos)}%"
    style:--hi="{Math.max(anchor, pos)}%"
    style:--track={track}
    aria-describedby={hint ? `${id}-hint` : undefined}
  />
  {#if hint}<p id="{id}-hint" class="dial-hint" hidden={!hintOpen}>{hint}</p>{/if}
</div>

<style>
  .dial {
    display: grid;
    gap: 4px;
  }
  .dial-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  label {
    font-size: 0.9rem;
    color: var(--text);
  }
  output {
    margin-left: auto;
    padding: 6px 0 6px 12px; /* a bigger target to drag */
    margin-block: -6px;
    cursor: ew-resize;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    font-weight: 650;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  output.changed {
    color: var(--accent-ink, var(--accent));
  }
  output small {
    font-size: 0.75rem;
    font-weight: 500;
    margin-left: 2px;
  }
  .dial-reset {
    font-size: 0.78rem;
    color: var(--muted);
    text-decoration: underline;
    text-underline-offset: 3px;
    padding: 2px;
  }
  .dial-reset:hover {
    color: var(--text);
  }
  .dial-info {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    margin-left: -4px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--text) 30%, transparent);
    font: italic 650 0.66rem/1 Georgia, serif;
    color: var(--muted);
    align-self: center;
  }
  .dial-info:hover,
  .dial-info[aria-expanded="true"] {
    color: var(--text);
    border-color: var(--accent-ink, var(--accent));
  }
  .dial-hint {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--muted);
  }

  input {
    -webkit-appearance: none;
    --fill: color-mix(in srgb, var(--text) 70%, transparent); /* how far it moved: neutral, the photo shows the effect */
    appearance: none;
    width: 100%;
    height: 32px;
    margin: 0;
    border-radius: 999px;
    background:
      /* travelled distance from the neutral point */
      linear-gradient(to right, transparent var(--lo), var(--fill) var(--lo), var(--fill) var(--hi), transparent var(--hi)) center / 100% 4px no-repeat,
      /* optional colour scale, e.g. temperature */
      var(--track, linear-gradient(color-mix(in srgb, var(--text) 18%, transparent), color-mix(in srgb, var(--text) 18%, transparent))) center / 100% 4px no-repeat;
    cursor: pointer;
    touch-action: pan-y;
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.12), 0 2px 6px rgb(0 0 0 / 0.3);
    transition: transform 120ms;
  }
  input:active::-webkit-slider-thumb {
    transform: scale(1.15);
  }
  input::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.12), 0 2px 6px rgb(0 0 0 / 0.3);
  }
  input::-moz-range-track {
    background: transparent;
  }
  input:focus-visible {
    outline: 2px solid var(--accent-ink, var(--accent));
    outline-offset: 2px;
  }
</style>
