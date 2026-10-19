<script>
  // Name a new look or template. kind: "look" | "template".
  import { t } from "../lib/i18n.svelte.js";
  let { kind, name = $bindable(), onsave, onclose } = $props();
</script>

<div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="sheet-in glass card" role="dialog" aria-modal="true" aria-labelledby="save-title">
    <h2 id="save-title">{kind === "look" ? t("Save as my look") : t("Save as template")}</h2>
    <p class="hint">
      {kind === "look"
        ? t("Keeps every edit (light, color, curve, mixer, detail, film) so you can apply it to any photo in one tap.")
        : t("Keeps your ratio, border, colors, caption style, logo placement and edits for one-tap reuse.")}
    </p>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="text"
      type="text"
      placeholder={t("e.g. White gallery")}
      aria-label={kind === "look" ? t("Look name") : t("Template name")}
      bind:value={name}
      autofocus
      onkeydown={(e) => {
        if (e.key === "Enter") onsave();
        if (e.key === "Escape") onclose();
      }}
    />
    <div class="actions row">
      <button class="btn ghost" onclick={() => onclose()}>{t("Cancel")}</button>
      <button class="btn accent" onclick={onsave} disabled={!name.trim()}>{kind === "look" ? t("Save look") : t("Save template")}</button>
    </div>
  </div>
</div>
