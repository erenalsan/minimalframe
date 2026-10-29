<script>
  // A colour picker drawn by the app (Android's own is a dated dialog): a saturation/brightness field, a hue
  // strip and the colour code. The photo follows while dragging. data-drag keeps the tray from taking the drag.
  // Below: the last colours used and the ones saved on purpose (colorMemory.svelte.js).
  import { t } from "./i18n.svelte.js";
  import { colors, useColor, saveColor, forgetColor } from "./colorMemory.svelte.js";

  let { value, onchange, label } = $props();

  const clamp = (x) => Math.min(1, Math.max(0, x));
  function toHsv(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
  }
  function toHex({ h, s, v }) {
    const f = (k) => {
      const c = (k + h / 60) % 6;
      return Math.round((v - v * s * Math.max(0, Math.min(c, 4 - c, 1))) * 255);
    };
    return "#" + [f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, "0")).join("");
  }

  let hsv = $state(toHsv(value));
  let ours = value.toLowerCase(); // the last colour we sent, so our own changes don't reset the hue
  $effect(() => {
    if (value.toLowerCase() === ours) return;
    const next = toHsv(value);
    hsv = next.s === 0 || next.v === 0 ? { ...next, h: hsv.h } : next; // greys keep the hue you were on
    ours = value.toLowerCase();
  });
  function set(part) {
    hsv = { ...hsv, ...part };
    ours = toHex(hsv);
    onchange(ours);
  }
  // a whole colour (typed, or a remembered one): the field and hue strip move to it too
  function choose(hex) {
    const next = toHsv(hex);
    hsv = next.s === 0 || next.v === 0 ? { ...next, h: hsv.h } : next;
    ours = hex;
    onchange(hex);
  }
  // closing the picker (or the tray) remembers the colour it set, if that's still the colour in use:
  // a swatch tapped elsewhere meanwhile isn't counted here (the photo's colours count when exported)
  const opened = value.toLowerCase();
  $effect(() => () => value.toLowerCase() === ours && ours !== opened && useColor(ours));

  let field = $state.raw(null);
  let dragging = false;
  function pick(e) {
    const r = field.getBoundingClientRect();
    set({ s: clamp((e.clientX - r.left) / r.width), v: clamp(1 - (e.clientY - r.top) / r.height) });
  }
  function keys(e) {
    const step = e.shiftKey ? 0.1 : 0.02;
    const move = { ArrowLeft: { s: hsv.s - step }, ArrowRight: { s: hsv.s + step }, ArrowUp: { v: hsv.v + step }, ArrowDown: { v: hsv.v - step } }[e.key];
    if (!move) return;
    e.preventDefault();
    set(Object.fromEntries(Object.entries(move).map(([k, x]) => [k, clamp(x)])));
  }

  let code = $state(value);
  $effect(() => {
    code = value;
  });
  function typed() {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(code.trim());
    if (!m) return (code = value); // not a colour: back to the current one
    const hex = "#" + (m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1]).toLowerCase();
    choose(hex);
  }
  const savedNow = $derived(colors.saved.includes(value.toLowerCase()));
</script>

<div class="picker" style:--hue="hsl({hsv.h} 100% 50%)">
  <div
    class="field"
    data-drag
    bind:this={field}
    role="slider"
    tabindex="0"
    aria-label={t("{name}: saturation and brightness", { name: label })}
    aria-valuetext="{Math.round(hsv.s * 100)}%, {Math.round(hsv.v * 100)}%"
    onpointerdown={(e) => ((dragging = true), field.setPointerCapture(e.pointerId), pick(e))}
    onpointermove={(e) => dragging && pick(e)}
    onpointerup={() => (dragging = false)}
    onpointercancel={() => (dragging = false)}
    onkeydown={keys}
  >
    <span class="knob" style:left="{hsv.s * 100}%" style:top="{(1 - hsv.v) * 100}%" style:background={value}></span>
  </div>
  <input class="hue" type="range" min="0" max="359" step="1" value={Math.round(hsv.h)} oninput={(e) => set({ h: +e.currentTarget.value })} aria-label={t("Hue")} />
  <div class="code-row">
    <span class="preview" style:background={value} aria-hidden="true"></span>
    <input class="code" bind:value={code} onchange={typed} onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()} maxlength="7" spellcheck="false" autocomplete="off" aria-label={t("Color code")} />
    <button class="btn ghost save" onclick={() => saveColor(value)} disabled={savedNow}>{savedNow ? t("Saved") : t("Save color")}</button>
  </div>
  {#if colors.recent.length}
    <div class="memory">
      <p class="label">{t("Recent colors")}</p>
      <div class="swatches">
        {#each colors.recent as c (c)}
          <button class="swatch" style:background={c} aria-pressed={value.toLowerCase() === c} aria-label={t("Use {c}", { c: c.toUpperCase() })} onclick={() => choose(c)}></button>
        {/each}
      </div>
    </div>
  {/if}
  {#if colors.saved.length}
    <div class="memory">
      <p class="label">{t("Saved colors")}</p>
      <div class="swatches">
        {#each colors.saved as c (c)}
          <span class="kept">
            <button class="swatch" style:background={c} aria-pressed={value.toLowerCase() === c} aria-label={t("Use {c}", { c: c.toUpperCase() })} onclick={() => choose(c)}></button>
            <button class="mini-del" onclick={() => forgetColor(c)} aria-label={t("Remove saved color {c}", { c: c.toUpperCase() })}>×</button>
          </span>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .picker {
    display: grid;
    gap: var(--sp-2);
    max-width: 360px;
    padding: var(--sp-2);
    border-radius: 14px;
    background: var(--field);
    animation: unfold 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes unfold {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
  }
  .field {
    position: relative;
    height: 132px;
    border-radius: 10px;
    background:
      linear-gradient(to top, #000, transparent),
      linear-gradient(to right, #fff, var(--hue));
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
    touch-action: none;
    cursor: crosshair;
  }
  .knob {
    position: absolute;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 3px solid #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25), 0 2px 6px rgb(0 0 0 / 0.3);
    translate: -50% -50%;
    pointer-events: none;
  }
  .hue {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 10px;
    margin: 6px 0;
    border-radius: 5px;
    background: linear-gradient(to right, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
    touch-action: none;
  }
  .hue::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 3px solid #fff;
    background: var(--hue);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25), 0 2px 6px rgb(0 0 0 / 0.3);
  }
  .hue::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 3px solid #fff;
    background: var(--hue);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25), 0 2px 6px rgb(0 0 0 / 0.3);
  }
  .save {
    margin-left: auto;
    padding: 8px 14px;
    font-size: var(--fs-label);
  }
  .memory {
    display: grid;
    gap: var(--sp-1);
    padding-top: var(--sp-1);
  }
  .memory .label {
    margin: 0;
  }
  .kept {
    position: relative;
  }
  .code-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .preview {
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 22%, transparent);
  }
  .code {
    width: 12ch; /* "#RRGGBB" with room to spare */
    padding: 7px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    font-family: "Space Mono", ui-monospace, monospace;
    font-size: var(--fs-label);
    text-transform: uppercase;
  }
</style>
