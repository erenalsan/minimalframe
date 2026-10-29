<script>
  // Auto (follow the device) / Light / Dark. Icons in the top bar (inline=false), words in the phone's Photos tray.
  import Icon from "./Icon.svelte";
  import { t } from "../lib/i18n.svelte.js";
  import { theme, setTheme } from "../lib/theme.svelte.js";

  let { inline = false } = $props();
  const CHOICES = [["auto", "Auto"], ["light", "Light mode"], ["dark", "Dark mode"]];
</script>

<div class="seg theme" class:icons={!inline} role="group" aria-label={t("Appearance")}>
  {#each CHOICES as [id, name] (id)}
    <button aria-pressed={theme.choice === id} onclick={() => setTheme(id)} aria-label={t(name)} title={t(name)}>
      {#if inline}{t(name)}{:else}<Icon name={`theme-${id}`} />{/if}
    </button>
  {/each}
</div>

<style>
  .icons button {
    display: grid;
    place-items: center;
    width: 32px;
    min-height: 28px;
    padding: 0;
  }
  .icons :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
