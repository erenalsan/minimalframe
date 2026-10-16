<script>
  // How the selected photos will sit on an Instagram profile (newest top left, 3:4 tiles).
  // cells: [{ id, url }] newest first; onmove(id, towardTop) changes the posting order.
  let { dialog = $bindable(), cells, onmove } = $props();
</script>

<dialog bind:this={dialog} class="sheet glass" aria-labelledby="grid-title" onclick={(e) => e.target === dialog && dialog.close()}>
  <div class="sheet-in">
    <div class="sheet-head">
      <h2 id="grid-title">Your grid</h2>
      <button class="close" onclick={() => dialog.close()} aria-label="Close">×</button>
    </div>
    <p class="hint">How the selected photos will sit on your Instagram profile if you post them in strip order: the last one ends up top left.</p>
    <ol class="ig-grid">
      {#each cells as cell, i (cell.id)}
        <li>
          <img src={cell.url} alt="Post {cells.length - i}" />
          <span class="ig-order">
            <button onclick={() => onmove(cell.id, true)} disabled={i === 0} aria-label="Post later (move up the grid)">‹</button>
            <button onclick={() => onmove(cell.id, false)} disabled={i === cells.length - 1} aria-label="Post earlier (move down the grid)">›</button>
          </span>
        </li>
      {/each}
      {#each Array.from({ length: (3 - (cells.length % 3)) % 3 + 3 }) as _, k (k)}
        <li class="ig-old" aria-hidden="true"></li>
      {/each}
    </ol>
    <p class="hint">Grey tiles stand for your earlier posts. Only photos ticked in the strip are included.</p>
  </div>
</dialog>

<style>
  .ig-grid {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
    margin: 4px 0;
  }
  .ig-grid li {
    position: relative;
    aspect-ratio: 3 / 4;
    overflow: hidden;
    background: var(--field);
  }
  .ig-grid img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .ig-old {
    background: repeating-linear-gradient(45deg, var(--field) 0 8px, transparent 8px 16px) !important;
  }
  .ig-order {
    position: absolute;
    inset: auto 4px 4px;
    display: flex;
    justify-content: space-between;
    opacity: 0;
    transition: opacity 150ms;
  }
  .ig-grid li:hover .ig-order,
  .ig-grid li:focus-within .ig-order {
    opacity: 1;
  }
  .ig-order button {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font-size: 1.1rem;
  }
  @media (hover: none) {
    .ig-order {
      opacity: 1;
    }
  }
</style>
