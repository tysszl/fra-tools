// @ts-check
// Step art for the printed mixing page: four code-drawn scenes per procedure (inline SVG,
// generated into mixing-art.js), plus the two-doser line on two-doser stock charts.
// Captions are HTML.
import { MIXING_ART, MIXING_THEME } from "./mixing-art.js";

/**
 * @param {"stock" | "direct"} kind
 * @param {string[]} captions  Four captions, one per panel.
 * @param {{ cplus?: boolean }} [opts]  Component Plus colors the bags for its line.
 */
export function stepArt(kind, captions, opts = {}) {
  const ids = kind === "stock" ? ["stock-1", "stock-2", "stock-3", "stock-4"] : ["dtr-1", "dtr-2", "dtr-3", "dtr-4"];
  const cls = opts.cplus ? " s-art--cplus" : "";
  return `<style>${MIXING_THEME}</style><div class="s-art${cls}">${ids.map((id, i) => `<figure class="s-art__panel">${MIXING_ART[id]}<figcaption><span class="s-art__n">${i + 1}</span>${captions[i]}</figcaption></figure>`).join("")}</div>`;
}

/**
 * The two-doser line: water in, Tank 1 and Tank 2 dosers, optional pH Up doser grayed out.
 * @param {{ cplus?: boolean }} [opts]
 */
export function doserArt(opts = {}) {
  return `<div class="s-line">${MIXING_ART[opts.cplus ? "two-doser-cplus" : "two-doser"]}</div>`;
}
