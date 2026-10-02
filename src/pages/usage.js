// @ts-check
// Usage estimator (team). Quick mode (the default) estimates a year of product from
// flowering canopy alone on fixed assumptions (DATA.usage.quick); Advanced is the full
// calculator, column by column on the customer's feed chart, and opens with the quick
// inputs carried over. Prices preload from the sealed price list (usage-prices.js) when
// the page holds the team code, or are typed in. Exports a customer proposal PDF (annual
// order, assumptions, prices only when turned on) or an internal analysis PDF (usage-print.js).
import { DATA, getLine, quickUsageInput, quickVolumes, usageCost, usageEstimate, usageProducts, usagePurchase } from "../engine/index.js";
import { assumptions, renderUsagePrint, unitsFor } from "./usage-print.js";
import { loadPriceList, tierPrices } from "./usage-prices.js";
import { initTheme, toggleTheme } from "../../shared/theme.js";
import { replaceUrl, shareUrl } from "../../shared/share.js";
import { readStored, writeStored } from "../../shared/storage.js";
import { gateFind, gateUnlock } from "../../shared/gate.js";
import { fileSafe, printDocument } from "../../shared/print.js";
import { ICONS, barHtml, esc, footHtml, toast } from "../../shared/chrome.js";

/** @typedef {import("../engine/data.js").LineId} LineId */
/** @typedef {import("../engine/data.js").Phase} Phase */

/**
 * Links from the previous estimator (`ve` present) carry one veg EC (`ve`), one flower EC (`fe`), total flower
 * weeks (`fw`) and an additive bit string (`ai`: PhosZyme, pH Up, Si, Triologic). Map them onto the per-column
 * state: every flower column gets `fe`, and `fw` is split over the columns in the default proportions with the
 * total kept exact (whole weeks when `fw` is whole, else tenths).
 * @param {URLSearchParams} params
 * @param {{ ec: Record<string, number>, preset: string, flowerWeeks: Record<string, number>, phoszyme: boolean, phUp: boolean, si: boolean, triologic: boolean }} state
 */
export function applyLegacyParams(params, state) {
  if (!params.has("ve")) return;
  const ve = num(params.get("ve"), -1, 10), fe = num(params.get("fe"), -1, 10);
  const ec = { ...state.ec };
  if (ve > 0) ec.Veg = ve;
  if (fe > 0) FLOWER.forEach(p => { ec[p] = fe; });
  if (Object.keys(ec).some(p => ec[p] !== state.ec[p])) { state.ec = ec; state.preset = "custom"; }
  const fw = num(params.get("fw"), -1, 52);
  if (fw >= 0 && !params.has("w0")) {
    const step = Number.isInteger(fw) ? 1 : 0.1, units = Math.round(fw / step);
    const total = FLOWER.reduce((sum, p) => sum + D.flowerWeeks[p], 0);
    const raw = FLOWER.map(p => units * D.flowerWeeks[p] / total);
    const whole = raw.map(Math.floor);
    let left = units - whole.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - whole[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { whole[i]++; left--; } });
    FLOWER.forEach((p, i) => { state.flowerWeeks[p] = Math.round(whole[i] * step * 10) / 10; });
  }
  const ai = params.get("ai") ?? "";
  state.phoszyme = ai[0] === "1";
  state.phUp = ai[1] === "1";
  state.si = ai[2] === "1";
  state.triologic = ai[3] === "1";
}

const PHASES = /** @type {Phase[]} */ ([...DATA.phases]);
const FLOWER = /** @type {Phase[]} */ (["Stretch", "Stack", "Swell", "Ripen"]);
const SHORT = DATA.phaseLabels.summary;
const D = DATA.usage.defaults;

/** @param {string | null} v @param {number} fallback @param {number} [max] */
function num(v, fallback, max = 1e9) {
  if (v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
}
/** @param {number} n @param {number} [d] */
function fmt(n, d = 1) { return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
/** @param {number} n */
function money(n) { return `$${fmt(n, 2)}`; }
/** Local date as YYYY-MM-DD. @param {Date} d */
function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
/** @param {string} iso */
function displayDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
/** Inputs that hold a volume: stored in gallons, shown in L when metric. */
const VOLUME_INPUTS = new Set(["vegGalPerWeek", "flowerGalPerWeek", "triVeg", "triFlower", "siGal"]);
const TEXT_MAX = { facility: 80, preparedBy: 60, notes: 600 };

const Q = DATA.usage.quick;
/** Default price tier per line. */
const DEFAULT_TIER = { "3part": "commercial", cplus: "cplus-mixed" };
/** Parameters only the full calculator writes; a link with any of them opens Advanced. */
const ADVANCED_PARAMS = ["vw", "vg", "fg", "w0", "e0", "e1", "e2", "e3", "e4", "p", "rs", "ve", "fe", "fw", "alk", "phup", "tvg", "tfg", "sig", "sir"];
/** @param {number} n Round to 0.1 for inputs and links. */
const tenth = n => Math.round(n * 10) / 10;

/**
 * Page state from the URL. Links without `m` open Quick unless they carry a full-calculator
 * parameter, so links made before Quick mode keep opening the same chart.
 * @param {URLSearchParams} params
 * @param {string} key
 */
export function initialState(params, key) {
  /** @type {LineId} */
  const line0 = params.get("b") === "cplus" ? "cplus" : "3part";
  const preset0 = params.get("p") === "standard" ? "standard" : "high";
  const m = params.get("m");
  const mode = m === "q" ? "quick" : m === "a" ? "advanced" : ADVANCED_PARAMS.some(k => params.has(k)) ? "advanced" : "quick";
  const state = {
    key,
    /** @type {"quick" | "advanced"} */
    mode: /** @type {"quick" | "advanced"} */ (mode),
    canopy: num(params.get("ft"), Q.canopyFt2, 1e7),
    line: line0,
    preset: /** @type {"high" | "standard" | "custom"} */ (preset0),
    schedule: params.get("rs") === "swell-flower" ? "swell-flower" : "commercial",
    /** @type {Record<Phase, number>} */
    ec: { ...DATA.ecPresets[preset0] },
    vegWeeks: num(params.get("vw"), D.vegWeeks, 52),
    vegGalPerWeek: num(params.get("vg"), D.vegGalPerWeek),
    /** @type {Record<string, number>} */
    flowerWeeks: { ...D.flowerWeeks },
    flowerGalPerWeek: num(params.get("fg"), D.flowerGalPerWeek),
    phoszyme: params.get("phz") === "1",
    phUp: params.get("phup") !== "0",
    alk: num(params.get("alk"), 0, 500),
    triologic: params.get("tri") === "1",
    triVeg: num(params.get("tvg"), 0),
    triFlower: num(params.get("tfg"), 0),
    si: params.get("si") === "1",
    siGal: num(params.get("sig"), 0),
    siRate: num(params.get("sir"), DATA.usage.siFoliarMlPerGal, 10),
    cycles: num(params.get("cy"), mode === "quick" ? Q.harvestsPerYear : D.cyclesPerYear, 52),
    tier: params.get("tier") ?? "",
    addTier: params.get("at") ?? "",
    facility: (params.get("fac") ?? "").slice(0, TEXT_MAX.facility),
    preparedBy: (params.get("rep") ?? readStored("fra-usage-rep") ?? "").slice(0, TEXT_MAX.preparedBy),
    date: /^\d{4}-\d{2}-\d{2}$/.test(params.get("dt") ?? "") ? /** @type {string} */ (params.get("dt")) : isoDate(new Date()),
    metric: params.get("u") === "metric",
    showPrices: params.get("cost") === "1",
    notes: "",
    /** @type {"customer" | "internal"} */
    printMode: params.get("pm") === "customer" ? "customer" : "internal",
    /** @type {import("./usage-prices.js").PriceList} */
    list: { tiers: [], additiveTiers: [] },
    pricesLoaded: false,
    /** @type {Record<string, number | null>} */
    prices: {},
  };
  PHASES.forEach((p, i) => {
    const e = num(params.get(`e${i}`), -1, 10);
    if (e > 0 && e !== state.ec[p]) { state.ec[p] = e; state.preset = "custom"; }
  });
  FLOWER.forEach((p, i) => { state.flowerWeeks[p] = num(params.get(`w${i}`), state.flowerWeeks[p], 52); });
  applyLegacyParams(params, state);
  return state;
}

/** @typedef {ReturnType<typeof initialState>} UsageState */

/**
 * The share-link parameters for the current state. Quick links carry only the quick
 * inputs; prices never go in a link.
 * @param {UsageState} state
 */
export function stateParams(state) {
  const p = new URLSearchParams();
  p.set("key", state.key);
  if (state.line === "cplus") p.set("b", "cplus");
  if (state.mode === "quick") {
    p.set("m", "q");
    p.set("ft", String(tenth(state.canopy)));
    if (state.phoszyme) p.set("phz", "1");
    if (state.triologic) p.set("tri", "1");
    if (state.si) p.set("si", "1");
  } else {
    p.set("m", "a");
    if (state.preset === "standard") p.set("p", "standard");
    if (state.schedule !== "commercial") p.set("rs", state.schedule);
    const preset = state.preset === "custom" ? null : DATA.ecPresets[state.preset];
    PHASES.forEach((ph, i) => { if (!preset || preset[ph] !== state.ec[ph]) p.set(`e${i}`, String(state.ec[ph])); });
    p.set("vw", String(state.vegWeeks));
    p.set("vg", String(tenth(state.vegGalPerWeek)));
    FLOWER.forEach((ph, i) => p.set(`w${i}`, String(state.flowerWeeks[ph])));
    p.set("fg", String(tenth(state.flowerGalPerWeek)));
    if (state.phoszyme) p.set("phz", "1");
    if (!state.phUp) p.set("phup", "0");
    if (state.alk) p.set("alk", String(state.alk));
    if (state.triologic) { p.set("tri", "1"); p.set("tvg", String(tenth(state.triVeg))); p.set("tfg", String(tenth(state.triFlower))); }
    if (state.si) { p.set("si", "1"); p.set("sig", String(tenth(state.siGal))); p.set("sir", String(state.siRate)); }
  }
  p.set("cy", String(state.cycles));
  if (state.tier) p.set("tier", state.tier);
  if (state.addTier) p.set("at", state.addTier);
  if (state.metric) p.set("u", "metric");
  if (state.showPrices) p.set("cost", "1");
  if (state.facility) p.set("fac", state.facility);
  if (state.preparedBy) p.set("rep", state.preparedBy);
  if (state.date !== isoDate(new Date())) p.set("dt", state.date);
  return p;
}

/**
 * The engine input for the current mode.
 * @param {UsageState} state
 */
export function usageInput(state) {
  if (state.mode === "quick") {
    return quickUsageInput({ lineId: state.line, canopyFt2: state.canopy, phoszyme: state.phoszyme, triologic: state.triologic, si: state.si });
  }
  return {
    lineId: state.line, schedule: state.schedule, ec: state.ec,
    vegWeeks: state.vegWeeks, vegGalPerWeek: state.vegGalPerWeek,
    flowerWeeks: state.flowerWeeks, flowerGalPerWeek: state.flowerGalPerWeek,
    phoszyme: state.phoszyme, phUp: state.phUp, alkPpm: state.alk,
    triologic: state.triologic, triologicVegGalPerWeek: state.triVeg, triologicFlowerGalPerWeek: state.triFlower,
    si: state.si, siFoliarGal: state.siGal, siMlPerGal: state.siRate,
  };
}

/**
 * Switches to Advanced with every quick assumption written into the full calculator's
 * inputs, so it opens on the same estimate.
 * @param {UsageState} state
 */
export function quickToAdvanced(state) {
  if (state.mode === "quick") {
    const q = quickUsageInput({ lineId: state.line, canopyFt2: state.canopy, phoszyme: state.phoszyme, triologic: state.triologic, si: state.si });
    state.preset = /** @type {"high" | "standard"} */ (Q.ecPreset);
    state.ec = /** @type {Record<Phase, number>} */ ({ ...q.ec });
    state.schedule = q.schedule;
    state.vegWeeks = q.vegWeeks;
    state.vegGalPerWeek = q.vegGalPerWeek;
    state.flowerWeeks = { ...q.flowerWeeks };
    state.flowerGalPerWeek = q.flowerGalPerWeek;
    state.phUp = q.phUp;
    state.alk = q.alkPpm;
    state.triVeg = q.triologicVegGalPerWeek;
    state.triFlower = q.triologicFlowerGalPerWeek;
    state.siGal = q.siFoliarGal;
    state.siRate = q.siMlPerGal;
  }
  state.mode = "advanced";
  return state;
}

/**
 * Applies the selected price tier (and additive tier) to the state's prices. With no
 * price list loaded, typed prices stay as they are.
 * @param {UsageState} state
 * @param {boolean} [followAdditives]  Reset the additive tier to the base tier's default.
 */
export function applyTier(state, followAdditives = false) {
  const lineTiers = state.list.tiers.filter(t => t.line === state.line);
  if (!lineTiers.length) return;
  const tier = lineTiers.find(t => t.id === state.tier) ?? lineTiers.find(t => t.id === DEFAULT_TIER[state.line]) ?? lineTiers[0];
  state.tier = tier.id;
  if (followAdditives || !state.list.additiveTiers.some(t => t.id === state.addTier)) state.addTier = tier.additives;
  const prices = tierPrices(state.list, state.tier, state.addTier, usageProducts(state.line).map(p => p.name));
  // Products the list leaves unpriced (pH Up) keep any typed price.
  if (prices) Object.entries(prices).forEach(([name, price]) => { if (price !== null) state.prices[name] = price; });
}

/** @param {HTMLElement} root */
export function mount(root) {
  const params = new URLSearchParams(window.location.search);
  initTheme(params);
  const found = gateFind(["team"], params);
  if (found) start(found.code); else gate();

  function gate() {
    document.title = "Usage Estimator · Front Row Ag";
    root.innerHTML = `<main class="gate"><div class="card gate__card">
      <img src="assets/feed-chart/logo-dark.png" alt="Front Row Ag" class="bar__logo--light"><img src="assets/feed-chart/logo-white.png" alt="Front Row Ag" class="bar__logo--dark">
      <h1>Usage Estimator</h1>
      <p>This is an internal Front Row Ag team tool. Enter the team access code.</p>
      <form data-gate><input class="input" name="code" placeholder="Access code" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Access code">
      <button class="btn btn--primary" type="submit">Unlock</button></form>
      <p class="gate__err" hidden>That code didn't match. The team code is on the Notion Team Tools page.</p>
      <p class="gate__foot"><a href="https://www.frontrowag.com" target="_blank" rel="noopener">frontrowag.com</a></p>
    </div></main>`;
    const form = /** @type {HTMLFormElement} */ (root.querySelector("[data-gate]"));
    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = /** @type {HTMLInputElement} */ (form.elements.namedItem("code")).value;
      const opened = gateUnlock(["team"], value);
      if (opened) start(opened.code);
      else /** @type {HTMLElement} */ (root.querySelector(".gate__err")).hidden = false;
    });
  }

  /** @param {string} key */
  function start(key) {
    const state = initialState(params, key);
    const quick = () => state.mode === "quick";

    function syncUrl() { replaceUrl(stateParams(state)); }

    /** @param {string} name @param {Array<[string, string]>} options @param {string} current */
    function seg(name, options, current) {
      return `<div class="seg" role="group">${options.map(([v, l]) => `<button type="button" data-set="${name}" data-val="${esc(v)}" aria-pressed="${v === current}">${esc(l)}</button>`).join("")}</div>`;
    }
    /** @param {string} name @param {number} value @param {string} label @param {string} [attrs] */
    function numInput(name, value, label, attrs = "") {
      const shown = tenth(VOLUME_INPUTS.has(name) && state.metric ? value * DATA.units.litersPerGallon : value);
      return `<input class="input num" type="number" inputmode="decimal" min="0" data-input="${name}" value="${shown}" aria-label="${esc(label)}" ${attrs}>`;
    }
    /** @param {string} label @param {string} body @param {string} [help] */
    function field(label, body, help = "") {
      return `<div class="field"><div class="field__label">${esc(label)}</div>${body}${help ? `<p class="field__help">${esc(help)}</p>` : ""}</div>`;
    }
    /** @param {string} name @param {boolean} on @param {string} label */
    function tog(name, on, label) {
      return `<button type="button" class="tog" data-set="${name}" aria-pressed="${on}">${esc(label)}</button>`;
    }
    /** @param {string} name @param {string} label @param {Array<{ id: string, label: string }>} options @param {string} current */
    function select(name, label, options, current) {
      return `<select class="input" data-select="${name}" aria-label="${esc(label)}">${options.map(o => `<option value="${esc(o.id)}"${o.id === current ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
    }

    function tierHtml() {
      const lineTiers = state.list.tiers.filter(t => t.line === state.line);
      if (!lineTiers.length) return "";
      const adds = state.list.additiveTiers;
      return field("Price tier", `<div class="grid3" style="grid-template-columns:1fr 1fr"><div><label>${esc(getLine(state.line).label)}</label>${select("tier", "Price tier", lineTiers, state.tier)}</div>`
        + (adds.length ? `<div><label>Add-ons</label>${select("addTier", "Add-on price tier", adds, state.addTier)}</div>` : "") + `</div>`,
        "Prices per bag or jug from the FRA price list. pH Up has no list price.");
    }

    function quickInputsHtml() {
      return `<section class="card form" style="padding-bottom:6px">`
        + field("Product line", seg("line", [["3part", "3-Part"], ["cplus", "Component Plus"]], state.line))
        + field("Flowering canopy", `<div class="input-row">${numInput("canopy", state.canopy, "Flowering canopy, square feet", 'step="1000"')}<span>ft²</span></div>`)
        + field("Harvests per year", `<div class="input-row">${numInput("cycles", state.cycles, "Harvests per year", 'step="1" max="52"')}</div>`)
        + field("Add-ons", `<div class="toggles">${tog("phoszyme", state.phoszyme, "PhosZyme")}${tog("triologic", state.triologic, "Triologic")}${tog("si", state.si, "Si (foliar)")}</div>`)
        + tierHtml()
        + field("Units", seg("units", [["us", "US (gal, lb)"], ["metric", "Metric (L, kg)"]], state.metric ? "metric" : "us"))
        + `</section>`
        + proposalHtml();
    }

    function inputsHtml() {
      const grid5 = `<div class="grid5">${PHASES.map((p, i) => `<div><label>${esc(SHORT[i])}</label>${numInput("ec", state.ec[p], `EC ${p}`, `step="0.1" data-phase="${p}"`).replace(/value="[^"]*"/, `value="${state.ec[p].toFixed(1)}"`)}</div>`).join("")}</div>`;
      const weeks = `<div class="grid5">${PHASES.map((p, i) => `<div><label>${esc(SHORT[i])}</label>${p === "Veg" ? numInput("vegWeeks", state.vegWeeks, "Veg weeks", 'step="1"') : numInput("fw", state.flowerWeeks[p], `${p} weeks`, `step="1" data-phase="${p}"`)}</div>`).join("")}</div>`;
      return `<section class="card form" style="padding-bottom:6px">`
        + field("Product line", seg("line", [["3part", "3-Part"], ["cplus", "Component Plus"]], state.line))
        + field("Feed strength (target EC)", seg("preset", [["high", "High"], ["standard", "Standard"], ["custom", "Custom"]], state.preset) + `<div style="margin-top:10px">${grid5}</div>`)
        + field("Recipe schedule", seg("schedule", [["commercial", "Commercial"], ["swell-flower", "Swell Through Flower"]], state.schedule))
        + field("Weeks per column", weeks)
        + field(state.metric ? "Liters of feed per week" : "Gallons of feed per week", `<div class="grid3" style="grid-template-columns:1fr 1fr"><div><label>Veg</label>${numInput("vegGalPerWeek", state.vegGalPerWeek, "Veg gal per week", 'step="100"')}</div><div><label>Flower</label>${numInput("flowerGalPerWeek", state.flowerGalPerWeek, "Flower gal per week", 'step="100"')}</div></div>`)
        + field("Additives", `<div class="toggles">${tog("phoszyme", state.phoszyme, "PhosZyme")}${tog("phUp", state.phUp, "pH Up")}${tog("triologic", state.triologic, "Triologic")}${tog("si", state.si, "Si (foliar)")}</div>`)
        + (state.phUp ? field("Source water alkalinity", `<div class="input-row">${numInput("alk", state.alk, "Source alkalinity", 'step="1" max="500"')}<span>ppm as CaCO3 (RO = 0)</span></div>`,
          "pH Up is very sensitive to this: on the default 3-Part High chart, 10 ppm cuts it by about 40% and about 27 ppm removes it.") : "")
        + (state.triologic ? field(state.metric ? "Triologic: liters treated per week" : "Triologic: gallons treated per week", `<div class="grid3" style="grid-template-columns:1fr 1fr"><div><label>Veg</label>${numInput("triVeg", state.triVeg, "Triologic veg gal per week", 'step="100"')}</div><div><label>Flower</label>${numInput("triFlower", state.triFlower, "Triologic flower gal per week", 'step="100"')}</div></div>`, `At ${DATA.usage.triologicMlPerTreatedGal} mL per treated gallon.`) : "")
        + (state.si ? field("Si foliar spray", `<div class="grid3" style="grid-template-columns:1fr 1fr"><div><label>Spray ${state.metric ? "L" : "gal"} per cycle</label>${numInput("siGal", state.siGal, "Si spray gallons per cycle", 'step="10"')}</div><div><label>mL per gal</label>${numInput("siRate", state.siRate, "Si mL per gal", 'step="0.5" max="10"')}</div></div>`, "Si is foliar only, not in the feed. Label range 0.5–2 mL/gal.") : "")
        + field("Cycles per year", `<div class="input-row">${numInput("cycles", state.cycles, "Cycles per year", 'step="1" max="52"')}</div>`)
        + tierHtml()
        + field("Units", seg("units", [["us", "US (gal, lb)"], ["metric", "Metric (L, kg)"]], state.metric ? "metric" : "us"))
        + `</section>`
        + proposalHtml();
    }

    function proposalHtml() {
      /** @param {string} name @param {string} label @param {string} value @param {string} [attrs] */
      const text = (name, label, value, attrs = "") => `<div class="field field--stack"><label class="field__label" for="u-${name}">${esc(label)}</label><input class="input" id="u-${name}" data-text="${name}" value="${esc(value)}" ${attrs}></div>`;
      return `<div class="sec"><h2>Proposal PDF</h2></div><section class="card form" style="padding-bottom:6px">`
        + text("facility", "Facility or customer", state.facility, `maxlength="${TEXT_MAX.facility}" autocomplete="organization" placeholder="Shown as Prepared for"`)
        + text("preparedBy", "Prepared by", state.preparedBy, `maxlength="${TEXT_MAX.preparedBy}" autocomplete="name" placeholder="Your name"`)
        + text("date", "Date", state.date, 'type="date"')
        + field("Customer PDF shows prices", tog("showPrices", state.showPrices, state.showPrices ? "Prices on" : "Prices off"),
          "Off by default. When on, the customer PDF prints the per-package price and cost per year from the prices above.")
        + `<div class="field field--stack"><label class="field__label" for="u-notes">Notes for the PDF</label><textarea class="input" id="u-notes" data-text="notes" rows="4" maxlength="${TEXT_MAX.notes}" placeholder="Typed notes print above the ruled lines. Not saved in the share link.">${esc(state.notes)}</textarea></div>`
        + `</section>`;
    }

    function results() {
      const est = usageEstimate(usageInput(state));
      const cost = usageCost(est, state.prices, state.cycles);
      const purchase = usagePurchase(est, state.cycles);
      return { est, cost, purchase };
    }

    function priceNoteHtml() {
      if (state.list.tiers.length) return "";
      return `<p class="sec__foot" style="margin:0 0 10px">${state.pricesLoaded ? "No price list for this code. Enter prices per bag or jug; they stay on this device." : "Loading the price list…"}</p>`;
    }

    /** @param {string} name */
    function priceInput(name) {
      return `<input class="input num" style="width:86px;height:34px;text-align:right" type="number" inputmode="decimal" min="0" step="0.01" data-price="${esc(name)}" value="${state.prices[name] ?? ""}" placeholder="$" aria-label="${esc(name)} price">`;
    }

    /** @param {number} n @param {boolean} liquid */
    function packages(n, liquid) { return `${n} ${liquid ? "jug" : "bag"}${n === 1 ? "" : "s"}`; }

    /** @param {string[]} unpriced */
    function unpricedNote(unpriced) {
      return unpriced.length ? `No price for ${unpriced.join(", ")}; not included in the cost.` : "";
    }

    function quickResultsHtml() {
      const { est, cost, purchase } = results();
      const u = unitsFor(state.metric);
      const v = quickVolumes(state.canopy);
      const rows = purchase.products.map(p => {
        const c = cost.lines.find(l => l.name === p.name);
        return `<tr><td><b>${esc(p.name)}</b><div class="s">${esc(u.packShort(p))}</div></td>
          <td class="num" style="white-space:nowrap"><b>${packages(p.perYearWholeUnits, p.liquid)}</b><div class="s">${esc(u.amount(p, "perYear"))}</div></td>
          <td>${priceInput(p.name)}</td>
          <td class="num" style="white-space:nowrap" data-cost-year="${esc(p.name)}">${c && c.cost ? money(c.cost * state.cycles) : "–"}</td></tr>`;
      }).join("");
      const feed = [
        ["Flowering plants", fmt(v.flowerPlants, 0)],
        ["Veg plants", fmt(v.vegPlants, 0)],
        ["Flower feed per week", u.volume(v.flowerGalPerWeek)],
        ["Veg feed per week", u.volume(v.vegGalPerWeek)],
        ["Feed per harvest", u.volume(est.totalGal)],
      ];
      const note = unpricedNote(cost.unpriced);
      return `<div class="sec"><h2>Order per year</h2><span class="sec__u">${fmt(state.cycles, 0)} harvests</span></div>`
        + priceNoteHtml()
        + `<div class="card" style="overflow-x:auto"><table class="ref usage"><thead><tr><th>Product</th><th>Order</th><th>Price</th><th>Cost</th></tr></thead><tbody>${rows}</tbody></table></div>`
        + `<section class="card result" data-totals>${totalsHtml(cost, est)}</section>`
        + `<div class="card note note--warn" data-unpriced${note ? "" : " hidden"}><span class="note__ic">!</span><div>${esc(note)}</div></div>`
        + `<div class="sec"><h2>Feed</h2><span class="sec__u">${fmt(state.canopy, 0)} ft² flowering canopy</span></div>`
        + `<div class="card"><table class="ref"><tbody>${feed.map(([k, val]) => `<tr><td>${esc(k)}</td><td class="num">${esc(val)}</td></tr>`).join("")}</tbody></table></div>`
        + `<div class="sec"><h2>Assumptions</h2></div>`
        + `<div class="card note"><ul style="margin:0;padding-left:1.1em;display:grid;gap:6px">${assumptions(printView()).map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>`
        + `<p class="sec__foot">For a customer's own chart, gallons or water, switch to Advanced; it opens with these inputs filled in.</p>`;
    }

    function resultsHtml() {
      if (quick()) return quickResultsHtml();
      const { est, cost, purchase } = results();
      const u = unitsFor(state.metric);
      const pu = est.products.find(p => p.name === "pH Up");
      const rows = purchase.products.map(p => {
        const c = cost.lines.find(l => l.name === p.name);
        return `<tr><td><b>${esc(p.name)}</b><div class="s">${esc(u.packShort(p))}</div></td>
          <td class="num">${esc(u.amount(p, "perCycle"))}</td><td class="num">${fmt(p.perCycleUnits, 1)}</td>
          <td>${priceInput(p.name)}</td>
          <td class="num" data-cost="${esc(p.name)}">${c && c.cost ? money(c.cost) : "–"}</td></tr>`;
      }).join("");
      const colRows = est.columns.map((c, i) => `<tr><td><b>${esc(SHORT[i])}</b><div class="s">${esc(c.recipe)} · ${c.ec.toFixed(1)} EC</div></td><td class="num">${fmt(c.weeks, 0)}</td><td class="num">${esc(u.volume(c.gallons))}</td>`
        + (state.phUp ? `<td class="num">${c.phUp.target.toFixed(1)}</td><td class="num">${c.phUp.gPerGal.toFixed(3)}${c.phUp.overMax ? ' <span class="at-line">!</span>' : ""}</td>` : "") + `</tr>`).join("");
      const notes = [
        state.phUp && state.line === "cplus" ? "C+ pH Up curves are modeled only; there is no bench check yet. Treat the C+ pH Up line as an estimate." : "",
        state.phUp && est.columns.some(c => c.phUp.overMax) ? "A column needs more than 0.25 g/gal pH Up at its target. It is counted, but review that column's EC and water." : "",
      ].filter(Boolean);
      const note = unpricedNote(cost.unpriced);
      const order = purchase.products.map(p => `<tr><td><b>${esc(p.name)}</b></td><td class="num">${esc(u.amount(p, "perYear"))}</td><td class="num">${p.perYearWholeUnits} ${p.liquid ? "jugs" : "bags"}</td></tr>`).join("");
      return `<div class="sec"><h2>Products for one cycle</h2><span class="sec__u">${esc(u.volume(est.totalGal))} of feed</span></div>`
        + priceNoteHtml()
        + `<div class="card" style="overflow-x:auto"><table class="ref usage"><thead><tr><th>Product</th><th>Amount</th><th>Bags</th><th>Price</th><th>Cost</th></tr></thead><tbody>${rows}</tbody></table></div>`
        + `<section class="card result" data-totals>${totalsHtml(cost, est)}</section>`
        + `<div class="card note note--warn" data-unpriced${note ? "" : " hidden"}><span class="note__ic">!</span><div>${esc(note)}</div></div>`
        + `<div class="sec"><h2>Order per year</h2><span class="sec__u">${fmt(state.cycles, 0)} cycles</span></div>`
        + `<div class="card"><table class="ref"><thead><tr><th>Product</th><th>Per year</th><th>Order</th></tr></thead><tbody>${order}</tbody></table></div>`
        + notes.map(n => `<div class="card note note--warn"><span class="note__ic">!</span><div>${esc(n)}</div></div>`).join("")
        + `<div class="sec"><h2>By column</h2><span class="sec__u">${state.phUp ? `pH Up at each column's default target${state.alk ? `, ${state.alk} ppm credit` : ", RO water"}` : ""}</span></div>`
        + `<div class="card"><table class="ref"><thead><tr><th>Column</th><th>Weeks</th><th>${state.metric ? "Liters" : "Gallons"}</th>${state.phUp ? "<th>Target pH</th><th>pH Up g/gal</th>" : ""}</tr></thead><tbody>${colRows}</tbody></table></div>`
        + (pu && state.phUp ? `<p class="sec__foot">pH Up per column = refit dose to pH 5.9 × target multiplier − alkalinity ÷ ${DATA.phUp.alkPpmPerGPerGal}, floored at zero. Targets match the pH Up calculator's defaults.</p>` : "");
    }

    /** @param {ReturnType<typeof usageCost>} cost @param {ReturnType<typeof usageEstimate>} est */
    function totalsHtml(cost, est) {
      const cycleWord = quick() ? "harvest" : "cycle";
      const perVol = `<div class="result__row"><span>Per ${state.metric ? "liter" : "gallon"} of feed</span><span class="num">${cost.total ? `$${fmt(state.metric ? cost.perGal / DATA.units.litersPerGallon : cost.perGal, 4)}` : "–"}</span></div>`;
      const feedYear = `<div class="result__row"><span>Feed per year</span><span class="num">${esc(unitsFor(state.metric).volume(est.totalGal * state.cycles))}</span></div>`;
      if (quick()) {
        return `<div class="result__k">Product cost per year</div><div class="result__v">${cost.total ? money(cost.perYear) : "–"}</div>
          <div class="result__row"><span>Per ${cycleWord}</span><span class="num">${cost.total ? money(cost.total) : "–"}</span></div>${perVol}${feedYear}`;
      }
      return `<div class="result__k">Cost per cycle</div><div class="result__v">${cost.total ? money(cost.total) : "–"}</div>${perVol}
        <div class="result__row"><span>Per year (${fmt(state.cycles, 0)} cycles)</span><span class="num">${cost.total ? money(cost.perYear) : "–"}</span></div>${feedYear}`;
    }

    function render() {
      document.title = "Usage Estimator · Front Row Ag";
      const app = /** @type {HTMLElement} */ (root.querySelector("[data-app]"));
      const lede = quick()
        ? "A year of product from flowering canopy, on FRA's standard feed volumes and the high-strength commercial chart."
        : "Product and cost for one cycle on the customer's feed chart, column by column.";
      app.innerHTML = barHtml({ root: "", tool: "Usage Estimator", home: "./" })
        + `<p class="banner">Team tool. Not for customers: it is not linked from the public tools page.</p>`
        + `<h1 class="title">Usage Estimator</h1><p class="lede">${lede}</p>`
        + `<div style="margin:14px 0 4px">${seg("mode", [["quick", "Quick"], ["advanced", "Advanced"]], state.mode)}</div>`
        + `<div class="split"><div>${quick() ? quickInputsHtml() : inputsHtml()}</div><div data-results>${resultsHtml()}</div></div>`
        + `<div class="actions">
            <button class="btn btn--primary" data-act="pdf" data-mode="customer">${ICONS.pdf}Customer PDF</button>
            <button class="btn" data-act="pdf" data-mode="internal">Internal PDF</button>
            <button class="btn" data-act="share" aria-label="Share link">${ICONS.link}<span class="btn__label">Share link</span></button>
          </div>`
        + footHtml({});
      renderPrint();
      syncUrl();
    }

    function renderResults() {
      const el = /** @type {HTMLElement} */ (root.querySelector("[data-results]"));
      el.innerHTML = resultsHtml();
      renderPrint();
      syncUrl();
    }

    /** @returns {import("./usage-print.js").UsagePrintView} */
    function printView() {
      const { est, cost, purchase } = results();
      const line = getLine(state.line);
      const inp = usageInput(state);
      const preset = quick() ? Q.ecPreset : state.preset;
      return {
        mode: state.printMode, root: "", est, cost, purchase, metric: state.metric, showPrices: state.showPrices, prices: state.prices,
        lineLabel: line.label, lineId: state.line,
        strengthLabel: preset === "custom" ? "Custom EC" : preset === "high" ? "High strength" : "Standard strength",
        strengthPhrase: preset === "custom" ? "custom EC targets" : preset === "high" ? "high strength" : "standard strength",
        scheduleLabel: inp.schedule === "swell-flower" ? "Swell Through Flower" : "Commercial (Stack → Swell)",
        facility: state.facility.trim(), preparedBy: state.preparedBy.trim(), date: displayDate(state.date), notes: state.notes,
        quick: quick() ? { canopyFt2: state.canopy, ...quickVolumes(state.canopy) } : null,
        inputs: {
          vegWeeks: inp.vegWeeks, vegGalPerWeek: inp.vegGalPerWeek, flowerGalPerWeek: inp.flowerGalPerWeek,
          phoszyme: Boolean(inp.phoszyme), phUp: Boolean(inp.phUp), alk: inp.alkPpm ?? 0,
          triologic: Boolean(inp.triologic), triVeg: inp.triologicVegGalPerWeek ?? 0, triFlower: inp.triologicFlowerGalPerWeek ?? 0,
          si: Boolean(inp.si), siGal: inp.siFoliarGal ?? 0, siRate: inp.siMlPerGal ?? DATA.usage.siFoliarMlPerGal,
        },
      };
    }

    function renderPrint() {
      /** @type {HTMLElement} */ (root.querySelector("[data-print]")).innerHTML = renderUsagePrint(printView());
    }

    root.innerHTML = `<div class="app" data-app></div><div class="print-root" data-print></div>`;

    root.addEventListener("click", async event => {
      const el = /** @type {HTMLElement} */ (event.target).closest("[data-act], [data-set]");
      if (!el) return;
      const set = el.getAttribute("data-set");
      const val = el.getAttribute("data-val") ?? "";
      if (set) {
        if (set === "mode") { if (val === "advanced") quickToAdvanced(state); else state.mode = "quick"; }
        else if (set === "line") { state.line = val === "cplus" ? "cplus" : "3part"; applyTier(state); }
        else if (set === "preset") { state.preset = /** @type {any} */ (val); if (val !== "custom") state.ec = { ...DATA.ecPresets[/** @type {"high" | "standard"} */ (val)] }; }
        else if (set === "schedule") state.schedule = val;
        else if (set === "units") state.metric = val === "metric";
        else /** @type {any} */ (state)[set] = !(/** @type {any} */ (state)[set]);
        return render();
      }
      const act = el.getAttribute("data-act");
      if (act === "theme") { toggleTheme(); render(); }
      else if (act === "pdf") {
        state.printMode = el.getAttribute("data-mode") === "customer" ? "customer" : "internal";
        const name = state.printMode === "customer" ? "Usage Estimate" : "Usage Analysis (internal)";
        printDocument(fileSafe(["Front Row Ag", getLine(state.line).label, name, state.facility].filter(Boolean).join(" - ")), renderPrint);
      }
      else if (act === "share") {
        const r = await shareUrl(window.location.href, "FRA usage estimate");
        if (r === "copied") toast("Link copied (prices are not in the link)");
        else if (r === "failed") toast("Couldn't copy the link");
      }
    });

    root.addEventListener("change", event => {
      const el = /** @type {HTMLSelectElement} */ (event.target);
      const which = el.getAttribute("data-select");
      if (!which) return;
      if (which === "tier") { state.tier = el.value; applyTier(state, true); }
      else if (which === "addTier") { state.addTier = el.value; applyTier(state); }
      render();
    });

    root.addEventListener("input", event => {
      const el = /** @type {HTMLInputElement} */ (event.target);
      if (el.hasAttribute("data-select")) return;
      const textKey = /** @type {"facility" | "preparedBy" | "date" | "notes" | null} */ (el.getAttribute("data-text"));
      if (textKey) {
        if (textKey === "date") { if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) state.date = el.value; }
        else state[textKey] = el.value.slice(0, TEXT_MAX[textKey]);
        if (textKey === "preparedBy") writeStored("fra-usage-rep", state.preparedBy.trim());
        renderPrint();
        if (textKey !== "notes") syncUrl();
        return;
      }
      const priceName = el.getAttribute("data-price");
      if (priceName) {
        const v = Number(el.value);
        state.prices[priceName] = el.value !== "" && Number.isFinite(v) && v > 0 ? v : null;
        writeStored("fra-usage-prices", JSON.stringify(state.prices));
        // Update costs without redrawing the price inputs.
        const { est, cost } = results();
        cost.lines.forEach(l => {
          const td = root.querySelector(`[data-cost="${CSS.escape(l.name)}"]`);
          if (td) td.textContent = l.cost ? money(l.cost) : "–";
          const year = root.querySelector(`[data-cost-year="${CSS.escape(l.name)}"]`);
          if (year) year.textContent = l.cost ? money(l.cost * state.cycles) : "–";
        });
        const totals = root.querySelector("[data-totals]");
        if (totals) totals.innerHTML = totalsHtml(cost, est);
        const unpriced = /** @type {HTMLElement | null} */ (root.querySelector("[data-unpriced]"));
        if (unpriced) { const n = unpricedNote(cost.unpriced); unpriced.hidden = !n; /** @type {HTMLElement} */ (unpriced.lastElementChild).textContent = n; }
        renderPrint();
        return;
      }
      const key = el.getAttribute("data-input");
      if (!key || el.value === "") return;
      const n = Number(el.value);
      if (!Number.isFinite(n) || n < 0) return;
      const phase = /** @type {Phase | null} */ (el.getAttribute("data-phase"));
      if (key === "ec" && phase) {
        if (n <= 0 || n > 10) return;
        state.ec[phase] = n;
        const pr = DATA.ecPresets;
        state.preset = PHASES.every(p => state.ec[p] === pr.high[p]) ? "high" : PHASES.every(p => state.ec[p] === pr.standard[p]) ? "standard" : "custom";
        root.querySelectorAll("[data-set=preset]").forEach(b => b.setAttribute("aria-pressed", String(b.getAttribute("data-val") === state.preset)));
      } else if (key === "fw" && phase) state.flowerWeeks[phase] = n;
      else /** @type {any} */ (state)[key] = VOLUME_INPUTS.has(key) && state.metric ? n / DATA.units.litersPerGallon : n;
      renderResults();
    });

    try {
      const stored = JSON.parse(readStored("fra-usage-prices") || "{}");
      if (stored && typeof stored === "object") state.prices = stored;
    } catch { /* ignore */ }
    render();
    loadPriceList(state.key).then(list => {
      state.list = list;
      state.pricesLoaded = true;
      applyTier(state);
      render();
    });
  }
}
