<script>
  // The plain slider tools: Light, Color, Detail and Film. Each slider edits one develop setting.
  // Desktop shows every slider; the compact (phone) tray shows one at a time, picked from a row of chips.
  import Dial from "../../lib/Dial.svelte";
  import { t } from "../../lib/i18n.svelte.js";

  let { group, dev = $bindable() } = $props();

  const S = { min: -100, max: 100, reset: 0, signed: true };
  const GROUPS = {
    light: {
      note: "",
      sliders: [
        { key: "exposure", id: "d-exposure", label: "Exposure", min: -3, max: 3, step: 0.05, unit: "EV", reset: 0, signed: true, hint: "Overall brightness in camera stops. +1 EV doubles the light." },
        { key: "contrast", id: "d-contrast", label: "Contrast", ...S, hint: "Spreads tones apart: darker darks and brighter brights." },
        { key: "highlights", id: "d-highlights", label: "Highlights", ...S, hint: "Recovers or brightens only the brightest areas, like skies." },
        { key: "shadows", id: "d-shadows", label: "Shadows", ...S, hint: "Lifts or deepens only the darkest areas without touching the rest." },
        { key: "whites", id: "d-whites", label: "Whites", ...S, hint: "Sets the white point: how bright the very brightest pixels get." },
        { key: "blacks", id: "d-blacks", label: "Blacks", ...S, hint: "Sets the black point: how deep the very darkest pixels get." },
      ],
    },
    color: {
      note: "Vibrance boosts muted colors and protects skin tones. Saturation moves every color equally.",
      sliders: [
        { key: "temperature", id: "d-temp", label: "Temperature", ...S, track: "linear-gradient(to right, #5d9bff, #ffbe55)", hint: "White balance: cooler (blue) to warmer (yellow)." },
        { key: "tint", id: "d-tint", label: "Tint", ...S, track: "linear-gradient(to right, #53d36b, #e45ce0)", hint: "Corrects green or magenta casts, e.g. from fluorescent light." },
        { key: "vibrance", id: "d-vibrance", label: "Vibrance", ...S, hint: "Boosts muted colors more than strong ones, and protects skin tones." },
        { key: "saturation", id: "d-saturation", label: "Saturation", ...S, hint: "Intensity of every color equally." },
      ],
    },
    detail: {
      note: "Clarity adds mid-tone punch; negative clarity softens. Sharpen crisps fine detail.",
      sliders: [
        { key: "clarity", id: "d-clarity", label: "Clarity", ...S, hint: "Midtone contrast: adds punch and texture, or softens." },
        { key: "sharpen", id: "d-sharpen", label: "Sharpen", unit: "%", reset: 0, hint: "Crisper fine edges. Best judged at 100% zoom." },
      ],
    },
    film: {
      note: "Bloom makes highlights glow like a mist filter. The preview is an approximation; full grain and bloom are rendered when you export.",
      sliders: [
        { key: "filmGrain", id: "d-grain", label: "Film grain", unit: "%", reset: 0, hint: "Analog film texture over the photo." },
        { key: "softBloom", id: "d-bloom", label: "Soft bloom", unit: "%", reset: 0, hint: "Soft glow around bright areas, like a diffusion filter." },
      ],
    },
  };
  const g = $derived(GROUPS[group]);
</script>

<script module>
  // Which slider each group's chip row has selected; survives switching tools.
  const picked = $state({ light: 0, color: 0, detail: 0, film: 0 });
</script>

<div class="seg wrap chips" role="tablist" aria-label={t("Adjustment")}>
  {#each g.sliders as s, i (s.key)}
    <button
      role="tab"
      class:changed={dev[s.key] !== s.reset}
      aria-selected={picked[group] === i}
      aria-controls={s.id}
      onclick={() => (picked[group] = i)}>{t(s.label)}</button
    >
  {/each}
</div>

<div class="stack">
  {#each g.sliders as s, i (s.key)}
    <div class="slot" class:picked={picked[group] === i}>
      <Dial
        id={s.id}
        label={t(s.label)}
        hint={t(s.hint)}
        bind:value={dev[s.key]}
        min={s.min ?? 0}
        max={s.max ?? 100}
        step={s.step ?? 1}
        unit={s.unit ?? ""}
        reset={s.reset}
        signed={s.signed ?? false}
        track={s.track}
      />
    </div>
  {/each}
  {#if g.note}<p class="hint note">{t(g.note)}</p>{/if}
</div>

<style>
  .chips {
    display: none;
  }
  /* Compact layout (phones, portrait tablets); keep this query in step with COMPACT in App.svelte. */
  @media (max-width: 599px), (max-width: 899px) and (min-height: 501px) {
    .chips {
      display: flex;
    }
    .chips button {
      position: relative;
    }
    /* A dot marks adjustments that have been changed. */
    .chips button.changed::after {
      content: "";
      position: absolute;
      top: 5px;
      right: 6px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--accent-ink, var(--accent));
    }
    .slot:not(.picked),
    .note {
      display: none;
    }
  }
</style>
