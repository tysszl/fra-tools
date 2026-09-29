// @ts-check
// Usage estimator (team): product for one cycle on the customer's feed chart, column
// by column, and its cost at prices loaded from an untracked same-origin prices.json
// or typed in. The repo holds no prices.
import { DATA, getLine, usageCost, usageEstimate, usageProducts } from "../engine/index.js";
import { initTheme, toggleTheme } from "../../shared/theme.js";
import { replaceUrl, shareUrl } from "../../shared/share.js";
import { readStored, writeStored } from "../../shared/storage.js";
import { printDocument } from "../../shared/print.js";
import { ICONS, barHtml, esc, footHtml, sheetFootHtml, sheetHeadHtml, toast } from "../../shared/chrome.js";

/** @typedef {import("../engine/data.js").LineId} LineId */
/** @typedef {import("../engine/data.js").Phase} Phase */

// Internal-team gate, not security: the page is static HTML on a public host, so the
// gate keeps usage and pricing out of casual customer view. To change the code, hash the
// new one with gateHash(), replace GATE_HASH, and update the keyed link on the Notion
// Team Tools page.
const GATE_HASH = "d1c47d4d";
const GATE_STORAGE_KEY = "fra-team-key";
/** @param {string | null | undefined} s */
function gateNorm(s) { return (s || "").trim().toLowerCase(); }
/** @param {string} s */
function gateHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
/** @param {string | null | undefined} code */
function gateCheck(code) { return Boolean(code) && gateHash(gateNorm(code)) === GATE_HASH; }

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

/**
 * prices.json: { "tiers": [{ "id", "label", "prices": { name: price } }] },
 * { "prices": { name: price } }, or a flat { name: price } map.
 * @returns {Promise<Array<{ id: string, label: string, prices: Record<string, number> }>>}
 */
async function loadPriceTiers() {
  try {
    const res = await fetch("prices.json", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data.tiers)) return data.tiers.filter((/** @type {any} */ t) => t && t.id && t.prices);
    const prices = data.prices && typeof data.prices === "object" ? data.prices : data;
    return [{ id: "list", label: "Price list", prices }];
  } catch {
    return [];
  }
}

/** @param {HTMLElement} root */
export function mount(root) {
  const params = new URLSearchParams(window.location.search);
  initTheme(params);
  const urlKey = params.get("key");
  const saved = readStored(GATE_STORAGE_KEY);
  const code = gateCheck(urlKey) ? urlKey : gateCheck(saved) ? saved : null;
  if (code) { writeStored(GATE_STORAGE_KEY, gateNorm(code)); start(gateNorm(code)); } else gate();

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
      if (gateCheck(value)) {
        writeStored(GATE_STORAGE_KEY, gateNorm(value));
        start(gateNorm(value));
      } else /** @type {HTMLElement} */ (root.querySelector(".gate__err")).hidden = false;
    });
  }

  /** @param {string} key */
  function start(key) {
    /** @type {LineId} */
    const line0 = params.get("b") === "cplus" ? "cplus" : "3part";
    const preset0 = params.get("p") === "standard" ? "standard" : "high";
    const state = {
      key,
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
      cycles: num(params.get("cy"), D.cyclesPerYear, 52),
      tier: params.get("tier") ?? "",
      /** @type {Array<{ id: string, label: string, prices: Record<string, number> }>} */
      tiers: [],
      /** @type {Record<string, number | null>} */
      prices: {},
    };
    PHASES.forEach((p, i) => {
      const e = num(params.get(`e${i}`), -1, 10);
      if (e > 0 && e !== state.ec[p]) { state.ec[p] = e; state.preset = "custom"; }
    });
    FLOWER.forEach((p, i) => { state.flowerWeeks[p] = num(params.get(`w${i}`), state.flowerWeeks[p], 52); });

    function input() {
      return {
        lineId: state.line, schedule: state.schedule, ec: state.ec,
        vegWeeks: state.vegWeeks, vegGalPerWeek: state.vegGalPerWeek,
        flowerWeeks: state.flowerWeeks, flowerGalPerWeek: state.flowerGalPerWeek,
        phoszyme: state.phoszyme, phUp: state.phUp, alkPpm: state.alk,
        triologic: state.triologic, triologicVegGalPerWeek: state.triVeg, triologicFlowerGalPerWeek: state.triFlower,
        si: state.si, siFoliarGal: state.siGal, siMlPerGal: state.siRate,
      };
    }

    function applyTier() {
      const tier = state.tiers.find(t => t.id === state.tier);
      if (!tier) return;
      usageProducts(state.line).forEach(p => {
        const v = Number(tier.prices[p.name]);
        state.prices[p.name] = Number.isFinite(v) && v > 0 ? v : null;
      });
    }

    function syncUrl() {
      const p = new URLSearchParams();
      p.set("key", state.key);
      if (state.line === "cplus") p.set("b", "cplus");
      if (state.preset === "standard") p.set("p", "standard");
      if (state.schedule !== "commercial") p.set("rs", state.schedule);
      const preset = state.preset === "custom" ? null : DATA.ecPresets[state.preset];
      PHASES.forEach((ph, i) => { if (!preset || preset[ph] !== state.ec[ph]) p.set(`e${i}`, String(state.ec[ph])); });
      p.set("vw", String(state.vegWeeks));
      p.set("vg", String(state.vegGalPerWeek));
      FLOWER.forEach((ph, i) => p.set(`w${i}`, String(state.flowerWeeks[ph])));
      p.set("fg", String(state.flowerGalPerWeek));
      if (state.phoszyme) p.set("phz", "1");
      if (!state.phUp) p.set("phup", "0");
      if (state.alk) p.set("alk", String(state.alk));
      if (state.triologic) { p.set("tri", "1"); p.set("tvg", String(state.triVeg)); p.set("tfg", String(state.triFlower)); }
      if (state.si) { p.set("si", "1"); p.set("sig", String(state.siGal)); p.set("sir", String(state.siRate)); }
      p.set("cy", String(state.cycles));
      if (state.tier) p.set("tier", state.tier);
      replaceUrl(p);
    }

    /** @param {string} name @param {Array<[string, string]>} options @param {string} current */
    function seg(name, options, current) {
      return `<div class="seg" role="group">${options.map(([v, l]) => `<button type="button" data-set="${name}" data-val="${esc(v)}" aria-pressed="${v === current}">${esc(l)}</button>`).join("")}</div>`;
    }
    /** @param {string} name @param {number} value @param {string} label @param {string} [attrs] */
    function numInput(name, value, label, attrs = "") {
      return `<input class="input num" type="number" inputmode="decimal" min="0" data-input="${name}" value="${value}" aria-label="${esc(label)}" ${attrs}>`;
    }
    /** @param {string} label @param {string} body @param {string} [help] */
    function field(label, body, help = "") {
      return `<div class="field"><div class="field__label">${esc(label)}</div>${body}${help ? `<p class="field__help">${esc(help)}</p>` : ""}</div>`;
    }
    /** @param {string} name @param {boolean} on @param {string} label */
    function tog(name, on, label) {
      return `<button type="button" class="tog" data-set="${name}" aria-pressed="${on}">${esc(label)}</button>`;
    }

    function inputsHtml() {
      const grid5 = `<div class="grid5">${PHASES.map((p, i) => `<div><label>${esc(SHORT[i])}</label>${numInput("ec", state.ec[p], `EC ${p}`, `step="0.1" data-phase="${p}"`).replace(`value="${state.ec[p]}"`, `value="${state.ec[p].toFixed(1)}"`)}</div>`).join("")}</div>`;
      const weeks = `<div class="grid5">${PHASES.map((p, i) => `<div><label>${esc(SHORT[i])}</label>${p === "Veg" ? numInput("vegWeeks", state.vegWeeks, "Veg weeks", 'step="1"') : numInput("fw", state.flowerWeeks[p], `${p} weeks`, `step="1" data-phase="${p}"`)}</div>`).join("")}</div>`;
      return `<section class="card form" style="padding-bottom:6px">`
        + field("Product line", seg("line", [["3part", "3-Part"], ["cplus", "Component Plus"]], state.line))
        + field("Feed strength (target EC)", seg("preset", [["high", "High"], ["standard", "Standard"], ["custom", "Custom"]], state.preset) + `<div style="margin-top:10px">${grid5}</div>`)
        + field("Recipe schedule", seg("schedule", [["commercial", "Commercial"], ["swell-flower", "Swell Through Flower"]], state.schedule))
        + field("Weeks per column", weeks)
        + field("Gallons of feed per week", `<div class="grid3" style="grid-template-columns:1fr 1fr"><div><label>Veg</label>${numInput("vegGalPerWeek", state.vegGalPerWeek, "Veg gal per week", 'step="100"')}</div><div><label>Flower</label>${numInput("flowerGalPerWeek", state.flowerGalPerWeek, "Flower gal per week", 'step="100"')}</div></div>`)
        + field("Additives", `<div class="toggles">${tog("phoszyme", state.phoszyme, "PhosZyme")}${tog("phUp", state.phUp, "pH Up")}${tog("triologic", state.triologic, "Triologic")}${tog("si", state.si, "Si (foliar)")}</div>`)
        + (state.phUp ? field("Source water alkalinity", `<div class="input-row">${numInput("alk", state.alk, "Source alkalinity", 'step="1" max="500"')}<span>ppm as CaCO3 (RO = 0)</span></div>`,
          "pH Up is very sensitive to this: on the default 3-Part High chart, 10 ppm cuts it by about 40% and about 27 ppm removes it.") : "")
        + (state.triologic ? field("Triologic: gallons treated per week", `<div class="grid3" style="grid-template-columns:1fr 1fr"><div><label>Veg</label>${numInput("triVeg", state.triVeg, "Triologic veg gal per week", 'step="100"')}</div><div><label>Flower</label>${numInput("triFlower", state.triFlower, "Triologic flower gal per week", 'step="100"')}</div></div>`, `At ${DATA.usage.triologicMlPerTreatedGal} mL per treated gallon.`) : "")
        + (state.si ? field("Si foliar spray", `<div class="grid3" style="grid-template-columns:1fr 1fr"><div><label>Spray gal per cycle</label>${numInput("siGal", state.siGal, "Si spray gallons per cycle", 'step="10"')}</div><div><label>mL per gal</label>${numInput("siRate", state.siRate, "Si mL per gal", 'step="0.5" max="10"')}</div></div>`, "Si is foliar only, not in the feed. Label range 0.5–2 mL/gal.") : "")
        + field("Cycles per year", `<div class="input-row">${numInput("cycles", state.cycles, "Cycles per year", 'step="1" max="52"')}</div>`)
        + `</section>`;
    }

    function results() {
      const est = usageEstimate(input());
      const cost = usageCost(est, state.prices, state.cycles);
      return { est, cost };
    }

    function resultsHtml() {
      const { est, cost } = results();
      const pu = est.products.find(p => p.name === "pH Up");
      const tierSeg = state.tiers.length > 1 ? `<div style="margin:0 0 10px">${seg("tier", state.tiers.map(t => [t.id, t.label]), state.tier)}</div>` : "";
      const priceNote = state.tiers.length ? "" : `<p class="sec__foot" style="margin:0 0 10px">No price list loaded. Enter prices per bag or jug; they stay on this device.</p>`;
      const rows = est.products.filter(p => p.included).map(p => {
        const c = cost.lines.find(l => l.name === p.name);
        const unit = p.unitType === "gal" ? "gal" : "lb";
        return `<tr><td><b>${esc(p.name)}</b><div class="s">${p.unitSize} ${p.unitType === "gal" ? "gal jug" : "lb bag"}</div></td>
          <td class="num">${fmt(p.amount, 1)} ${unit}</td><td class="num">${fmt(p.units, 1)}</td>
          <td><input class="input num" style="width:86px;height:34px;text-align:right" type="number" inputmode="decimal" min="0" step="0.01" data-price="${esc(p.name)}" value="${state.prices[p.name] ?? ""}" placeholder="$" aria-label="${esc(p.name)} price"></td>
          <td class="num" data-cost="${esc(p.name)}">${c && c.cost ? money(c.cost) : "–"}</td></tr>`;
      }).join("");
      const colRows = est.columns.map((c, i) => `<tr><td><b>${esc(SHORT[i])}</b><div class="s">${esc(c.recipe)} · ${c.ec.toFixed(1)} EC</div></td><td class="num">${fmt(c.weeks, 0)}</td><td class="num">${fmt(c.gallons, 0)}</td>`
        + (state.phUp ? `<td class="num">${c.phUp.target.toFixed(1)}</td><td class="num">${c.phUp.gPerGal.toFixed(3)}${c.phUp.overMax ? ' <span class="at-line">!</span>' : ""}</td>` : "") + `</tr>`).join("");
      const notes = [
        state.phUp && state.line === "cplus" ? "C+ pH Up curves are modeled only; there is no bench check yet. Treat the C+ pH Up line as an estimate." : "",
        state.phUp && est.columns.some(c => c.phUp.overMax) ? "A column needs more than 0.25 g/gal pH Up at its target. It is counted, but review that column's EC and water." : "",
        cost.unpriced.length ? `No price for ${cost.unpriced.join(", ")}; not included in the cost.` : "",
      ].filter(Boolean);
      return `<div class="sec"><h2>Products for one cycle</h2><span class="sec__u">${fmt(est.totalGal, 0)} gal of feed</span></div>`
        + tierSeg + priceNote
        + `<div class="card"><table class="ref usage"><thead><tr><th>Product</th><th>Amount</th><th>Bags</th><th>Price</th><th>Cost</th></tr></thead><tbody>${rows}</tbody></table></div>`
        + `<section class="card result" data-totals>${totalsHtml(cost, est)}</section>`
        + notes.map(n => `<div class="card note note--warn"><span class="note__ic">!</span><div>${esc(n)}</div></div>`).join("")
        + `<div class="sec"><h2>By column</h2><span class="sec__u">${state.phUp ? `pH Up at each column's default target${state.alk ? `, ${state.alk} ppm credit` : ", RO water"}` : ""}</span></div>`
        + `<div class="card"><table class="ref"><thead><tr><th>Column</th><th>Weeks</th><th>Gallons</th>${state.phUp ? "<th>Target pH</th><th>pH Up g/gal</th>" : ""}</tr></thead><tbody>${colRows}</tbody></table></div>`
        + (pu && state.phUp ? `<p class="sec__foot">pH Up per column = refit dose to pH 5.9 × target multiplier − alkalinity ÷ ${DATA.phUp.alkPpmPerGPerGal}, floored at zero. Targets match the pH Up calculator's defaults.</p>` : "");
    }

    /** @param {ReturnType<typeof usageCost>} cost @param {ReturnType<typeof usageEstimate>} est */
    function totalsHtml(cost, est) {
      return `<div class="result__k">Cost per cycle</div><div class="result__v">${cost.total ? money(cost.total) : "–"}</div>
        <div class="result__row"><span>Per gallon of feed</span><span class="num">${cost.total ? `$${fmt(cost.perGal, 4)}` : "–"}</span></div>
        <div class="result__row"><span>Per year (${fmt(state.cycles, 0)} cycles)</span><span class="num">${cost.total ? money(cost.perYear) : "–"}</span></div>
        <div class="result__row"><span>Feed per year</span><span class="num">${fmt(est.totalGal * state.cycles, 0)} gal</span></div>`;
    }

    function render() {
      document.title = "Usage Estimator · Front Row Ag";
      const app = /** @type {HTMLElement} */ (root.querySelector("[data-app]"));
      app.innerHTML = barHtml({ root: "", tool: "Usage Estimator", home: "./" })
        + `<p class="banner">Team tool. Not for customers: it is not linked from the public tools page.</p>`
        + `<h1 class="title">Usage Estimator</h1><p class="lede">Product and cost for one cycle on the customer's feed chart, column by column.</p>`
        + `<div class="split"><div>${inputsHtml()}</div><div data-results>${resultsHtml()}</div></div>`
        + `<div class="actions">
            <button class="btn btn--primary" data-act="pdf">${ICONS.pdf}Export PDF</button>
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

    function renderPrint() {
      const { est, cost } = results();
      const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
      const chips = [getLine(state.line).label, state.preset === "custom" ? "Custom EC" : state.preset === "high" ? "High strength" : "Standard strength",
        state.schedule === "commercial" ? "Commercial (Stack → Swell)" : "Swell Through Flower",
        `${fmt(est.totalGal, 0)} gal per cycle`, state.phUp ? (state.alk ? `Source water ${state.alk} ppm` : "RO water") : "No pH Up"];
      const products = est.products.filter(p => p.included).map(p => {
        const c = cost.lines.find(l => l.name === p.name);
        return `<tr><td>${esc(p.name)}</td><td class="r num">${fmt(p.amount, 1)} ${p.unitType === "gal" ? "gal" : "lb"}</td><td class="r num">${fmt(p.units, 1)} × ${p.unitSize} ${p.unitType === "gal" ? "gal" : "lb"}</td><td class="r num">${c && c.cost ? money(c.cost) : "–"}</td></tr>`;
      }).join("");
      const cols = est.columns.map((c, i) => `<tr><td>${esc(SHORT[i])}</td><td>${esc(c.recipe)}</td><td class="r num">${c.ec.toFixed(1)}</td><td class="r num">${fmt(c.weeks, 0)}</td><td class="r num">${fmt(c.gallons, 0)}</td>${state.phUp ? `<td class="r num">${c.phUp.target.toFixed(1)}</td><td class="r num">${c.phUp.gPerGal.toFixed(3)}</td>` : ""}</tr>`).join("");
      /** @type {HTMLElement} */ (root.querySelector("[data-print]")).innerHTML = `<section class="sheet">`
        + sheetHeadHtml({ root: "", kicker: "Team · usage estimate", title: "Usage Estimate", date, chips })
        + `<div class="s-h" style="margin-top:6px">Products for one cycle</div>
          <table class="s-mini"><thead><tr><th>Product</th><th class="r">Amount</th><th class="r">Order</th><th class="r">Cost</th></tr></thead><tbody>${products}
          <tr class="total"><td>Total per cycle</td><td></td><td></td><td class="r num">${cost.total ? money(cost.total) : "–"}</td></tr></tbody></table>
          <p class="s-note">Per gallon ${cost.total ? `$${fmt(cost.perGal, 4)}` : "–"} · per year (${fmt(state.cycles, 0)} cycles) ${cost.total ? money(cost.perYear) : "–"}${cost.unpriced.length ? ` · no price for ${esc(cost.unpriced.join(", "))}` : ""}</p>`
        + `<div class="s-h" style="margin-top:16px">By column</div>
          <table class="s-mini"><thead><tr><th>Column</th><th>Recipe</th><th class="r">EC</th><th class="r">Weeks</th><th class="r">Gallons</th>${state.phUp ? '<th class="r">Target pH</th><th class="r">pH Up g/gal</th>' : ""}</tr></thead><tbody>${cols}</tbody></table>`
        + (state.phUp ? `<p class="s-note">pH Up per column = refit dose to pH 5.9 × target multiplier − alkalinity ÷ ${DATA.phUp.alkPpmPerGPerGal}, floored at zero.${state.line === "cplus" ? " C+ pH Up curves are modeled only; no bench check yet." : ""}</p>` : "")
        + `<div class="s-notes"><div class="s-h">Notes</div><div class="s-lines"></div></div>`
        + sheetFootHtml("Internal · Front Row Ag team")
        + `</section>`;
    }

    root.innerHTML = `<div class="app" data-app></div><div class="print-root" data-print></div>`;

    root.addEventListener("click", async event => {
      const el = /** @type {HTMLElement} */ (event.target).closest("[data-act], [data-set]");
      if (!el) return;
      const set = el.getAttribute("data-set");
      const val = el.getAttribute("data-val") ?? "";
      if (set) {
        if (set === "line") { state.line = val === "cplus" ? "cplus" : "3part"; applyTier(); }
        else if (set === "preset") { state.preset = /** @type {any} */ (val); if (val !== "custom") state.ec = { ...DATA.ecPresets[/** @type {"high" | "standard"} */ (val)] }; }
        else if (set === "schedule") state.schedule = val;
        else if (set === "tier") { state.tier = val; applyTier(); }
        else /** @type {any} */ (state)[set] = !(/** @type {any} */ (state)[set]);
        return render();
      }
      const act = el.getAttribute("data-act");
      if (act === "theme") { toggleTheme(); render(); }
      else if (act === "pdf") printDocument(`FRA usage estimate ${getLine(state.line).label}`, renderPrint);
      else if (act === "share") {
        const r = await shareUrl(window.location.href, "FRA usage estimate");
        if (r === "copied") toast("Link copied (prices are not in the link)");
        else if (r === "failed") toast("Couldn't copy the link");
      }
    });

    root.addEventListener("input", event => {
      const el = /** @type {HTMLInputElement} */ (event.target);
      const priceName = el.getAttribute("data-price");
      if (priceName) {
        const v = Number(el.value);
        state.prices[priceName] = el.value !== "" && Number.isFinite(v) && v > 0 ? v : null;
        writeStored("fra-usage-prices", JSON.stringify(state.prices));
        // Update costs without redrawing the price inputs.
        const { est, cost } = results();
        cost.lines.forEach(l => { const td = root.querySelector(`[data-cost="${CSS.escape(l.name)}"]`); if (td) td.textContent = l.cost ? money(l.cost) : "–"; });
        const totals = root.querySelector("[data-totals]");
        if (totals) totals.innerHTML = totalsHtml(cost, est);
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
      else /** @type {any} */ (state)[key] = n;
      renderResults();
    });

    try {
      const stored = JSON.parse(readStored("fra-usage-prices") || "{}");
      if (stored && typeof stored === "object") state.prices = stored;
    } catch { /* ignore */ }
    render();
    loadPriceTiers().then(tiers => {
      if (!tiers.length) return;
      state.tiers = tiers;
      if (!tiers.some(t => t.id === state.tier)) state.tier = tiers[0].id;
      applyTier();
      render();
    });
  }
}
