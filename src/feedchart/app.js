// @ts-check
// The Feed Chart app. Entry pages call mount() with their line and mode:
//   feed-calc.html        3-Part, customer
//   cplus-calc.html       Component Plus, behind the access-code gate; the team code opens team mode
//   feed-calc-admin.html  3-Part, team (custom stock strength)
import { DATA, getLine, computeFeedChart, resolveFeedSettings, formatStockTankVolume, supplementRates, isMetricUnit } from "../engine/index.js";
import { initTheme, toggleTheme, currentTheme } from "../../shared/theme.js";
import { translator, initialLang, saveLang } from "../../shared/i18n.js";
import { replaceUrl, shareUrl } from "../../shared/share.js";
import { copyText } from "../../shared/clipboard.js";
import { printDocument, fileSafe } from "../../shared/print.js";
import { gateFind, gateUnlock } from "../../shared/gate.js";
import { STRINGS } from "./strings.js";
import { decodeParams, encodeParams } from "./url.js";
import { buildView, buildSummary, esc } from "./content.js";
import { renderPrint } from "./print.js";

/** @typedef {import("../engine/data.js").LineId} LineId */
/** @typedef {import("../engine/data.js").Phase} Phase */
/** @typedef {import("../engine/settings.js").FeedSettings} FeedSettings */
/** @typedef {import("./content.js").View} View */

const ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

const PHASES = /** @type {Phase[]} */ ([...DATA.phases]);

/**
 * @param {HTMLElement} root
 * @param {{ line: LineId, mode: "customer" | "team", gate?: boolean, assets?: string }} page  Team mode always needs the team code; `gate` (C+) takes the C+ or the team code, and the team code opens it in team mode.
 */
export function mount(root, page) {
  const params = new URLSearchParams(window.location.search);
  initTheme(params);
  const base = page.assets ?? "assets/feed-chart/";
  const assets = {
    logoLight: `${base}logo-dark.png`,
    logoDark: `${base}logo-white.png`,
    qr: `${base}qr-moreinfo.png`,
  };

  /** @type {"customer" | "team"} */
  const mode = page.mode;
  const decoded = decodeParams(params, { line: page.line, mode });
  const state = {
    settings: resolveFeedSettings(decoded.input),
    facility: decoded.extras.facility,
    show: decoded.extras.show,
    lang: initialLang(params),
    sheetOpen: false,
  };
  let t = translator(STRINGS, state.lang);

  if (page.mode === "team" && !gateFind(["team"], params)) {
    renderGate();
    return;
  }
  start();


  function renderGate() {
    document.documentElement.lang = state.lang;
    root.innerHTML = `<main class="gate"><div class="card gate__card">
      <img class="bar__logo bar__logo--light" src="${assets.logoLight}" alt="Front Row Ag"><img class="bar__logo bar__logo--dark" src="${assets.logoDark}" alt="Front Row Ag">
      <h1>${esc(t("gate.team.title"))}</h1>
      <p>${esc(t("gate.team.intro"))}</p>
      <form data-gate><input class="input" name="code" placeholder="${esc(t("gate.placeholder"))}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${esc(t("gate.placeholder"))}">
      <button class="btn btn--primary" type="submit">${esc(t("gate.unlock"))}</button></form>
      <p class="gate__err" hidden>${esc(t("gate.team.error"))}</p>
      <p class="gate__foot"><a href="https://www.frontrowag.com" target="_blank" rel="noopener">frontrowag.com</a></p>
    </div></main>`;
    const form = /** @type {HTMLFormElement} */ (root.querySelector("[data-gate]"));
    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = /** @type {HTMLInputElement} */ (form.elements.namedItem("code")).value;
      if (gateUnlock(["team"], value)) {
        start();
      } else {
        /** @type {HTMLElement} */ (root.querySelector(".gate__err")).hidden = false;
      }
    });
  }

  function start() {
    root.innerHTML = `<div class="app" data-app></div>
      <div class="scrim" data-scrim hidden></div>
      <aside class="sheet-panel" data-sheet role="dialog" aria-modal="true" aria-labelledby="sheet-title" hidden></aside>
      <div class="toast" role="status" aria-live="polite" data-toast></div>
      <div class="print-root" data-print></div>`;
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("input", onInput);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && state.sheetOpen) closeSheet();
    });
    render();
  }

  // ── State changes ──

  /** @param {(input: FeedSettings) => void} mutate */
  function update(mutate) {
    const input = structuredClone(state.settings);
    mutate(input);
    state.settings = resolveFeedSettings(input);
    render();
  }

  function syncUrl() {
    replaceUrl(encodeParams(state.settings, {
      facility: state.facility, show: state.show, lang: state.lang, mode,
    }));
  }

  /** @param {string} name @param {string} value */
  function set(name, value) {
    switch (name) {
      case "application": return update(s => { s.application = /** @type {any} */ (value); });
      case "dosers": return update(s => { s.doserCount = value === "2" ? 2 : 3; });
      case "method": return update(s => { s.method = value; });
      case "ca": return update(s => { s.cplusCaStockLbPerGal = Number(value); });
      case "fp": return update(s => { s.cplusFinalPhase = /** @type {any} */ (value); });
      case "unit": return update(s => { s.unit = /** @type {any} */ (value); });
      case "preset": return update(s => { s.ecPreset = /** @type {any} */ (value); });
      case "schedule": return update(s => { s.recipeSchedule = value; });
      case "phz": return update(s => { s.usePhoszyme = !s.usePhoszyme; });
      case "show": {
        const key = /** @type {"phup" | "bf" | "tri"} */ (value);
        state.show = { ...state.show, [key]: !state.show[key] };
        return render();
      }
      case "lang":
        state.lang = state.lang === "en" ? "es" : "en";
        saveLang(state.lang);
        t = translator(STRINGS, state.lang);
        return render();
      default:
    }
  }

  // ── Events ──

  /** @param {Event} event */
  function onClick(event) {
    const target = /** @type {HTMLElement} */ (event.target).closest("[data-act], [data-set]");
    if (!target) {
      if (/** @type {HTMLElement} */ (event.target).matches("[data-scrim]")) closeSheet();
      return;
    }
    const el = /** @type {HTMLElement} */ (target);
    if (el.dataset.set) return set(el.dataset.set, el.dataset.val ?? "");
    switch (el.dataset.act) {
      case "edit": return openSheet();
      case "close": return closeSheet();
      case "theme": {
        toggleTheme();
        return renderBar();
      }
      case "pdf": return exportPdf();
      case "share": return share();
      case "copy": return copySummary();
      default:
    }
  }

  /** @param {Event} event */
  function onInput(event) {
    const el = /** @type {HTMLInputElement} */ (event.target);
    if (el.dataset.input === "facility") {
      state.facility = el.value.trim();
      renderMain();
    }
  }

  /** @param {Event} event */
  function onChange(event) {
    const el = /** @type {HTMLInputElement | HTMLSelectElement} */ (event.target);
    const name = el.dataset.input;
    if (!name) return;
    const value = el.value;
    if (name === "tank") return update(s => { s.stockTankVolumeGal = Number(value); });
    if (name.startsWith("lbs:")) {
      const role = /** @type {"partA" | "partB" | "bloom"} */ (name.slice(4));
      return update(s => { s.customLbs = { ...s.customLbs, [role]: Number(value) }; });
    }
    if (name.startsWith("ec:")) {
      const phase = /** @type {Phase} */ (name.slice(3));
      const ec = parseFloat(value);
      if (!(ec > DATA.customEc.minExclusive && ec <= DATA.customEc.max)) return render();
      return update(s => { s.ecPreset = "custom"; s.targetEc = { ...s.targetEc, [phase]: ec }; });
    }
    if (name.startsWith("rp:")) {
      const phase = /** @type {Phase} */ (name.slice(3));
      return update(s => { s.recipeSchedule = "custom"; s.phaseRecipe = { ...s.phaseRecipe, [phase]: value }; });
    }
  }

  // ── Rendering ──

  function view() {
    const chart = computeFeedChart(state.settings);
    return buildView(chart, t, { facility: state.facility, show: state.show, lang: state.lang, mode });
  }

  function render() {
    document.documentElement.lang = state.lang;
    renderMain();
    if (state.sheetOpen) renderSheet();
  }

  function renderBar() {
    const bar = root.querySelector("[data-bar]");
    if (bar) bar.outerHTML = barHtml();
  }

  function barHtml() {
    const dark = currentTheme() === "dark";
    return `<header class="bar" data-bar>
      <img class="bar__logo bar__logo--light" src="${assets.logoLight}" alt="Front Row Ag"><img class="bar__logo bar__logo--dark" src="${assets.logoDark}" alt="Front Row Ag">
      <span class="bar__tool">${esc(t("tool.name"))}</span><span class="bar__sp"></span>
      <button class="ib" data-set="lang" aria-label="${esc(t("lang.toggleLabel"))}" lang="${state.lang === "en" ? "es" : "en"}">${state.lang === "en" ? "ES" : "EN"}</button>
      <button class="ib" data-act="theme" aria-label="${esc(t("theme.toggle"))}">${dark ? ICONS.sun : ICONS.moon}</button>
    </header>`;
  }

  function renderMain() {
    const v = view();
    const app = /** @type {HTMLElement} */ (root.querySelector("[data-app]"));
    app.innerHTML = barHtml()
      + (mode === "team" ? `<p class="banner">${esc(t("team.banner"))}</p>` : "")
      + `<h1 class="title">${esc(v.title)}</h1><p class="lede">${esc(v.lede)}</p>`
      + `<section class="card setup"><div class="setup__chips">${v.chips.map(chip => `<span class="chip">${esc(chip)}</span>`).join("")}</div>`
      + `<button class="edit-btn" data-act="edit" aria-haspopup="dialog">${ICONS.edit}${esc(t("action.edit"))}</button></section>`
      + `<div class="sec"><h2>${esc(t("sec.schedule"))}</h2><span class="sec__u">${esc(v.unitCaption)}</span></div>`
      + chartRows(v) + chartWide(v)
      + v.chartNotes.map(n => `<div class="card note${n.kind === "warn" ? " note--warn" : ""}"><span class="note__ic">${n.kind === "warn" ? "!" : "i"}</span><div>${esc(n.text)}</div></div>`).join("")
      + phNote(v)
      + `<div class="actions">
          <button class="btn btn--primary" data-act="pdf">${ICONS.pdf}${esc(t("action.exportPdf"))}</button>
          <button class="btn" data-act="share" aria-label="${esc(t("action.share"))}">${ICONS.link}<span class="btn__label">${esc(t("action.share"))}</span></button>
          <button class="btn" data-act="copy" aria-label="${esc(t("action.copy"))}">${ICONS.copy}<span class="btn__label">${esc(t("action.copy"))}</span></button>
        </div>`
      + tanksSection(v)
      + stepsSection(v)
      + suppsSection(v)
      + `<footer class="foot"><div>${esc(t("foot.contact"))}</div><div><b>Front Row Ag</b> · order@solsticeag.com · +1 844-420-6883 · <a href="https://www.frontrowag.com">frontrowag.com</a></div><div><a href="./">${esc(t("foot.back"))}</a></div></footer>`;
    /** @type {HTMLElement} */ (root.querySelector("[data-print]")).innerHTML = renderPrint(v, t, { logo: assets.logoLight, qr: assets.qr });
    syncUrl();
  }

  /** @param {View} v */
  function chartRows(v) {
    const head = `<tr><th>${esc(t("chart.phase"))}</th><th>${esc(t("chart.ec"))}</th>${v.rows.map(row => `<th class="${row.cls}"><span class="dot"></span><span class="th-name">${esc(row.short)}</span></th>`).join("")}</tr>`;
    const body = v.phases.map((p, i) => {
      const bar = v.bars[i];
      const cells = v.rows.map(row => {
        const cell = row.cells[i];
        if (!cell || cell.dash) return `<td><span class="dash">–</span></td>`;
        return `<td class="pc ${row.cls}"><div class="v num">${esc(cell.display)}</div><div class="s num">${esc(cell.ecText)}</div></td>`;
      }).join("");
      const sub = p.served
        ? `<div class="rc">${esc(p.recipe)}</div>${p.ph ? `<div class="phr">${esc(t("chart.ph", { range: p.ph.text }))}</div>` : ""}`
        : `<div class="rc">${esc(t("chart.notServed"))}</div>`;
      return `<tr class="${p.served ? "" : "off"}"><td><div class="ph">${esc(p.short)}</div>${sub}${bar ? barHtml2(bar, 92) : ""}</td><td><div class="ec num">${p.served ? esc(p.ec) : "–"}</div></td>${cells}</tr>`;
    }).join("");
    return `<div class="card chart chart--rows"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  /** @param {{ widthPct: number, segments: Array<{ cls: string, ec: number }> }} bar @param {number} maxPx */
  function barHtml2(bar, maxPx) {
    return `<div class="mix" style="width:${Math.round(bar.widthPct * maxPx / 100)}px" aria-hidden="true">${bar.segments.map(seg => `<i class="${seg.cls}" style="flex:${seg.ec.toFixed(3)}"></i>`).join("")}</div>`;
  }

  /** @param {View} v */
  function chartWide(v) {
    const head = `<tr><th></th>${v.phases.map(p => `<th>${esc(p.short)}</th>`).join("")}</tr>`;
    const recipe = `<tr class="rec"><th>${esc(t("chart.recipe"))}</th>${v.phases.map(p => `<td>${p.served ? esc(p.recipe) : `<span class="dash">${esc(t("chart.notServed"))}</span>`}</td>`).join("")}</tr>`;
    const ec = `<tr class="ecr"><th>${esc(t("chart.targetEc"))}</th>${v.phases.map((p, i) => `<td><span class="num">${p.served ? esc(p.ec) : "–"}</span>${v.bars[i] ? barHtml2(/** @type {any} */ (v.bars[i]), 110) : ""}</td>`).join("")}</tr>`;
    const parts = v.rows.map(row => `<tr class="${row.cls}"><th class="pc"><span class="dot"></span> ${esc(row.label)}</th>${row.cells.map(cell => (!cell || cell.dash
      ? `<td><span class="dash">–</span></td>`
      : `<td class="pc"><div class="v num">${esc(cell.display)}</div><div class="s num">${esc(cell.ecText)} EC</div></td>`)).join("")}</tr>`).join("");
    const ph = `<tr class="phrow"><th>${esc(t("chart.dripperPh"))}</th>${v.phases.map(p => `<td class="num">${p.ph ? esc(p.ph.text) : "–"}</td>`).join("")}</tr>`;
    return `<div class="card chart chart--wide"><table><thead>${head}</thead><tbody>${recipe}${ec}${parts}${ph}</tbody></table></div>`;
  }

  /** @param {View} v */
  function phNote(v) {
    return `<div class="card note"><span class="note__ic">pH</span><div><b>${esc(t("ph.title"))}.</b> ${esc(v.phNote.body)} ${esc(v.phNote.warm)}</div></div>`;
  }

  /** @param {View} v */
  function tanksSection(v) {
    if (!v.tanks.length) return "";
    return `<div class="sec"><h2>${esc(t("sec.tanks"))}</h2><span class="sec__u">${esc(v.tanksVolText)}</span></div>`
      + `<div class="tanks">${v.tanks.map(tank => `<div class="card tank ${tank.cls}">
          <span class="tank__tag">${tank.n}</span>
          <span class="tank__n">${esc(tank.name)}</span>
          ${tank.conc ? `<span class="tank__big"><span class="v num">${esc(tank.weight)}</span></span>` : ""}
          ${tank.conc ? `<span class="tank__d"><span class="num">${esc(tank.conc)}</span> · ${esc(tank.validates)}</span>` : `<span class="tank__d">${esc(tank.weight)}</span><span class="tank__d"><b>${esc(tank.validates)}</b></span>`}
          ${tank.extra ? `<span class="tank__adds">${esc(tank.extra)}</span>` : ""}
        </div>`).join("")}</div>`
      + `<p class="sec__foot">${esc(v.validationLine)}</p>`;
  }

  /** @param {View} v */
  function stepsSection(v) {
    const stockMode = v.settings.application === "stock";
    const list = `<div class="steps"><ol>${v.steps.map(step => `<li>${esc(step)}</li>`).join("")}</ol></div>`;
    const notes = `<div class="steps steps--notes"><ul>${v.notes.map(note => `<li>${esc(note)}</li>`).join("")}</ul></div>`;
    if (stockMode) {
      return `<details class="card fold"><summary>${esc(t("sec.mix"))}</summary>${list}<div class="fold__h">${esc(t("sec.notes.stock"))}</div>${notes}</details>`;
    }
    return `<div class="sec"><h2>${esc(t("sec.mix"))}</h2></div><div class="card">${list}</div>`
      + `<details class="card fold"><summary>${esc(t("sec.notes.direct"))}</summary>${notes}</details>`;
  }

  /** @param {View} v */
  function suppsSection(v) {
    const shown = v.supplements.filter(sup => sup.shown);
    return `<div class="sec"><h2>${esc(t("sec.supps"))}</h2></div><div class="card supps">`
      + shown.map(sup => `<div class="supp"><span class="supp__n">${esc(sup.name)}</span><span class="supp__r num">${esc(sup.rate)}</span><span class="supp__d">${esc(sup.note)}</span></div>`).join("")
      + (shown.length < v.supplements.length ? `<div class="supp supp--hint"><span class="supp__d">${esc(t("supps.hint"))}</span></div>` : "")
      + `</div>`;
  }

  // ── Edit sheet ──

  function openSheet() {
    state.sheetOpen = true;
    const sheet = /** @type {HTMLElement} */ (root.querySelector("[data-sheet]"));
    const scrim = /** @type {HTMLElement} */ (root.querySelector("[data-scrim]"));
    renderSheet();
    sheet.hidden = false;
    scrim.hidden = false;
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(() => {
      sheet.classList.add("open");
      scrim.classList.add("open");
      /** @type {HTMLElement | null} */ (sheet.querySelector("[data-act=close]"))?.focus();
    });
  }

  function closeSheet() {
    state.sheetOpen = false;
    const sheet = /** @type {HTMLElement} */ (root.querySelector("[data-sheet]"));
    const scrim = /** @type {HTMLElement} */ (root.querySelector("[data-scrim]"));
    sheet.classList.remove("open");
    scrim.classList.remove("open");
    document.documentElement.style.overflow = "";
    setTimeout(() => {
      if (!state.sheetOpen) { sheet.hidden = true; scrim.hidden = true; }
    }, 250);
    /** @type {HTMLElement | null} */ (root.querySelector("[data-act=edit]"))?.focus();
  }

  /**
   * @param {string} name
   * @param {Array<[string, string]>} options  [value, label]
   * @param {string} current
   * @param {boolean} [wrap]
   */
  function seg(name, options, current, wrap = false) {
    return `<div class="seg${wrap ? " seg--wrap" : ""}" role="group">${options.map(([value, label]) =>
      `<button type="button" data-set="${name}" data-val="${esc(value)}" aria-pressed="${value === current}">${esc(label)}</button>`).join("")}</div>`;
  }

  /** @param {string[]} paragraphs */
  function help(paragraphs) {
    return `<details><summary>${esc(t("help.more"))}</summary><div class="field__help">${paragraphs.map(p => `<p>${esc(p)}</p>`).join("")}</div></details>`;
  }

  /** @param {string} label @param {string} body */
  function field(label, body) {
    return `<div class="field"><div class="field__label">${esc(label)}</div>${body}</div>`;
  }

  function renderSheet() {
    const sheet = /** @type {HTMLElement} */ (root.querySelector("[data-sheet]"));
    const focusedId = /** @type {HTMLElement | null} */ (document.activeElement)?.dataset?.input ?? null;
    const body = sheet.querySelector(".sheet-panel__body");
    const scroll = body ? body.scrollTop : 0;
    const s = state.settings;
    const line = getLine(s.line);
    const stockMode = s.application === "stock";
    const twoDoser = s.doserCount === 2;
    const team = mode === "team";

    /** @type {string[]} */
    const fields = [];
    fields.push(field(t("field.facility"),
      `<input class="input" data-input="facility" value="${esc(state.facility)}" placeholder="${esc(t("field.facilityPlaceholder"))}" autocomplete="organization" maxlength="80"><p class="field__help">${esc(t("field.facilityHelp"))}</p>`));
    fields.push(field(t("field.application"),
      seg("application", [["stock", t("opt.stock")], ["direct", t("opt.direct")]], s.application)
      + help([t("help.application.stock"), t("help.application.direct")])));

    if (stockMode) {
      fields.push(field(t("field.dosers"),
        seg("dosers", [["3", t("opt.dosers3")], ["2", t("opt.dosers2")]], String(s.doserCount))
        + help([t(`help.dosers.${s.line}.3`), t(`help.dosers.${s.line}.2`)])));
    }

    if (stockMode && !twoDoser && s.line === "3part") {
      const methods = team ? ["4-3-3", "3-2-2", "1-1-1", "custom"] : ["3-2-2", "1-1-1", ...(s.method === "4-3-3" ? ["4-3-3"] : [])];
      fields.push(field(t("field.method"),
        seg("method", methods.map(m => [m, m === "custom" ? t("opt.custom") : m]), s.method)
        + help(methods.map(m => t(`help.method.${m}`)))));
    }
    if (stockMode && !twoDoser && s.line === "cplus") {
      fields.push(field(t("field.method"), team
        ? seg("method", [["1-1-1", "1-1-1"], ["custom", t("opt.custom")]], s.method) + help([t("help.method.cplus"), t("help.method.custom")])
        : `<p class="field__help">${esc(t("help.method.cplus"))}</p>`));
    }

    const showTank = stockMode && (s.line === "cplus" || twoDoser || s.method === "custom");
    if (showTank) {
      const tankHelp = s.line === "cplus" ? t("help.tank.cplus") : twoDoser ? t("help.tank.3part") : t("help.tank.custom");
      fields.push(field(t("field.tankSize"),
        `<div class="input-row"><input class="input num" data-input="tank" type="number" inputmode="decimal" min="${line.stockTankVolume.minGal}" step="0.5" value="${esc(formatStockTankVolume(s.line, s.stockTankVolumeGal))}" aria-label="${esc(t("field.tankSize"))}"><span>${esc(t("field.tankUnit"))}</span></div>`
        + `<p class="field__help">${esc(tankHelp)} ${esc(t("help.tank.min", { min: line.stockTankVolume.minGal }))}</p>`));
    }
    if (stockMode && !twoDoser && team && s.method === "custom") {
      const caps = line.customStock.maxLbPerGal;
      fields.push(field(t("field.customLbs"),
        `<div class="grid3">${/** @type {const} */ (["partA", "partB", "bloom"]).map(role => `<div><label for="lbs-${role}">${esc(line.fullNames[role])}</label><input class="input num" id="lbs-${role}" data-input="lbs:${role}" type="number" inputmode="decimal" step="0.1" value="${esc(s.customLbs[role])}"></div>`).join("")}</div>`
        + `<p class="field__help">${esc(t("field.lbCharged"))}. ${esc(t("help.customLbs", { a: caps.partA, b: caps.partB, bl: caps.bloom, names: [line.stockNames.partA, line.stockNames.partB, line.stockNames.bloom].join(" / ") }))}</p>`));
    }
    if (stockMode && twoDoser && s.line === "cplus") {
      fields.push(field(t("field.caStock"),
        seg("ca", DATA.lines.cplus.twoDoser.caStockOptions.map(o => [String(o), t(`opt.ca.${o}`)]), String(s.cplusCaStockLbPerGal), true)
        + `<p class="field__help">${esc(t("help.caStock"))}</p>`));
      fields.push(field(t("field.finalPhase"),
        seg("fp", DATA.lines.cplus.twoDoser.finalPhaseOptions.map(o => [o, t(`opt.fp.${o}`)]), s.cplusFinalPhase)
        + `<p class="field__help">${esc(t("help.finalPhase"))}</p>`));
    }

    const units = /** @type {readonly string[]} */ (stockMode ? DATA.feedUnits.stock : DATA.feedUnits.direct);
    fields.push(field(t("field.units"), seg("unit", units.map(u => [u, t(`unit.${u}`)]), s.unit, true)));

    fields.push(field(t("field.ec"),
      seg("preset", [["high", t("opt.high")], ["standard", t("opt.standard")], ["custom", t("opt.custom")]], s.ecPreset)
      + `<div class="grid5" style="margin-top:10px">${PHASES.map((phase, i) => `<div><label for="ec-${phase}">${esc(t(`phase.short.${i}`))}</label><input class="input num" id="ec-${phase}" data-input="ec:${phase}" type="number" inputmode="decimal" step="0.1" min="0.1" max="10" value="${esc(Number(s.targetEc[phase]).toFixed(1))}"></div>`).join("")}</div>`
      + `<p class="field__help">${esc(t("help.ec"))}</p>`));

    if (twoDoser) {
      fields.push(field(t("field.schedule"), `<p class="field__help">${esc(t(`help.schedule.locked.${s.line}`))}</p>`));
    } else {
      const schedules = [["commercial", t("opt.schedule.commercial")], ["swell-flower", t("opt.schedule.swell-flower")]];
      if (s.recipeSchedule === "custom") schedules.push(["custom", t("opt.schedule.custom")]);
      fields.push(field(t("field.schedule"),
        seg("schedule", /** @type {Array<[string, string]>} */ (schedules), s.recipeSchedule)
        + `<div class="grid5" style="margin-top:10px">${PHASES.map((phase, i) => `<div><label for="rp-${phase}">${esc(t(`phase.short.${i}`))}</label><select class="input" id="rp-${phase}" data-input="rp:${phase}">${line.recipeNames.map(name => `<option${name === s.phaseRecipe[phase] ? " selected" : ""}>${esc(name)}</option>`).join("")}</select></div>`).join("")}</div>`
        + help([t("help.schedule.commercial"), t("help.schedule.swell-flower"), t("help.schedule.custom")])
        + `<p class="field__help">${esc(t("foot.contact"))}</p>`));
    }

    const rates = supplementRates(isMetricUnit(s.unit));
    const phupRates = { inc: rates.phUpIncrement, unit: rates.phUpUnit, wait: rates.phUpWaitMinutes, max: rates.phUpMax, stop: rates.phUpHighStrengthFlowerStop };
    fields.push(field(t("field.supps"),
      `<div class="toggles">`
      + `<button type="button" class="tog" data-set="phz" aria-pressed="${s.usePhoszyme}">${esc(t("opt.phz"))}</button>`
      + `<button type="button" class="tog" data-set="show" data-val="phup" aria-pressed="${state.show.phup}">${esc(t("opt.phup"))}</button>`
      + `<button type="button" class="tog" data-set="show" data-val="bf" aria-pressed="${state.show.bf}">${esc(t("opt.bioflo"))}</button>`
      + `<button type="button" class="tog" data-set="show" data-val="tri" aria-pressed="${state.show.tri}">${esc(t("opt.tri"))}</button>`
      + `</div><p class="field__help">${esc(t("help.supps"))}</p>`
      + help([t(`help.phz.${s.line}`), t("help.phup", phupRates), t("help.bioflo"), t("help.tri"), t("help.si")])));

    sheet.innerHTML = `<div class="sheet-panel__grab"></div>
      <div class="sheet-panel__head"><h2 id="sheet-title">${esc(t("edit.title"))}</h2><button class="ib" data-act="close" aria-label="${esc(t("action.close"))}">${ICONS.close}</button></div>
      <div class="sheet-panel__body">${fields.join("")}</div>
      <div class="sheet-panel__foot"><button class="btn btn--primary" data-act="close">${esc(t("action.done"))}</button></div>`;
    const newBody = sheet.querySelector(".sheet-panel__body");
    if (newBody) newBody.scrollTop = scroll;
    if (focusedId) /** @type {HTMLElement | null} */ (sheet.querySelector(`[data-input="${CSS.escape(focusedId)}"]`))?.focus();
  }

  // ── Actions ──

  /** @param {string} message */
  function toast(message) {
    const el = /** @type {HTMLElement} */ (root.querySelector("[data-toast]"));
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(/** @type {any} */ (el).timer);
    /** @type {any} */ (el).timer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function exportPdf() {
    const name = fileSafe(["Front Row Ag", t(`lines.${state.settings.line}`), t("print.feedChart"), state.facility].filter(Boolean).join(" - "));
    printDocument(name);
  }

  async function share() {
    const result = await shareUrl(window.location.href, `${t("summary.title")} · ${t(`lines.${state.settings.line}`)}`);
    if (result === "copied") toast(t("toast.linkCopied"));
    if (result === "failed") toast(t("toast.failed"));
  }

  async function copySummary() {
    const { plain, html } = buildSummary(view(), t, window.location.href);
    toast(t((await copyText(plain, html)) ? "toast.copied" : "toast.failed"));
  }
}
