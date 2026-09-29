// @ts-check
// Step art for the printed mixing page: four line drawings per procedure, drawn as
// inline SVG so they print sharp and pick up the part colors. Captions are HTML.

const INK = "#141716";
const MUTED = "#8b928f";
const WATER = "#e3ecf1";
const WATER_LINE = "#9fb6c3";
const ACCENT = "#b3121b";
const PARTS = ["#2e7d4a", "#2f62b0", "#c0262d"];

/** @param {string} body */
function svg(body) {
  return `<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/**
 * Open-top tank with water to `level` (0..1) and a dashed target mark.
 * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} level
 */
function tank(x, y, w, h, level) {
  const waterTop = y + h - h * level;
  return `<path d="M${x} ${y} V${y + h - 6} Q${x} ${y + h} ${x + 6} ${y + h} H${x + w - 6} Q${x + w} ${y + h} ${x + w} ${y + h - 6} V${y}" stroke="${INK}" stroke-width="2"/>`
    + `<path d="M${x + 1.5} ${waterTop} H${x + w - 1.5} V${y + h - 6} Q${x + w - 1.5} ${y + h - 1.5} ${x + w - 7} ${y + h - 1.5} H${x + 7} Q${x + 1.5} ${y + h - 1.5} ${x + 1.5} ${y + h - 6} Z" fill="${WATER}"/>`
    + `<path d="M${x + 1.5} ${waterTop} H${x + w - 1.5}" stroke="${WATER_LINE}" stroke-width="1.5"/>`
    + `<path d="M${x - 5} ${y + 8} H${x + 4}" stroke="${ACCENT}" stroke-width="1.5"/>`
    + `<path d="M${x + 6} ${y + 8} H${x + w - 4}" stroke="${ACCENT}" stroke-width="1" stroke-dasharray="3 3"/>`;
}

/** Agitator: shaft and a curved arrow. @param {number} cx @param {number} top @param {number} bottom */
function mixer(cx, top, bottom) {
  return `<path d="M${cx} ${top} V${bottom}" stroke="${INK}" stroke-width="2"/>`
    + `<path d="M${cx - 8} ${bottom} h16" stroke="${INK}" stroke-width="2.5"/>`
    + `<rect x="${cx - 7}" y="${top - 10}" width="14" height="10" rx="2" stroke="${INK}" stroke-width="2"/>`
    + `<path d="M${cx - 16} ${bottom - 12} a16 6 0 1 0 32 0" stroke="${MUTED}" stroke-width="1.5"/>`
    + `<path d="M${cx + 16} ${bottom - 12} l-4 -3 m4 3 l-5 1" stroke="${MUTED}" stroke-width="1.5"/>`;
}

/** Clock face with a label. @param {number} cx @param {number} cy @param {string} label */
function clock(cx, cy, label) {
  return `<circle cx="${cx}" cy="${cy}" r="13" stroke="${INK}" stroke-width="2" fill="#fff"/>`
    + `<path d="M${cx} ${cy - 7} V${cy} L${cx + 5} ${cy + 3}" stroke="${INK}" stroke-width="2"/>`
    + `<text x="${cx}" y="${cy + 26}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" font-weight="600" fill="${INK}" stroke="none">${label}</text>`;
}

/** A tilted bag pouring granules. @param {number} x @param {number} y @param {string} color */
function bag(x, y, color) {
  return `<g transform="rotate(28 ${x} ${y})"><path d="M${x - 11} ${y - 14} h22 l2 26 h-26 z" fill="#fff" stroke="${INK}" stroke-width="2"/>`
    + `<path d="M${x - 8} ${y - 4} h16" stroke="${color}" stroke-width="4"/></g>`
    + [0, 1, 2, 3].map(i => `<circle cx="${x - 14 + i * 3}" cy="${y + 18 + i * 6}" r="1.6" fill="${color}" stroke="none"/>`).join("");
}

/** EC meter showing a value. @param {number} x @param {number} y @param {string} text */
function meter(x, y, text) {
  return `<rect x="${x}" y="${y}" width="34" height="46" rx="5" fill="#fff" stroke="${INK}" stroke-width="2"/>`
    + `<rect x="${x + 5}" y="${y + 6}" width="24" height="14" rx="2" fill="#f0f2f1" stroke="${INK}" stroke-width="1"/>`
    + `<text x="${x + 17}" y="${y + 16.5}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8" font-weight="600" fill="${INK}" stroke="none">${text}</text>`
    + `<path d="M${x + 17} ${y + 46} V${y + 66}" stroke="${INK}" stroke-width="2.5"/>`;
}

const STOCK = [
  // 1: fill to half, start agitating
  svg(tank(40, 26, 80, 80, 0.5) + mixer(80, 16, 92)),
  // 2: add product over 5 min
  svg(tank(40, 26, 80, 80, 0.5) + mixer(92, 16, 92) + bag(56, 8, PARTS[0]) + clock(136, 50, "5 min")),
  // 3: top off, mix 10 min
  svg(tank(40, 26, 80, 80, 0.92) + mixer(80, 16, 92) + clock(136, 50, "10 min")),
  // 4: sample into a bucket, read EC
  svg(`<path d="M20 44 h22 l-3 30 h-16 z" fill="${WATER}" stroke="${INK}" stroke-width="2"/>`
    + `<path d="M48 58 h18 m-5 -5 l5 5 l-5 5" stroke="${ACCENT}" stroke-width="2"/>`
    + tank(76, 40, 52, 66, 0.8) + meter(112, 10, "EC")),
];

const DIRECT = [
  svg(tank(36, 26, 88, 80, 0.82) + mixer(80, 16, 92)),
  svg(tank(36, 40, 88, 66, 0.82) + bag(40, 16, PARTS[0]) + bag(80, 12, PARTS[1]) + bag(120, 16, PARTS[2])),
  svg(tank(36, 26, 88, 80, 0.92) + meter(104, 6, "EC")),
  svg(tank(26, 30, 80, 76, 0.92)
    + `<path d="M112 18 h16 v10 l4 6 v30 h-24 v-30 l4 -6 z" fill="#fff" stroke="${INK}" stroke-width="2"/>`
    + `<text x="120" y="52" text-anchor="middle" font-family="Inter, sans-serif" font-size="8" font-weight="700" fill="${ACCENT}" stroke="none">pH</text>`
    + `<path d="M92 66 q-6 8 0 12 q6 -4 0 -12" fill="${ACCENT}" stroke="none"/>`),
];

/**
 * @param {"stock" | "direct"} kind
 * @param {string[]} captions  Four captions, one per panel.
 */
export function stepArt(kind, captions) {
  const panels = kind === "stock" ? STOCK : DIRECT;
  return `<div class="s-art">${panels.map((panel, i) => `<figure class="s-art__panel">${panel}<figcaption><span class="s-art__n">${i + 1}</span>${captions[i]}</figcaption></figure>`).join("")}</div>`;
}
