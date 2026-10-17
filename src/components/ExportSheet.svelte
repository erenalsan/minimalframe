<script>
  // The export dialog: size, format and quality, then share, save or batch-save. App does the actual work.
  import Icon from "./Icon.svelte";
  import { EXPORT_SIZES } from "../lib/catalog.js";

  let {
    dialog = $bindable(),
    exportOpen = $bindable(),
    exportPrefs = $bindable(),
    batchProgress,
    canShareFiles,
    downloadImage,
    downloadStatus,
    exportBatch,
    fallbackDownloadUrl,
    fallbackFilename,
    filesList,
    isBatchExporting,
    isDownloading,
    pendingShare,
    saveQueue, // Samsung Internet: images still waiting for a tap each
    saveNext,
    processedImage,
    selectedCount,
    shareFiles,
    shareImage,
    sizeEstimate,
    sizeLabel,
    slices,
    savesSeparately, // phones/tablets: separate images instead of a ZIP
  } = $props();
</script>

<dialog
  bind:this={dialog}
  class="sheet glass"
  aria-labelledby="export-title"
  onclick={(e) => {
    if (e.target === dialog && !isBatchExporting) dialog.close();
  }}
  oncancel={(e) => isBatchExporting && e.preventDefault()}
  onclose={() => (exportOpen = false)}
>
  <div class="sheet-in">
    <div class="sheet-head">
      <h2 id="export-title">Export</h2>
      <button class="close" onclick={() => dialog.close()} disabled={isBatchExporting} aria-label="Close">×</button>
    </div>

    {#if isBatchExporting}
      <div class="progress" role="status">
        <p>Exporting {batchProgress.current} of {batchProgress.total}</p>
        <div class="progress-track"><div style:width="{batchProgress.percent}%"></div></div>
        <p class="hint">{batchProgress.filename}</p>
      </div>
    {:else}
      <fieldset>
        <legend class="label">Size</legend>
        <div class="sizes">
          {#each EXPORT_SIZES as s (s.id)}
            <label class="size" class:on={exportPrefs.size === s.id}>
              <input type="radio" name="size" value={s.id} bind:group={exportPrefs.size} class="sr-only" />
              <strong>{s.label}</strong>
              <span>{sizeLabel(s, "framed")}</span>
            </label>
          {/each}
        </div>
      </fieldset>
      <div class="two">
        <div>
          <p class="label">Format</p>
          <div class="seg">
            <button aria-pressed={exportPrefs.format === "jpeg"} onclick={() => (exportPrefs.format = "jpeg")}>JPEG</button>
            <button aria-pressed={exportPrefs.format === "png"} onclick={() => (exportPrefs.format = "png")}>PNG</button>
            <button aria-pressed={exportPrefs.format === "webp"} onclick={() => (exportPrefs.format = "webp")}>WebP</button>
          </div>
        </div>
        <div>
          <p class="label">Quality</p>
          <div class="seg">
            {#each [["good", "Good"], ["high", "High"], ["max", "Max"]] as [q, name] (q)}
              <button aria-pressed={exportPrefs.quality === q} onclick={() => (exportPrefs.quality = q)} disabled={exportPrefs.format === "png"}>{name}</button>
            {/each}
          </div>
        </div>
      </div>
      <p class="privacy">
        🔒 Saved without metadata: no GPS location, serial numbers or camera data in the file{#if filesList.some((f) => f.hadGps)}.
          {filesList.filter((f) => f.hadGps).length === 1 ? "1 photo had" : `${filesList.filter((f) => f.hadGps).length} photos had`} a GPS location, now removed{/if}.
      </p>
      {#if sizeEstimate}<p class="estimate">{sizeEstimate} per {slices > 1 ? "carousel" : "photo"}</p>{/if}
      <p class="hint">
        {exportPrefs.format === "png"
          ? "PNG is lossless: the best quality, but large files."
          : exportPrefs.format === "webp"
            ? "WebP is about a third smaller than JPEG at the same quality."
            : "JPEG works everywhere. High is a good balance; Max keeps every detail."}
      </p>

      <div class="actions">
        {#if saveQueue}
          <button class="btn accent big" onclick={saveNext}><Icon name="export" />Save image {saveQueue.next + 1} of {saveQueue.files.length}</button>
        {/if}
        <!-- svelte-ignore a11y_autofocus -->
        {#if canShareFiles}
          {#if pendingShare}
            <button class="btn accent big" onclick={() => shareFiles(pendingShare)}><Icon name="share" />Share now</button>
          {:else}
            <button class="btn accent big" onclick={shareImage} disabled={!processedImage || isDownloading} autofocus>
              <Icon name="share" />{isDownloading ? "Preparing…" : "Share to Instagram & more"}
            </button>
          {/if}
        {/if}
        <button class={canShareFiles ? "btn ghost" : "btn accent big"} onclick={() => downloadImage("framed")} disabled={!processedImage || isDownloading} autofocus={!canShareFiles}>
          {isDownloading && !canShareFiles ? "Exporting…" : slices > 1 ? `Save ${slices} carousel slides` : "Save framed photo"}
        </button>
        <button class="btn ghost" onclick={() => downloadImage("edited")} disabled={!processedImage || isDownloading}>Save photo only, without frame</button>
        {#if filesList.length > 1}
          <button class="btn ghost" onclick={() => exportBatch("framed")} disabled={selectedCount === 0 || isDownloading}>
            Save {selectedCount} framed {selectedCount === 1 ? "photo" : "photos"}{savesSeparately ? "" : " as ZIP"}
          </button>
        {/if}
      </div>
      {#if downloadStatus}<p class="status" role="status">{downloadStatus}</p>{/if}
      {#if fallbackDownloadUrl}
        <a class="fallback" href={fallbackDownloadUrl} download={fallbackFilename}>Download didn't start? Save {fallbackFilename}</a>
      {/if}
    {/if}
  </div>
</dialog>

<style>
  .sizes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .size {
    display: grid;
    gap: 2px;
    padding: 12px 8px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--text) 5%, transparent);
    border: 1px solid transparent;
    text-align: center;
    cursor: pointer;
  }
  .size strong {
    font-size: 0.92rem;
    font-weight: 650;
  }
  .size span {
    font-size: 0.7rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .size.on {
    border-color: var(--accent-ink);
  }
  .size:focus-within {
    outline: 2px solid var(--accent-ink);
    outline-offset: 2px;
  }
  .two {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 22px;
  }
  .fallback {
    color: var(--accent-ink);
    font-size: 0.92rem;
    text-underline-offset: 3px;
  }
  .progress {
    display: grid;
    gap: 10px;
  }
  .progress-track {
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--text) 15%, transparent);
    overflow: hidden;
  }
  .progress-track div {
    height: 100%;
    background: var(--accent);
    transition: width 200ms;
  }
  .privacy {
    font-size: 0.85rem;
    line-height: 1.45;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--field);
  }
  .estimate {
    font-size: 0.92rem;
    font-weight: 600;
  }
  @media (max-width: 899px) {
    .sizes {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
