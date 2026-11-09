<script>
  // Settings: appearance, language, and how to reach the developer.
  import Icon from "./Icon.svelte";
  import LanguagePicker from "./LanguagePicker.svelte";
  import ThemePicker from "./ThemePicker.svelte";
  import { t } from "../lib/i18n.svelte.js";
  import { EMAIL, VERSION, PRIVACY_URL, feedbackHref } from "../lib/contact.js";
  let { open = $bindable(false), closeOnBack } = $props();

  $effect(() => {
    if (open) return closeOnBack(() => (open = false));
  });
</script>

<svelte:window onkeydown={(e) => open && e.key === "Escape" && (open = false)} />

{#if open}
  <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (open = false)}>
    <div class="sheet-in glass card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="sheet-head">
        <h2 id="settings-title">{t("Settings")}</h2>
        <button class="icon-btn end" onclick={() => (open = false)} aria-label={t("Close")}><Icon name="close" /></button>
      </div>

      <section>
        <span class="label">{t("Appearance")}</span>
        <ThemePicker inline />
      </section>
      <section>
        <span class="label">{t("Language")}</span>
        <LanguagePicker inline />
      </section>

      <section class="sub">
        <span class="label">{t("About")}</span>
        <p class="hint">{t("MinimalFrame {v} is an early version, so some things may not work yet. If something breaks or you have an idea, write to me:", { v: VERSION })}</p>
        <a class="btn ghost" href={feedbackHref()}>{t("Send feedback")}</a>
        <p class="hint">{EMAIL}</p>
        <p class="links hint">
          <a href={PRIVACY_URL} target="_blank" rel="noopener">{t("Privacy")}</a> ·
          <a href="https://github.com/erenalsan/minimalframe/tree/main/public/licenses" target="_blank" rel="noopener">{t("Licenses")}</a> ·
          <span>v{VERSION}</span>
        </p>
      </section>
    </div>
  </div>
{/if}

<style>
  section {
    display: grid;
    gap: var(--sp-2);
  }
  .end {
    margin-left: auto;
  }
  .links a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
