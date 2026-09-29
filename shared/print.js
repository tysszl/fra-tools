// @ts-check
// Print / Save as PDF. The document title becomes the suggested PDF file name.

/**
 * @param {string} fileTitle
 * @param {() => void} [beforePrint]  Renders the print sheets.
 */
export function printDocument(fileTitle, beforePrint) {
  if (beforePrint) beforePrint();
  const previous = document.title;
  document.title = fileTitle;
  const restore = () => {
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  // Let fonts and images in the sheets settle before the dialog snapshots the page.
  const ready = document.fonts ? document.fonts.ready : Promise.resolve();
  ready.then(() => requestAnimationFrame(() => window.print()));
}

/** @param {string} value */
export function fileSafe(value) {
  return value.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
}
