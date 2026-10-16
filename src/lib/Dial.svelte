<script>
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
</script>

<div class="dial">
  <div class="dial-head">
    <label for={id}>{label}</label>
    {#if canReset}
      <button type="button" class="dial-reset" onclick={() => (value = reset)}>Reset</button>
    {/if}
    <output for={id} class:changed={canReset}>{shown}<small>{unit}</small></output>
  </div>
  <input
    {id}
    type="range"
    {min}
    {max}
    {step}
    bind:value
    ondblclick={() => reset !== undefined && (value = reset)}
    style:--lo="{Math.min(anchor, pos)}%"
    style:--hi="{Math.max(anchor, pos)}%"
    style:--track={track}
  />
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
    font-weight: 650;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  output.changed {
    color: var(--accent);
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

  input {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 32px;
    margin: 0;
    border-radius: 999px;
    background:
      /* travelled distance from the neutral point */
      linear-gradient(to right, transparent var(--lo), var(--accent) var(--lo), var(--accent) var(--hi), transparent var(--hi)) center / 100% 4px no-repeat,
      /* optional colour scale, e.g. temperature */
      var(--track, linear-gradient(rgb(255 255 255 / 0.18), rgb(255 255 255 / 0.18))) center / 100% 4px no-repeat;
    cursor: pointer;
    touch-action: pan-y;
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.45);
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
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.45);
  }
  input::-moz-range-track {
    background: transparent;
  }
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
