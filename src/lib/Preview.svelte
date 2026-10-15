<script>
  /**
   * Preview.svelte — MinimalFrame
   *
   * Reactive canvas mirror. Accepts the hidden <canvas> element and a `deps`
   * array whose value changes whenever the canvas should be re-read.
   * Converts the canvas to a Blob URL and displays it as an <img>.
   */
  import { tick } from 'svelte';

  /** @type {{ canvas: HTMLCanvasElement|null, deps: any[] }} */
  let { canvas, deps } = $props();

  let src = $state('');
  let prevUrl = '';

  $effect(() => {
    // Access deps to make Svelte track them as reactive dependencies.
    // eslint-disable-next-line no-unused-expressions
    deps;

    // Small async gap so the canvas render (which runs synchronously in the
    // parent's $effect) finishes before we snapshot it.
    tick().then(() => {
      if (!canvas || canvas.width === 0 || canvas.height === 0) return;

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          // Revoke the previous object URL to avoid memory leaks
          if (prevUrl) URL.revokeObjectURL(prevUrl);
          prevUrl = URL.createObjectURL(blob);
          src = prevUrl;
        },
        'image/jpeg',
        0.88
      );
    });
  });
</script>

{#if src}
  <img {src} alt="Framed preview" id="preview-img" />
{/if}
