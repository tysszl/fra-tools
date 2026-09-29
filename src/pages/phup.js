// @ts-check
// pH Up calculator: target pH and pH Up (potassium carbonate) dose for each column of
// the feed chart, from the engine's refit curves and per-column dripper ceilings.
import { DATA, getLine, phUpDose, phUpDoseTo59, phUpStockMlPerGal, phUpStockPercent } from "../engine/index.js";
import { initTheme, toggleTheme } from "../../shared/theme.js";
import { replaceUrl, shareUrl } from "../../shared/share.js";
import { copyText } from "../../shared/clipboard.js";
import { printDocument } from "../../shared/print.js";
import { ICONS, backLinkHtml, barHtml, esc, footHtml, sheetFootHtml, sheetHeadHtml, toast } from "../../shared/chrome.js";

/** @typedef {import("../engine/data.js").LineId} LineId */
/** @typedef {import("../engine/data.js").Phase} Phase */

const PHASES = /** @type {Phase[]} */ ([...DATA.phases]);
const SHORT = DATA.phaseLabels.summary;
const LONG = DATA.phaseLabels.print;
const TARGETS = [5.5, 5.6, 5.7, 5.8, 5.9, 6.0];
const RULE = DATA.phUp;
const MAX = RULE.maxGPerGal;
const WAIT = DATA.supplements.phUp.waitMinutes;
const STEP = DATA.supplements.phUp.incrementGPerGal;
const RECIPE_COLOR = /** @type {Record<string, string>} */ ({ Veg: "var(--c-a)", Stretch: "var(--c-b)", Stack: "var(--c-phz)", Swell: "var(--c-bl)", Ripen: "var(--ink-2)" });
const PRINT_COLOR = /** @type {Record<string, string>} */ ({ Veg: "#2e7d4a", Stretch: "#2f62b0", Stack: "#8a6d1f", Swell: "#c0262d", Ripen: "#353b39" });

const COPY = {
  lede: "Target pH and Front Row pH Up dose for each column of your feed chart.",
  ceiling: [
    "Above a certain pH, calcium phosphate starts coming out of solution. That is the scale that clogs lines and emitters.",
    "Where that line sits depends on the recipe and its EC. Flower recipes carry 3–4× the phosphate of Veg, so at high-strength ECs they reach it around pH 5.7–5.8 while Veg still has room at 6.0. Each column shows the dripper pH range from your feed chart and defaults to a target 0.1 below its top, never above 5.9.",
    "If you need more pH Up than a column recommends, don't push the target up. Check your meter calibration, measure at the dripper, and contact your Sales Rep or retailer.",
  ],
  measure: [
    "Calibrate your meter the same day (pH 4.0 and 7.0 buffers), then measure at the dripper or in the batch tank. Readings at the fertigation skid are expected to run low, especially at high flow.",
    `In a batch tank, wait ${WAIT[0]}–${WAIT[1]} minutes between adding pH Up and checking. A fresh tank on alkaline source water can read lower than the lines until its dissolved CO2 gasses off.`,
  ],
  water: [
    "Doses assume RO water. If your water has alkalinity (tap, well, or aging RO), enter it: every 19 ppm of alkalinity (as CaCO3) supplies the same base as 0.1 g/gal of pH Up, and the calculator subtracts it.",
    "Above about 20 ppm, review your water treatment before dosing. Some recipes need little or no pH Up at that level, and some need acid instead (see the pH Down calculator). Confirm at the dripper with a calibrated meter.",
    "As RO membranes age they pass more alkalinity, so pH Up demand drops over time with no change to the recipe. Measure the permeate's alkalinity (a KH drop kit works) and update the field. Don't change the target: the right target depends on the recipe and EC, not the water.",
  ],
  steps: [
    `Add pH Up in steps of about ${STEP} g/gal (dissolved in water first), mixing between additions.`,
    `Wait ${WAIT[0]}–${WAIT[1]} minutes, then check pH before adding more.`,
    "Stop at the target. Confirm at the dripper with a calibrated meter.",
    `Keep the dose at or under ${MAX} g/gal. If you need more, check the meter and the source water before adding more.`,
  ],
  alkHigh: "Your source water is above about 20 ppm alkalinity. Review your water treatment before dosing: some columns may need acid instead of pH Up (see the pH Down calculator).",
  warm: "Warm lines: each column's range is taken 0.08 pH lower, and targets follow it.",
  atLine: "{cols} at the calcium-phosphate line at this EC. Keep lines cool and aim for 5.5.",
};

/** @param {string | null} v @param {number} lo @param {number} hi */
function numParam(v, lo, hi) {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

/** @param {string} r */
function cap(r) { return r ? r[0].toUpperCase() + r.slice(1).toLowerCase() : r; }

/** @param {HTMLElement} root */
export function mount(root) {
  const params = new URLSearchParams(window.location.search);
  initTheme(params);

  /** @type {LineId} */
  const line0 = params.get("line") === "cplus" ? "cplus" : "3part";
  const state = {
    line: line0,
    preset: /** @type {"high" | "standard" | "custom"} */ (params.get("p") === "standard" ? "standard" : "high"),
    schedule: params.get("rs") === "swell-flower" ? "swell-flower" : "commercial",
    /** @type {Record<Phase, number>} */
    ec: { ...DATA.ecPresets.high },
    /** @type {Record<Phase, string>} */
    recipe: /** @type {any} */ ({}),
    customRecipes: false,
    /** @type {Record<Phase, number | null>} */
    target: { Veg: null, Stretch: null, Stack: null, Swell: null, Ripen: null },
    mode: params.get("mode") === "stock" ? "stock" : "dtr",
    reservoir: numParam(params.get("res"), 0.1, 1e7) ?? RULE.defaultReservoirGal,
    conc: ["20", "100", "custom"].includes(params.get("conc") ?? "") ? /** @type {string} */ (params.get("conc")) : "20",
    custom: numParam(params.get("custom"), RULE.customStock.min, RULE.customStock.max) ?? RULE.customStock.defaultGPerGal,
    unit: ["pct", "percent"].includes(params.get("unit") ?? "") ? "pct" : "mlgal",
    alk: numParam(params.get("alk"), 0, 500) ?? 0,
    warm: params.get("warm") === "1",
    sheetOpen: false,
  };
  state.ec = { ...DATA.ecPresets[state.preset === "standard" ? "standard" : "high"] };
  applySchedule();
  PHASES.forEach((phase, i) => {
    const e = numParam(params.get(`e${i}`), 0.1, 10);
    if (e !== null && e !== state.ec[phase]) { state.ec[phase] = e; state.preset = "custom"; }
    const r = cap(params.get(`r${i}`) ?? "");
    if (r && getLine(state.line).recipeNames.includes(r) && r !== state.recipe[phase]) { state.recipe[phase] = r; state.customRecipes = true; }
    const t = numParam(params.get(`t${i}`), 5.5, 6.0);
    if (t !== null) state.target[phase] = Math.round(t * 10) / 10;
  });

  function applySchedule() {
    const schedules = /** @type {Record<string, Record<Phase, string>>} */ (getLine(state.line).schedules);
    state.recipe = { ...schedules[state.schedule] };
    state.customRecipes = false;
  }

  function stockGPerGal() {
    return state.conc === "custom" ? state.custom : Number(state.conc);
  }

  function columns() {
    return PHASES.map((phase, i) => {
      const d = phUpDose({
        line: state.line, recipe: state.recipe[phase], ec: state.ec[phase],
        target: state.target[phase] ?? undefined, alkPpm: state.alk, warm: state.warm,
      });
      const manual = state.target[phase] !== null;
      let value, unit, sub;
      if (state.mode === "dtr") {
        value = d.gPerGal.toFixed(RULE.doseDecimals);
        unit = "g/gal";
        sub = `${fmtGrams(d.gPerGal * state.reservoir)} per ${fmtNum(state.reservoir)} gal`;
      } else if (state.unit === "pct") {
        value = phUpStockPercent(d.gPerGal, stockGPerGal()).toFixed(3);
        unit = "% injection";
        sub = `${d.gPerGal.toFixed(RULE.doseDecimals)} g/gal`;
      } else {
        value = phUpStockMlPerGal(d.gPerGal, stockGPerGal()).toFixed(1);
        unit = "mL/gal";
        sub = `${d.gPerGal.toFixed(RULE.doseDecimals)} g/gal`;
      }
      /** @type {string[]} */
      const warnings = [];
      if (d.overCeiling) warnings.push("Target is above this column's dripper range");
      if (d.overMax) warnings.push(`Above the ${MAX} g/gal pH Up maximum`);
      if (d.outsideFit) warnings.push(`Outside the modeled EC range (${RULE.fitEc[0].toFixed(1)}–${RULE.fitEc[1].toFixed(1)})`);
      if (d.gPerGal === 0 && d.gross > 0) warnings.push("No pH Up needed: the source water supplies it");
      const range = d.range[1] <= d.range[0] ? d.range[0].toFixed(1) : `${d.range[0].toFixed(1)}–${d.range[1].toFixed(1)}`;
      return { phase, i, short: SHORT[i], long: LONG[i], d, manual, value, unit, sub, warnings, range };
    });
  }

  /** @param {number} n */
  function fmtNum(n) { return Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 }); }
  /** @param {number} g */
  function fmtGrams(g) { return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${g.toFixed(1)} g`; }

  function chips() {
    const lineLabel = getLine(state.line).label;
    const strength = state.preset === "high" ? "High strength" : state.preset === "standard" ? "Standard strength" : "Custom EC";
    const schedule = state.customRecipes ? "Custom recipes" : state.schedule === "commercial" ? "Commercial (Stack → Swell)" : "Swell Through Flower";
    const delivery = state.mode === "dtr"
      ? `Direct to reservoir · ${fmtNum(state.reservoir)} gal`
      : `Stock · ${stockGPerGal()} g/gal`;
    return [lineLabel, strength, schedule, delivery, state.alk > 0 ? `Source water ${state.alk} ppm` : "RO water", ...(state.warm ? ["Warm lines"] : [])];
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.line === "cplus") p.set("line", "cplus");
    if (state.preset === "standard") p.set("p", "standard");
    if (state.schedule !== "commercial") p.set("rs", state.schedule);
    p.set("mode", state.mode);
    if (state.mode === "dtr") p.set("res", String(state.reservoir));
    else {
      p.set("conc", state.conc);
      if (state.conc === "custom") p.set("custom", String(state.custom));
      p.set("unit", state.unit);
    }
    if (state.alk > 0) p.set("alk", String(state.alk));
    if (state.warm) p.set("warm", "1");
    const preset = state.preset === "custom" ? null : DATA.ecPresets[state.preset];
    const schedules = /** @type {Record<string, Record<Phase, string>>} */ (getLine(state.line).schedules);
    PHASES.forEach((phase, i) => {
      if (!preset || preset[phase] !== state.ec[phase]) p.set(`e${i}`, String(state.ec[phase]));
      if (state.recipe[phase] !== schedules[state.schedule][phase]) p.set(`r${i}`, state.recipe[phase].toLowerCase());
      if (state.target[phase] !== null) p.set(`t${i}`, String(state.target[phase]));
    });
    replaceUrl(p);
  }

  // ── Main view ──

  function chartRowsHtml(cols) {
    const head = `<tr><th>Column</th><th>Target pH</th><th>pH Up</th></tr>`;
    const body = cols.map(c => `<tr>
        <td><div class="ph">${esc(c.short)}</div><div class="rc">${esc(c.d.recipe)} · <span class="num">${c.d.ec.toFixed(1)}</span> EC</div></td>
        <td><div class="tgt num${c.manual ? " tgt--manual" : ""}">${c.d.target.toFixed(1)}</div><div class="phr num${c.d.atLine ? " at-line" : ""}">${esc(c.range)}</div></td>
        <td><div class="v num">${esc(c.value)}</div><div class="s">${esc(c.unit)}</div><div class="s num">${esc(c.sub)}</div>${c.warnings.map(w => `<span class="warnline">${esc(w)}</span>`).join("")}</td>
      </tr>`).join("");
    return `<div class="card chart chart--rows"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  function chartWideHtml(cols) {
    const head = `<tr><th></th>${cols.map(c => `<th>${esc(c.short)}</th>`).join("")}</tr>`;
    const row = (label, cls, cells) => `<tr class="${cls}"><th>${esc(label)}</th>${cells.join("")}</tr>`;
    return `<div class="card chart chart--wide"><table><thead>${head}</thead><tbody>`
      + row("Recipe", "rec", cols.map(c => `<td>${esc(c.d.recipe)}</td>`))
      + row("Target EC", "ecr", cols.map(c => `<td class="num">${c.d.ec.toFixed(1)}</td>`))
      + row("Dripper pH", "phrow", cols.map(c => `<td class="num${c.d.atLine ? " at-line" : ""}">${esc(c.range)}</td>`))
      + row("Target pH", "phrow", cols.map(c => `<td><span class="tgt num${c.manual ? " tgt--manual" : ""}">${c.d.target.toFixed(1)}</span></td>`))
      + row(`pH Up (${cols[0].unit})`, "", cols.map(c => `<td><div class="v num">${esc(c.value)}</div><div class="s num">${esc(c.sub)}</div>${c.warnings.map(w => `<span class="warnline">${esc(w)}</span>`).join("")}</td>`))
      + `</tbody></table></div>`;
  }

  /** Dose to pH 5.9 against EC for each recipe of the line, with the chart's columns marked. */
  function plotSvg(cols, forPrint = false) {
    const W = 520, H = 300, L = 50, R = 10, T = 14, B = 46;
    const [e0, e1] = RULE.fitEc;
    const recipes = getLine(state.line).recipeNames;
    const yMax = Math.ceil(Math.max(...recipes.map(r => phUpDoseTo59(state.line, r, e1))) * 10) / 10;
    const x = (/** @type {number} */ e) => L + (e - e0) / (e1 - e0) * (W - L - R);
    const y = (/** @type {number} */ g) => H - B - g / yMax * (H - T - B);
    const color = forPrint ? PRINT_COLOR : RECIPE_COLOR;
    let svg = `<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="pH Up dose to pH 5.9 by EC for each recipe">`;
    for (let g = 0; g <= yMax + 1e-9; g += 0.1) {
      svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" ${forPrint ? 'stroke="#e4e7e5"' : ""}/><text x="${L - 6}" y="${y(g) + 5}" text-anchor="end" font-size="15" ${forPrint ? 'fill="#6b726f"' : ""}>${g.toFixed(1)}</text>`;
    }
    for (let e = e0; e <= e1 + 1e-9; e += 0.5) {
      svg += `<text x="${x(e)}" y="${H - B + 20}" text-anchor="middle" font-size="15" ${forPrint ? 'fill="#6b726f"' : ""}>${e.toFixed(1)}</text>`;
    }
    svg += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" font-size="15" ${forPrint ? 'fill="#6b726f"' : ""}>EC</text>`;
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(MAX)}" y2="${y(MAX)}" stroke="${forPrint ? "#8a5a00" : "var(--warn)"}" stroke-dasharray="4 4"/><text x="${L + 6}" y="${y(MAX) - 6}" text-anchor="start" font-size="15" ${forPrint ? 'fill="#8a5a00"' : 'style="fill:var(--warn)"'}>${MAX} g/gal max</text>`;
    recipes.forEach(r => {
      const pts = [];
      for (let e = e0; e <= e1 + 1e-9; e += 0.05) pts.push(`${x(e).toFixed(1)},${y(phUpDoseTo59(state.line, r, e)).toFixed(1)}`);
      svg += `<polyline class="curve" points="${pts.join(" ")}" stroke="${color[r]}" fill="none" stroke-width="2"/>`;
    });
    cols.forEach(c => {
      if (c.d.ec < e0 || c.d.ec > e1) return;
      svg += `<circle cx="${x(c.d.ec)}" cy="${y(c.d.to59)}" r="4.5" fill="${color[c.d.recipe]}" stroke="${forPrint ? "#fff" : "var(--surface)"}" stroke-width="2"/>`;
    });
    const legend = `<div class="legend">${recipes.map(r => `<span><i style="background:${color[r]}"></i>${esc(r)}</span>`).join("")}</div>`;
    return svg + `</svg>` + legend;
  }

  function techHtml(cols) {
    const curves = /** @type {Record<string, readonly number[]>} */ (RULE.curves[state.line]);
    return `<div class="prose">
      <p>Doses come from a chemistry model (PHREEQC) of the Front Row Ag recipes, checked against in-house trials: Stack at 3.0 EC needs about 0.20 g/gal and Swell at 3.0 about 0.25 g/gal to reach pH 5.9 on RO water.</p>
      <p><b>Dose to pH 5.9</b> = k × EC<sup>n</sup> g/gal, for EC ${RULE.fitEc[0].toFixed(1)}–${RULE.fitEc[1].toFixed(1)}. The dots mark your chart's columns.</p>
      ${plotSvg(cols)}
      <table><thead><tr><th>Recipe</th><th>k</th><th>n</th><th>At 3.0 EC</th></tr></thead><tbody>${Object.entries(curves).map(([r, [k, n]]) =>
        `<tr><td>${esc(r)}</td><td class="num">${k.toFixed(5)}</td><td class="num">${n.toFixed(4)}</td><td class="num">${phUpDoseTo59(state.line, r, 3).toFixed(3)} g/gal</td></tr>`).join("")}</tbody></table>
      <p style="margin-top:12px"><b>Other targets</b> scale the 5.9 dose by one factor for every recipe: ${RULE.targetMultiplier.map(([t, m]) => `${t.toFixed(1)} → ${m.toFixed(2)}`).join(", ")} (linear in between).</p>
      <p><b>Source water:</b> 0.1 g/gal is subtracted per 19 ppm of alkalinity (as CaCO3), after scaling, and the dose never goes below zero.</p>
      <p><b>Dripper pH range:</b> the modeled 22 °C calcium-phosphate limit for the column's recipe at its EC, rounded to the nearest 0.1 and kept within 5.5–6.0. Warm lines take 0.08 off the limit. The default target is 0.1 below the top of the range, never above 5.9.</p>
    </div>`;
  }

  /** @param {ReturnType<typeof columns>} cols */
  function atLineText(cols) {
    const hit = cols.filter(c => c.d.atLine).map(c => `${c.short} (${c.d.recipe} ${c.d.ec.toFixed(1)} EC)`);
    return COPY.atLine.replace("{cols}", `${hit.join(", ")} ${hit.length > 1 ? "sit" : "sits"}`);
  }

  /** @param {string} title @param {string} body @param {boolean} [open] */
  function fold(title, body, open = false) {
    return `<details class="card fold"${open ? " open" : ""}><summary>${esc(title)}</summary>${body}</details>`;
  }

  /** @param {string[]} ps */
  function prose(ps) { return `<div class="prose">${ps.map(p => `<p>${esc(p)}</p>`).join("")}</div>`; }

  function renderMain() {
    const cols = columns();
    const app = /** @type {HTMLElement} */ (root.querySelector("[data-app]"));
    const anyAtLine = cols.some(c => c.d.atLine);
    const notes = [
      state.alk > DATA.phDown.reviewAbovePpm ? `<div class="card note note--warn"><span class="note__ic">!</span><div>${esc(COPY.alkHigh)}</div></div>` : "",
      anyAtLine ? `<div class="card note note--warn"><span class="note__ic">!</span><div>${esc(atLineText(cols))}</div></div>` : "",
      state.warm ? `<div class="card note"><span class="note__ic">i</span><div>${esc(COPY.warm)}</div></div>` : "",
    ].join("");
    app.innerHTML = barHtml({ root: "", tool: "pH Up", home: "./" })
      + backLinkHtml("All tools")
      + `<h1 class="title">pH Up Calculator</h1><p class="lede">${esc(COPY.lede)}</p>`
      + `<section class="card setup"><div class="setup__chips">${chips().map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div>`
      + `<button class="edit-btn" data-act="edit" aria-haspopup="dialog">${ICONS.edit}Edit</button></section>`
      + `<div class="sec"><h2>Dose by column</h2><span class="sec__u">${state.mode === "dtr" ? "Direct to reservoir" : `Stock at ${stockGPerGal()} g/gal`}</span></div>`
      + chartRowsHtml(cols) + chartWideHtml(cols)
      + notes
      + `<div class="actions">
          <button class="btn btn--primary" data-act="pdf">${ICONS.pdf}Export PDF</button>
          <button class="btn" data-act="share" aria-label="Share link">${ICONS.link}<span class="btn__label">Share link</span></button>
          <button class="btn" data-act="copy" aria-label="Copy summary">${ICONS.copy}<span class="btn__label">Copy summary</span></button>
        </div>`
      + `<div class="sec"><h2>How to dose</h2></div>`
      + `<section class="card steps"><ol>${COPY.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></section>`
      + fold("Why each column has a pH ceiling", prose(COPY.ceiling))
      + fold("pH measurement tips", prose(COPY.measure))
      + fold("Source water and RO alkalinity creep", prose(COPY.water))
      + fold("Technical details", techHtml(cols))
      + footHtml({ contact: "Questions? Contact your Sales Rep or retailer.", back: "All calculator tools" });
    /** @type {HTMLElement} */ (root.querySelector("[data-print]")).innerHTML = printSheet(cols);
    syncUrl();
  }

  // ── Edit sheet ──

  /** @param {string} name @param {Array<[string, string]>} options @param {string} current */
  function seg(name, options, current) {
    return `<div class="seg" role="group">${options.map(([v, l]) => `<button type="button" data-set="${name}" data-val="${esc(v)}" aria-pressed="${v === current}">${esc(l)}</button>`).join("")}</div>`;
  }
  /** @param {string} label @param {string} body @param {string} [help] */
  function field(label, body, help = "") {
    return `<div class="field"><div class="field__label">${esc(label)}</div>${body}${help ? `<p class="field__help">${esc(help)}</p>` : ""}</div>`;
  }

  function renderSheet() {
    const sheet = /** @type {HTMLElement} */ (root.querySelector("[data-sheet]"));
    const body0 = sheet.querySelector(".sheet-panel__body");
    const scroll = body0 ? body0.scrollTop : 0;
    const line = getLine(state.line);
    const grid = (/** @type {(p: Phase, i: number) => string} */ cell) => `<div class="grid5">${PHASES.map((p, i) => `<div><label>${esc(SHORT[i])}</label>${cell(p, i)}</div>`).join("")}</div>`;
    const fields = [
      field("Product line", seg("line", [["3part", "3-Part"], ["cplus", "Component Plus"]], state.line)),
      field("Feed strength", seg("preset", [["high", "High"], ["standard", "Standard"], ["custom", "Custom"]], state.preset)
        + `<div style="margin-top:10px">${grid(p => `<input class="input num" type="number" inputmode="decimal" step="0.1" min="0.1" max="10" data-input="ec" data-phase="${p}" value="${state.ec[p].toFixed(1)}" aria-label="Target EC ${p}">`)}</div>`,
        "Target EC for each column, as on your feed chart."),
      field("Recipe schedule", seg("schedule", [["commercial", "Commercial"], ["swell-flower", "Swell Through Flower"]], state.customRecipes ? "" : state.schedule)
        + `<div style="margin-top:10px">${grid(p => `<select class="input" data-change="recipe" data-phase="${p}" aria-label="Recipe ${p}">${line.recipeNames.map(r => `<option${r === state.recipe[p] ? " selected" : ""}>${esc(r)}</option>`).join("")}</select>`)}</div>`),
      field("Target pH", grid(p => `<select class="input" data-change="target" data-phase="${p}" aria-label="Target pH ${p}"><option value="">Auto</option>${TARGETS.map(t => `<option value="${t}"${state.target[p] === t ? " selected" : ""}>${t.toFixed(1)}</option>`).join("")}</select>`),
        "Auto is 0.1 below the top of the column's dripper pH range, never above 5.9."),
      field("How you add pH Up", seg("mode", [["dtr", "Direct to reservoir"], ["stock", "Stock concentrate"]], state.mode)
        + (state.mode === "dtr"
          ? `<div class="input-row" style="margin-top:10px"><input class="input num" type="number" inputmode="decimal" min="1" data-input="reservoir" value="${state.reservoir}" aria-label="Reservoir size"><span>gal reservoir</span></div>`
          : `<div style="margin-top:10px">${seg("conc", [["20", "20 g/gal · MZ2"], ["100", "100 g/gal · MZ3000"], ["custom", "Custom"]], state.conc)}</div>`
            + (state.conc === "custom" ? `<div class="input-row" style="margin-top:10px"><input class="input num" type="number" inputmode="decimal" min="${RULE.customStock.min}" max="${RULE.customStock.max}" data-input="custom" value="${state.custom}" aria-label="Stock concentration"><span>g pH Up per gal of stock</span></div>` : "")
            + `<div style="margin-top:10px">${seg("unit", [["mlgal", "mL/gal"], ["pct", "% injection"]], state.unit)}</div>`),
        state.mode === "dtr" ? "Grams of pH Up powder added straight to the batch tank." : "pH Up premixed into a stock tank and injected. Pick the preset that matches your injector (D14MZ2 or D14MZ3000 or similar)."),
      field("Source water alkalinity", `<div class="input-row"><input class="input num" type="number" inputmode="decimal" min="0" max="500" step="1" data-input="alk" value="${state.alk}" aria-label="Source water alkalinity"><span>ppm as CaCO3 (0 for RO)</span></div>`),
      field("Line temperature", `<div class="toggles"><button type="button" class="tog" data-set="warm" aria-pressed="${state.warm}">Lines run warm (over 77 °F / 25 °C)</button></div>`),
    ];
    sheet.innerHTML = `<div class="sheet-panel__grab"></div>
      <div class="sheet-panel__head"><h2 id="sheet-title">Edit setup</h2><button class="ib" data-act="close" aria-label="Close">${ICONS.close}</button></div>
      <div class="sheet-panel__body">${fields.join("")}</div>
      <div class="sheet-panel__foot"><button class="btn btn--primary" data-act="close">Done</button></div>`;
    const body = sheet.querySelector(".sheet-panel__body");
    if (body) body.scrollTop = scroll;
  }

  function render() {
    renderMain();
    if (state.sheetOpen) renderSheet();
  }

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
    setTimeout(() => { if (!state.sheetOpen) { sheet.hidden = true; scrim.hidden = true; } }, 250);
    /** @type {HTMLElement | null} */ (root.querySelector("[data-act=edit]"))?.focus();
  }

  // ── Print and summary ──

  function printSheet(cols) {
    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    const head = `<tr><th></th>${cols.map(c => `<th>${esc(c.long)}</th>`).join("")}</tr>`;
    const row = (label, cls, cells) => `<tr class="${cls}"><th>${esc(label)}</th>${cells.join("")}</tr>`;
    const warnings = cols.flatMap(c => c.warnings.map(w => `${c.long}: ${w}.`));
    const notes = [
      ...(state.alk > DATA.phDown.reviewAbovePpm ? [COPY.alkHigh] : []),
      ...(cols.some(c => c.d.atLine) ? [atLineText(cols)] : []),
      ...(state.warm ? [COPY.warm] : []),
    ];
    return `<section class="sheet">`
      + sheetHeadHtml({ root: "", kicker: `pH Up · ${getLine(state.line).label}`, title: "pH Up Dosing Chart", date, chips: chips() })
      + `<table class="s-table"><thead>${head}</thead><tbody>`
      + row("Recipe", "rec", cols.map(c => `<td>${esc(c.d.recipe)}</td>`))
      + row("Target EC", "ecr", cols.map(c => `<td class="num">${c.d.ec.toFixed(1)}</td>`))
      + row("Dripper pH", "phrow", cols.map(c => `<td class="num">${esc(c.range)}</td>`))
      + row("Target pH", "ecr", cols.map(c => `<td class="num">${c.d.target.toFixed(1)}</td>`))
      + row(`pH Up (${cols[0].unit})`, "part", cols.map(c => `<td><div class="v num">${esc(c.value)}</div><div class="s num">${esc(c.sub)}</div></td>`))
      + `</tbody></table>`
      + warnings.map(w => `<div class="s-warn">${esc(w)}</div>`).join("")
      + notes.map(n => `<div class="s-warn">${esc(n)}</div>`).join("")
      + `<div class="s-two" style="margin-top:14px">
          <div><div class="s-h">How to dose</div><ol class="s-list">${COPY.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
            <div class="s-h" style="margin-top:12px">Measuring pH</div>${COPY.measure.map(p => `<p class="s-p">${esc(p)}</p>`).join("")}</div>
          <div><div class="s-h">Why each column has a ceiling</div>${COPY.ceiling.map(p => `<p class="s-p">${esc(p)}</p>`).join("")}
            <div class="s-h" style="margin-top:12px">Source water</div><p class="s-p">${esc(COPY.water[0])}</p><p class="s-p">${esc(COPY.water[1])}</p></div>
        </div>`
      + `<div class="s-notes"><div class="s-h">Notes</div><div class="s-lines"></div></div>`
      + sheetFootHtml("tools.frontrowag.com/ph-up-calc.html")
      + `</section>`;
  }

  function summaryText() {
    const cols = columns();
    const lines = [
      "Front Row Ag · pH Up (potassium carbonate)",
      chips().join(" · "),
      "",
      ...cols.map(c => `${c.short} · ${c.d.recipe} ${c.d.ec.toFixed(1)} EC · target pH ${c.d.target.toFixed(1)} (range ${c.range}) · ${c.value} ${c.unit}${state.mode === "dtr" ? ` (${c.sub})` : ""}${c.warnings.length ? ` · ${c.warnings.join("; ")}` : ""}`),
      "",
      `Add in ~${STEP} g/gal steps, wait ${WAIT[0]}–${WAIT[1]} min, and confirm at the dripper with a calibrated meter.`,
      window.location.href,
    ];
    return lines.join("\n");
  }

  // ── Events ──

  function start() {
    root.innerHTML = `<div class="app" data-app></div>
      <div class="scrim" data-scrim hidden></div>
      <aside class="sheet-panel" data-sheet role="dialog" aria-modal="true" aria-labelledby="sheet-title" hidden></aside>
      <div class="print-root" data-print></div>`;

    root.addEventListener("click", async event => {
      const el = /** @type {HTMLElement} */ (event.target).closest("[data-act], [data-set]");
      if (!el) {
        if (/** @type {HTMLElement} */ (event.target).matches("[data-scrim]")) closeSheet();
        return;
      }
      const set = el.getAttribute("data-set");
      const val = el.getAttribute("data-val") ?? "";
      if (set) {
        if (set === "line") {
          state.line = val === "cplus" ? "cplus" : "3part";
          applySchedule();
          PHASES.forEach(p => { state.target[p] = null; });
        } else if (set === "preset") {
          state.preset = /** @type {any} */ (val);
          if (val !== "custom") state.ec = { ...DATA.ecPresets[/** @type {"high" | "standard"} */ (val)] };
        } else if (set === "schedule") {
          state.schedule = val;
          applySchedule();
        } else if (set === "mode") state.mode = val === "stock" ? "stock" : "dtr";
        else if (set === "conc") state.conc = val;
        else if (set === "unit") state.unit = val === "pct" ? "pct" : "mlgal";
        else if (set === "warm") state.warm = !state.warm;
        return render();
      }
      const act = el.getAttribute("data-act");
      if (act === "edit") openSheet();
      else if (act === "close") closeSheet();
      else if (act === "theme") { toggleTheme(); renderMain(); }
      else if (act === "pdf") printDocument(`FRA pH Up ${getLine(state.line).label}`, () => renderMain());
      else if (act === "share") {
        const r = await shareUrl(window.location.href, "FRA pH Up");
        if (r === "copied") toast("Link copied");
        else if (r === "failed") toast("Couldn't copy the link");
      } else if (act === "copy") toast((await copyText(summaryText())) ? "Summary copied" : "Couldn't copy");
    });

    root.addEventListener("input", event => {
      const el = /** @type {HTMLInputElement} */ (event.target);
      const key = el.getAttribute("data-input");
      if (!key) return;
      const n = Number(el.value);
      if (!Number.isFinite(n) || n < 0 || el.value === "") return;
      if (key === "ec") {
        const phase = /** @type {Phase} */ (el.getAttribute("data-phase"));
        if (n <= 0 || n > 10) return;
        state.ec[phase] = n;
        const preset = /** @type {Record<string, Record<Phase, number>>} */ (DATA.ecPresets);
        state.preset = PHASES.every(p => state.ec[p] === preset.high[p]) ? "high" : PHASES.every(p => state.ec[p] === preset.standard[p]) ? "standard" : "custom";
        root.querySelectorAll("[data-set=preset]").forEach(b => b.setAttribute("aria-pressed", String(b.getAttribute("data-val") === state.preset)));
      } else if (key === "reservoir") { if (n > 0) state.reservoir = n; }
      else if (key === "custom") { if (n >= RULE.customStock.min && n <= RULE.customStock.max) state.custom = n; }
      else if (key === "alk") state.alk = Math.min(n, 500);
      renderMain();
    });

    root.addEventListener("change", event => {
      const el = /** @type {HTMLSelectElement} */ (event.target);
      const key = el.getAttribute("data-change");
      const phase = /** @type {Phase} */ (el.getAttribute("data-phase"));
      if (key === "recipe") {
        state.recipe[phase] = el.value;
        const schedules = /** @type {Record<string, Record<Phase, string>>} */ (getLine(state.line).schedules);
        state.customRecipes = PHASES.some(p => state.recipe[p] !== schedules[state.schedule][p]);
        render();
      } else if (key === "target") {
        state.target[phase] = el.value === "" ? null : Number(el.value);
        render();
      }
    });

    document.addEventListener("keydown", event => { if (event.key === "Escape" && state.sheetOpen) closeSheet(); });
    render();
  }

  start();
}
