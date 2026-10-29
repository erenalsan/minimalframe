/**
 * fitWidth.js — keeps a label inside a fixed-width button in every language: a word that is too long
 * ("Bearbeiten") is drawn narrower with the font's width axis (Archivo: 62–125%), never smaller, so the
 * button, and everything around it, keeps its size. A Svelte action; refits when the text or size changes.
 */
export function fitWidth(node) {
  const fit = () => {
    node.style.fontStretch = "";
    const room = node.clientWidth - parseFloat(getComputedStyle(node).paddingLeft) * 2;
    const need = node.scrollWidth - parseFloat(getComputedStyle(node).paddingLeft) * 2;
    if (need <= room + 0.5) return;
    // the font narrows less than the percentage says, so step on until the word fits
    let pct = Math.floor((100 * room) / need);
    do node.style.fontStretch = `${(pct = Math.max(62, pct))}%`;
    while (node.scrollWidth > node.clientWidth && pct-- > 62);
  };
  const resize = new ResizeObserver(fit);
  const text = new MutationObserver(fit);
  resize.observe(node);
  text.observe(node, { characterData: true, childList: true, subtree: true });
  document.fonts?.ready.then(fit); // the first measure may happen before the font has arrived
  fit();
  return {
    destroy() {
      resize.disconnect();
      text.disconnect();
    },
  };
}
