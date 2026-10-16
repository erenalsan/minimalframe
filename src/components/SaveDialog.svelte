<script>
  // Name a new look or template. kind: "look" | "template".
  let { kind, name = $bindable(), onsave, onclose } = $props();
</script>

<div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="sheet-in glass card" role="dialog" aria-modal="true" aria-labelledby="save-title">
    <h2 id="save-title">{kind === "look" ? "Save as my look" : "Save as template"}</h2>
    <p class="hint">
      {kind === "look"
        ? "Keeps every edit (light, color, curve, mixer, detail, film) so you can apply it to any photo in one tap."
        : "Keeps your ratio, border, colors, caption style, logo placement and edits for one-tap reuse."}
    </p>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="text"
      type="text"
      placeholder="e.g. White gallery"
      aria-label="Template name"
      bind:value={name}
      autofocus
      onkeydown={(e) => {
        if (e.key === "Enter") onsave();
        if (e.key === "Escape") onclose();
      }}
    />
    <div class="actions row">
      <button class="btn ghost" onclick={() => onclose()}>Cancel</button>
      <button class="btn accent" onclick={onsave} disabled={!name.trim()}>{kind === "look" ? "Save look" : "Save template"}</button>
    </div>
  </div>
</div>
