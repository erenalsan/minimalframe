<script>
  // Shown once per version: the app is early, and how to report what breaks.
  import { t } from "../lib/i18n.svelte.js";
  import { EMAIL, VERSION, feedbackHref } from "../lib/contact.js";

  const KEY = "mf_notice_seen";
  let open = $state(true);
  try {
    open = localStorage.getItem(KEY) !== VERSION;
  } catch {}
  function close() {
    open = false;
    try {
      localStorage.setItem(KEY, VERSION);
    } catch {}
  }
</script>

{#if open}
  <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="sheet-in glass card" role="dialog" aria-modal="true" aria-labelledby="notice-title">
      <h2 id="notice-title">{t("Still in development")}</h2>
      <p class="hint">
        {t("MinimalFrame {v} is an early version, so some things may not work yet. If something breaks or you have an idea, write to me:", { v: VERSION })}
      </p>
      <a class="mail" href={feedbackHref()}>{EMAIL}</a>
      <div class="actions">
        <!-- svelte-ignore a11y_autofocus -->
        <button class="btn accent" onclick={close} onkeydown={(e) => e.key === "Escape" && close()} autofocus>{t("OK")}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .mail {
    color: var(--accent);
    font-weight: 600;
    word-break: break-all;
  }
</style>
