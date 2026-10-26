<script>
  // Interface language. In a bar: a globe button with the language code that opens a short list.
  // inline: the three languages side by side (phone Photos panel, empty workbench).
  import Icon from "./Icon.svelte";
  import { t, i18n, setLang, LANGUAGES } from "../lib/i18n.svelte.js";

  let { inline = false } = $props();
  let open = $state(false);
  let root = $state.raw(null);

  function pick(id) {
    setLang(id);
    open = false;
  }
  // Closes on a tap anywhere else or on Escape.
  $effect(() => {
    if (!open) return;
    const away = (e) => !root?.contains(e.target) && (open = false);
    const esc = (e) => e.key === "Escape" && (open = false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  });
</script>

{#if inline}
  <div class="seg" role="group" aria-label={t("Language")}>
    {#each LANGUAGES as [id, name] (id)}
      <button aria-pressed={i18n.lang === id} onclick={() => setLang(id)} lang={id}>{name}</button>
    {/each}
  </div>
{:else}
  <div class="picker" bind:this={root}>
    <button
      class="trigger"
      aria-haspopup="true"
      aria-expanded={open}
      aria-label={t("Language")}
      title={t("Language")}
      onclick={() => (open = !open)}
    >
      <Icon name="globe" /><span>{i18n.lang.toUpperCase()}</span>
    </button>
    {#if open}
      <ul class="menu glass" aria-label={t("Language")}>
        {#each LANGUAGES as [id, name] (id)}
          <li>
            <button aria-pressed={i18n.lang === id} onclick={() => pick(id)} lang={id}>
              <span>{name}</span><span class="code">{id.toUpperCase()}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .picker {
    position: relative;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 10px 0 8px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    transition: background 150ms;
  }
  .trigger:hover,
  .trigger[aria-expanded="true"] {
    background: color-mix(in srgb, var(--text) 12%, transparent);
  }
  .trigger :global(svg) {
    width: 17px;
    height: 17px;
  }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 50;
    min-width: 170px;
    margin: 0;
    padding: 5px;
    list-style: none;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: var(--surface);
    box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.35);
    animation: drop 140ms ease-out;
  }
  .menu button {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    min-height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    color: var(--text);
    font-size: 0.9rem;
    text-align: left;
  }
  .menu button:hover {
    background: var(--field);
  }
  .menu button[aria-pressed="true"] {
    background: var(--field);
    font-weight: 650;
  }
  .code {
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
</style>
