<script>
  // Tone curve per channel. Updates replace the curve object, so undo snapshots and looks stay independent.
  import CurveEditor from "../../lib/CurveEditor.svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { freshDev } from "../../lib/developEngine.js";
  import { CURVE_COLORS } from "../../lib/catalog.js";

  let { dev = $bindable() } = $props();
  const setCurve = (pts) => (dev.curve = { ...dev.curve, [ui.channel]: pts });
  const resetCurve = () => (dev.curve = freshDev().curve);
</script>

<script module>
  // Survives switching tools, like the rest of the panel.
  const ui = $state({ channel: "rgb" });
</script>

<div class="stack">
  <div class="seg">
    {#each [["rgb", "RGB"], ["r", "Red"], ["g", "Green"], ["b", "Blue"]] as [ch, name] (ch)}
      <button aria-pressed={ui.channel === ch} onclick={() => (ui.channel = ch)}>{t(name)}</button>
    {/each}
  </div>
  <CurveEditor points={dev.curve[ui.channel]} onchange={setCurve} color={CURVE_COLORS[ui.channel]} label={t("{channel} curve", { channel: ui.channel.toUpperCase() })} />
  <p class="hint">{t("Click to add a point, drag to shape the curve, double-click a point to remove it.")}</p>
  <button class="btn ghost" onclick={resetCurve}>{t("Reset curves")}</button>
</div>

<style>
  /* Compact tray (phones, portrait tablets): one swipeable row, so the photo keeps the screen. Same query as COMPACT in App.svelte. */
  @media (max-width: 899px) and (min-height: 501px) {
    /* the square curve would otherwise be as tall as the screen is wide */
    .stack :global(svg[role="application"]) {
      width: min(100%, 30dvh);
      margin-inline: auto;
    }
  }
</style>
