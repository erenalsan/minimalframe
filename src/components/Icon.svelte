<script>
  // 24×24 stroke icon from the catalog. Size comes from the parent (e.g. .btn svg, .tab svg).
  import { ICONS } from "../lib/catalog.js";
  let { name } = $props();
</script>

<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} /></svg>

<style>
  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
