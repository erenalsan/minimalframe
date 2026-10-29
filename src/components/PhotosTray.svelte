<script>
  // Phones: every open photo as a big tile — tap to switch, add more, remove, tick for batch export,
  // hold and drag to change the order. With several ticked: how to post them (a photo dump) and its cover.
  import Icon from "./Icon.svelte";
  import { t } from "../lib/i18n.svelte.js";
  import { reorder } from "../lib/reorder.js";
  import LanguagePicker from "./LanguagePicker.svelte";
  import PostOptions from "./PostOptions.svelte";

  let { filesList = $bindable(), post = $bindable(), activeIndex, coverOn, coverShown, autoTitle, onpick, onpickcover, onremove, onadd, onmove } = $props();
  const ticked = $derived(filesList.filter((f) => f.selected).length);
  // each ticked photo's place in the post
  const place = $derived(new Map(filesList.filter((f) => f.selected).map((f, i) => [f, i + 1])));
</script>

<div class="photos" use:reorder={{ onmove }}>
  <button class="add" onclick={onadd}><Icon name="add" /><span>{t("Add photos")}</span></button>
  {#if coverOn}
    <button class="add cover" class:active={coverShown} onclick={onpickcover} aria-current={coverShown ? "true" : undefined}>
      <span class="sheet" aria-hidden="true"><i></i><i></i></span><span>{t("Cover slide")}</span>
    </button>
  {/if}
  {#each filesList as f, i (f.id)}
    <div class="photo" class:active={i === activeIndex && !coverShown} data-index={i}>
      <button class="pick" onclick={() => onpick(i)} aria-current={i === activeIndex ? "true" : undefined} aria-label={t("Show {name}", { name: f.name })}>
        <img src={f.thumbUrl} alt="" />
        {#if f.isRaw}<span class="raw">RAW</span>{/if}
        {#if ticked > 1 && place.has(f)}<span class="num">{place.get(f)}</span>{/if}
      </button>
      <label class="sel" title={t("Include in batch export")}>
        <input type="checkbox" bind:checked={f.selected} />
        <span class="sr-only">{t("Include {name} in batch export", { name: f.name })}</span>
      </label>
      <button class="mini-del" onclick={(e) => onremove(i, e)} aria-label={t("Remove {name}", { name: f.name })}>×</button>
    </div>
  {/each}
</div>
{#if ticked > 1}
  <PostOptions bind:post count={ticked} {autoTitle} />
{/if}
<p class="hint">
  {filesList.length > 1 ? t("{n} of {total} ticked for batch export.", { n: ticked, total: filesList.length }) + " " + t("Hold a photo and drag it to change the order.") + " " : ""}{t(
    "Swipe the photo left or right to switch between photos.",
  )}
</p>
<!-- phones: the top bar is full, so the language lives here -->
<div class="lang">
  <span class="label">{t("Language")}</span>
  <LanguagePicker inline />
</div>

<style>
  .photos + :global(.post) {
    margin-top: 16px;
  }
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
  .photo.active .pick,
  .cover.active {
    outline: 2.5px solid var(--text);
    outline-offset: 2px;
  }
  .num {
    position: absolute;
    left: 5px;
    bottom: 5px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    box-sizing: border-box;
    border-radius: 10px;
    background: rgb(17 17 18 / 0.75);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 20px;
    text-align: center;
  }
  .cover {
    border-style: solid;
    background: #f7f6f2;
    color: #3f3e3a;
  }
  /* a tiny contact sheet: two film strips */
  .sheet {
    display: grid;
    gap: 3px;
    width: 34px;
  }
  .sheet i {
    height: 10px;
    background: #0b0b0c;
    border-radius: 1px;
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
