<script>
  // Phones: every open photo as a big tile — tap to switch, add more, remove, tick for batch export.
  import Icon from "./Icon.svelte";
  import { t } from "../lib/i18n.svelte.js";
  import LanguagePicker from "./LanguagePicker.svelte";

  let { filesList = $bindable(), activeIndex, onpick, onremove, onadd } = $props();
  const ticked = $derived(filesList.filter((f) => f.selected).length);
</script>

<div class="photos">
  <button class="add" onclick={onadd}><Icon name="add" /><span>{t("Add photos")}</span></button>
  {#each filesList as f, i (f.id)}
    <div class="photo" class:active={i === activeIndex}>
      <button class="pick" onclick={() => onpick(i)} aria-current={i === activeIndex ? "true" : undefined} aria-label={t("Show {name}", { name: f.name })}>
        <img src={f.thumbUrl} alt="" />
        {#if f.isRaw}<span class="raw">RAW</span>{/if}
      </button>
      <label class="sel" title={t("Include in batch export")}>
        <input type="checkbox" bind:checked={f.selected} />
        <span class="sr-only">{t("Include {name} in batch export", { name: f.name })}</span>
      </label>
      <button class="mini-del" onclick={(e) => onremove(i, e)} aria-label={t("Remove {name}", { name: f.name })}>×</button>
    </div>
  {/each}
</div>
<p class="hint">
  {filesList.length > 1 ? t("{n} of {total} ticked for batch export.", { n: ticked, total: filesList.length }) + " " : ""}{t(
    "Swipe the photo left or right to switch between photos.",
  )}
</p>
<!-- phones: the top bar is full, so the language lives here -->
<div class="lang">
  <span class="label">{t("Language")}</span>
  <LanguagePicker inline />
</div>

<style>
  .lang {
    display: grid;
    gap: 8px;
    margin-top: 6px;
  }
  .photos {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .add,
  .pick {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
  }
  .add {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 4px;
    border: 1.5px dashed color-mix(in srgb, var(--text) 30%, transparent);
    color: var(--text);
    font-size: 0.72rem;
    font-weight: 600;
  }
  .add :global(svg) {
    width: 24px;
    height: 24px;
    color: var(--accent-ink, var(--accent));
  }
  .photo {
    position: relative;
  }
  .pick img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .photo.active .pick {
    outline: 2.5px solid var(--accent);
    outline-offset: 2px;
  }
  .raw {
    position: absolute;
    bottom: 4px;
    right: 4px;
    padding: 0 4px;
    border-radius: 4px;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font-size: 0.6rem;
    font-weight: 700;
  }
  .sel {
    position: absolute;
    top: 5px;
    left: 5px;
    display: grid;
  }
  .sel input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
</style>
