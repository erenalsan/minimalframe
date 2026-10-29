<script>
  // A photo dump: how the ticked photos are posted (one per slide, in pairs or in a grid) and an optional cover.
  import { t } from "../lib/i18n.svelte.js";
  import { PER_SLIDE } from "../lib/dump.js";

  // count: ticked photos; autoTitle: the cover's title when none is typed; row: one line (the desktop strip)
  let { post = $bindable(), count, autoTitle = "", row = false } = $props();
  const LAYOUTS = [["single", "One each"], ["pairs", "Pairs"], ["grid", "Grid"]];
  const slidesFor = (id) => Math.ceil(count / PER_SLIDE[id]) + (post.cover ? 1 : 0);
</script>

<div class="post" class:row role="group" aria-label={t("Post them as")}>
  {#if !row}<span class="label">{t("Post them as")}</span>{/if}
  <div class="seg">
    {#each LAYOUTS as [id, name] (id)}
      {@const n = slidesFor(id)}
      <button aria-pressed={post.layout === id} onclick={() => (post.layout = id)}>
        {t(name)}<small>{n === 1 ? t("1 slide") : t("{n} slides", { n })}</small>
      </button>
    {/each}
  </div>
  <label class="switch">
    <input type="checkbox" role="switch" bind:checked={post.cover} />
    <span class="switch-track" aria-hidden="true"></span>
    {t("Cover slide")}
  </label>
  {#if post.cover}
    <input class="text" type="text" maxlength="40" bind:value={post.title} placeholder={autoTitle || t("Cover title")} aria-label={t("Cover title")} />
  {/if}
</div>

<style>
  .post {
    display: grid;
    gap: 12px;
  }
  .post .label {
    margin: 0;
  }
  .seg button {
    display: grid;
    justify-items: center;
    padding-block: 5px;
    line-height: 1.2;
  }
  small {
    font-size: var(--fs-section);
    font-weight: 500;
    opacity: 0.7;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: none;
  }
  .row .seg button {
    padding-block: 4px;
  }
  .row .text {
    width: 150px;
    padding-block: 7px;
  }
</style>
