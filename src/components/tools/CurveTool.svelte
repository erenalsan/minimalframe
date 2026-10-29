<script>
  // Tone curve per channel. Updates replace the curve object, so undo snapshots and looks stay independent.
  import CurveEditor from "../../lib/CurveEditor.svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { freshDev } from "../../lib/developEngine.js";
  import { CURVE_COLORS } from "../../lib/catalog.js";
  import Icon from "../Icon.svelte";

  let { dev = $bindable() } = $props();
  const setCurve = (pts) => (dev.curve = { ...dev.curve, [ui.channel]: pts });
  const resetCurve = () => (dev.curve = freshDev().curve);
  const curved = $derived(JSON.stringify(dev.curve) !== JSON.stringify(freshDev().curve));
</script>

<script module>
  // Survives switching tools, like the rest of the panel.
  const ui = $state({ channel: "rgb" });
</script>

<div class="stack">
  <div class="row">
    <div class="seg">
      {#each [["rgb", "RGB"], ["r", "Red"], ["g", "Green"], ["b", "Blue"]] as [ch, name] (ch)}
        <button aria-pressed={ui.channel === ch} onclick={() => (ui.channel = ch)}>{t(name)}</button>
      {/each}
    </div>
    <button type="button" class="pill-reset" class:shown={curved} inert={!curved} onclick={resetCurve} title={t("Reset curves")}><Icon name="revert" />{t("Reset")}</button>
  </div>
  <CurveEditor points={dev.curve[ui.channel]} onchange={setCurve} color={CURVE_COLORS[ui.channel]} label={t("{channel} curve", { channel: ui.channel.toUpperCase() })} />
  <p class="hint">{t("Click to add a point, drag to shape the curve, double-click a point to remove it.")}</p>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-1);
  }
</style>
