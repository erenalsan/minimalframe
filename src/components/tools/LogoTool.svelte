<script>
  // Your logo or signature as a watermark: upload, snap to a corner, size, opacity and position.
  import Dial from "../../lib/Dial.svelte";

  let { frame = $bindable(), logoImage, logoName, onupload, onremove } = $props();

  function setLogoPreset(pos) {
    if (pos === "bottom-right") {
      frame.logoPosX = 92;
      frame.logoPosY = 93;
    } else if (pos === "bottom-left") {
      frame.logoPosX = 8;
      frame.logoPosY = 93;
    } else if (pos === "top-right") {
      frame.logoPosX = 92;
      frame.logoPosY = 7;
    } else if (pos === "top-left") {
      frame.logoPosX = 8;
      frame.logoPosY = 7;
    } else if (pos === "center") {
      frame.logoPosX = 50;
      frame.logoPosY = 50;
    }
  }
</script>

{#if logoImage}
  <div class="stack">
    <div class="logo-row">
      <img src={logoImage.src} alt="" />
      <span class="logo-name">{logoName || "Your logo"}</span>
      <button class="btn ghost" onclick={onremove}>Remove</button>
    </div>
    <div>
      <p class="label">Snap to</p>
      <div class="seg wrap">
        <button onclick={() => setLogoPreset("top-left")}>Top left</button>
        <button onclick={() => setLogoPreset("top-right")}>Top right</button>
        <button onclick={() => setLogoPreset("center")}>Center</button>
        <button onclick={() => setLogoPreset("bottom-left")}>Bottom left</button>
        <button onclick={() => setLogoPreset("bottom-right")}>Bottom right</button>
      </div>
    </div>
    <Dial id="d-logo-scale" label="Size" bind:value={frame.logoScale} min={3} max={45} unit="%" reset={12} />
    <Dial id="d-logo-opacity" label="Opacity" bind:value={frame.logoOpacity} min={5} max={100} unit="%" reset={85} />
    <Dial id="d-logo-x" label="Across" bind:value={frame.logoPosX} unit="%" />
    <Dial id="d-logo-y" label="Up and down" bind:value={frame.logoPosY} unit="%" />
  </div>
{:else}
  <label class="upload">
    <span class="upload-title">Add your logo or signature</span>
    <span class="hint">A PNG or SVG with a transparent background works best.</span>
    <input type="file" accept=".png,.svg,.webp,.jpg,.jpeg" onchange={onupload} class="sr-only" />
  </label>
{/if}

<style>
  /* Logo */
  .logo-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo-row img {
    width: 48px;
    height: 48px;
    object-fit: contain;
    padding: 6px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--text) 12%, transparent);
  }
  .logo-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.92rem;
  }
  .upload {
    display: grid;
    gap: 6px;
    padding: 22px 18px;
    border: 1px dashed color-mix(in srgb, var(--text) 35%, transparent);
    border-radius: 16px;
    cursor: pointer;
  }
  .upload:hover,
  .upload:focus-within {
    border-color: var(--accent-ink);
  }
  .upload-title {
    font-weight: 650;
  }
</style>
