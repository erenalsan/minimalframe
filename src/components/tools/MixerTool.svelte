<script>
  // Hue, saturation and luminance of one colour band at a time. Updates replace objects (see CurveTool).
  import Dial from "../../lib/Dial.svelte";
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
</script>

<script module>
  const ui = $state({ band: "red" });
</script>

<div class="stack">
  <div class="bands" role="group" aria-label="Color band">
    {#each MIXER_BANDS as b (b)}
      <button
        class="band"
        class:changed={bandChanged(b)}
        style:--c={MIXER_SWATCH[b]}
        aria-pressed={ui.band === b}
        aria-label={b}
        onclick={() => (ui.band = b)}
      ></button>
    {/each}
  </div>
  <Dial id="d-mix-h" hint="Shifts this color toward its neighbours on the color wheel." label="{ui.band[0].toUpperCase() + ui.band.slice(1)} hue" bind:value={() => mixerValue(0), (v) => setMixer(0, v)} min={-100} max={100} reset={0} signed />
  <Dial id="d-mix-s" hint="How intense this one color is." label="Saturation" bind:value={() => mixerValue(1), (v) => setMixer(1, v)} min={-100} max={100} reset={0} signed />
  <Dial id="d-mix-l" hint="How bright this one color is." label="Luminance" bind:value={() => mixerValue(2), (v) => setMixer(2, v)} min={-100} max={100} reset={0} signed />
  <p class="hint">Shift one color without touching the rest: warmer greens, deeper blue skies, softer skin.</p>
</div>

<style>
  .bands {
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }
  .band {
    position: relative;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--c);
    outline: 2px solid transparent;
    outline-offset: 3px;
  }
  .band[aria-pressed="true"] {
    outline-color: #fff;
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
    background: #fff;
  }
</style>
