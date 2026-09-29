// @ts-check
// Page chrome shared by the tool pages: header bar, footer, icons, toast, escaping.
import { currentTheme } from "./theme.js";

export const ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

export const CONTACT = "order@solsticeag.com · +1 844-420-6883";

/** @param {unknown} value */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => /** @type {Record<string, string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/**
 * Header bar: logo pair, tool name, optional language button, theme button.
 * @param {object} args
 * @param {string} args.root        Path prefix to the site root ("" or "../").
 * @param {string} [args.tool]      Tool name beside the logo.
 * @param {string} [args.home]      Link target for the logo.
 * @param {{ lang: string, label: string }} [args.lang]  Current language and the button's aria-label.
 * @param {string} [args.themeLabel]
 */
export function barHtml({ root, tool, home, lang, themeLabel = "Switch light or dark theme" }) {
  const logos = `<img class="bar__logo bar__logo--light" src="${root}assets/feed-chart/logo-dark.png" alt="Front Row Ag"><img class="bar__logo bar__logo--dark" src="${root}assets/feed-chart/logo-white.png" alt="Front Row Ag">`;
  return `<header class="bar" data-bar>`
    + (home ? `<a class="bar__home" href="${home}">${logos}</a>` : logos)
    + (tool ? `<span class="bar__tool">${esc(tool)}</span>` : "")
    + `<span class="bar__sp"></span>`
    + (lang ? `<button class="ib" data-act="lang" aria-label="${esc(lang.label)}" lang="${lang.lang === "en" ? "es" : "en"}">${lang.lang === "en" ? "ES" : "EN"}</button>` : "")
    + `<button class="ib" data-act="theme" aria-label="${esc(themeLabel)}">${currentTheme() === "dark" ? ICONS.sun : ICONS.moon}</button>`
    + `</header>`;
}

/**
 * @param {object} args
 * @param {string} [args.contact]  Line above the address.
 * @param {string} [args.back]     Link text back to the hub.
 * @param {string} [args.root]
 */
export function footHtml({ contact, back, root = "" }) {
  return `<footer class="foot">`
    + (contact ? `<div>${esc(contact)}</div>` : "")
    + `<div><b>Front Row Ag</b> · ${CONTACT} · <a href="https://www.frontrowag.com">frontrowag.com</a></div>`
    + (back ? `<div><a href="${root || "./"}">${esc(back)}</a></div>` : "")
    + `</footer>`;
}

/** Back link to the tool hub, shown above the title. */
/** @param {string} text @param {string} [root] */
export function backLinkHtml(text, root = "./") {
  return `<a class="backlink" href="${root}">${ICONS.back}${esc(text)}</a>`;
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;
/** @param {string} message */
export function toast(message) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el && el.classList.remove("show"), 2200);
}

/** Letter-sheet footer. */
/** @param {string} [right] */
export function sheetFootHtml(right = "") {
  return `<footer class="s-foot"><div><b>Front Row Ag</b> · ${CONTACT} · frontrowag.com</div><div>${esc(right)}</div></footer>`;
}

/**
 * Letter-sheet header.
 * @param {object} args
 * @param {string} args.root
 * @param {string} args.kicker
 * @param {string} args.title
 * @param {string} args.date
 * @param {string[]} [args.chips]
 */
export function sheetHeadHtml({ root, kicker, title, date, chips = [] }) {
  return `<header class="s-head"><img class="logo" src="${root}assets/feed-chart/logo-dark.png" alt="Front Row Ag">`
    + `<div class="s-title"><div class="s-kicker">${esc(kicker)}</div><h3>${esc(title)}</h3></div>`
    + `<div class="s-meta">${esc(date)}<br>tools.frontrowag.com</div></header>`
    + (chips.length ? `<div class="s-setup">${chips.map(c => `<span>${esc(c)}</span>`).join("")}</div>` : "");
}
