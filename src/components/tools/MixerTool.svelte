<script>
  // Hue, saturation and luminance of one colour band at a time. Updates replace objects (see CurveTool).
  import Dial from "../../lib/Dial.svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { MIXER_BANDS } from "../../lib/developEngine.js";
  import { MIXER_SWATCH } from "../../lib/catalog.js";

  let { dev = $bindable() } = $props();
  const mixerValue = (i) => dev.mixer[ui.band][i];
  function setMixer(i, v) {
    const band = [...dev.mixer[ui.band]];
    band[i] = v;
    dev.mixer = { ...dev.mixer, [ui.band]: band };
  }
  const bandChanged = (b) => dev.mixer[b].some((v) => v !== 0);
  const bandName = (b) => t(b[0].toUpperCase() + b.slice(1)); // "red" → t("Red")
  const PROPS = $derived([
    [t("Hue"), t("Shifts this color toward its neighbours on the color wheel."), "d-mix-h"],
    [t("Saturation"), t("How intense this one color is."), "d-mix-s"],
    [t("Luminance"), t("How bright this one color is."), "d-mix-l"],
  ]);
</script>

<script module>
  const ui = $state({ band: "red", prop: 0 }); // prop: which slider phones show (0 hue, 1 saturation, 2 luminance)
</script>

<div class="stack">
  <div class="bands" role="group" aria-label={t("Color band")}>
    {#each MIXER_BANDS as b (b)}
      <button
        class="swatch band"
        class:changed={bandChanged(b)}
        style:background={MIXER_SWATCH[b]}
        aria-pressed={ui.band === b}
        aria-label={bandName(b)}
        onclick={() => (ui.band = b)}
      ></button>
    {/each}
  </div>
  <div class="seg wrap picker" role="tablist" aria-label={t("Adjustment")}>
    {#each PROPS as [name, , id], i (id)}
      <button role="tab" aria-selected={ui.prop === i} aria-controls={id} onclick={() => (ui.prop = i)}>{name}</button>
    {/each}
  </div>
  {#each PROPS as [name, hint, id], i (id)}
    <div class="slot" class:picked={ui.prop === i}>
      <Dial {id} {hint} label={i ? name : t("{color} hue", { color: bandName(ui.band) })} bind:value={() => mixerValue(i), (v) => setMixer(i, v)} min={-100} max={100} reset={0} signed />
    </div>
  {/each}
  <p class="hint">{t("Shift one color without touching the rest: warmer greens, deeper blue skies, softer skin.")}</p>
</div>

<style>
  .picker {
    display: none;
  }
  /* Compact layout (phones): one slider at a time, like Light. Same query as COMPACT in App.svelte. */
  @media (max-width: 599px), (max-width: 899px) and (min-height: 501px) {
    .picker {
      display: flex;
    }
    .slot:not(.picked) {
      display: none;
    }
  }
  .bands {
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }
  .band.changed::after {
    /* dot marks bands you've adjusted */
    content: "";
    position: absolute;
    bottom: -9px;
    left: 50%;
    width: 4px;
    height: 4px;
    margin-left: -2px;
    border-radius: 50%;
    background: var(--text);
  }
</style>
