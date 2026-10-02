// @ts-check
// The printed usage estimate: one Letter page in the Feed Chart's print look. Two modes:
// "customer" (proposal: annual order, schedule, stated assumptions, contact line; prices
// only when the rep turns them on) and "internal" (team analysis: cost, pH Up by column,
// every input). Every number arrives already computed by the engine; this module formats.
import { DATA } from "../engine/index.js";
import { CONTACT, esc, sheetFootHtml } from "../../shared/chrome.js";

/** @typedef {ReturnType<typeof import("../engine/usage.js").usageEstimate>} Estimate */
/** @typedef {ReturnType<typeof import("../engine/usage.js").usageCost>} Cost */
/** @typedef {ReturnType<typeof import("../engine/usage.js").usagePurchase>} Purchase */

/**
 * @typedef {object} UsagePrintView
 * @property {"customer" | "internal"} mode
 * @property {string} root              Path prefix to the site root.
 * @property {Estimate} est
 * @property {Cost} cost
 * @property {Purchase} purchase
 * @property {boolean} metric
 * @property {boolean} showPrices        Customer mode: print prices and cost.
 * @property {Record<string, number | null>} prices
 * @property {string} lineLabel
 * @property {"3part" | "cplus"} lineId
 * @property {string} strengthLabel
 * @property {string} strengthPhrase     For a sentence: "high strength", "custom EC targets".
 * @property {string} scheduleLabel
 * @property {string} facility
 * @property {string} preparedBy
 * @property {string} date               Display date.
 * @property {string} notes
 * @property {{ canopyFt2: number, flowerPlants: number, vegPlants: number } | null} [quick]  Quick mode: canopy and plant counts.
 * @property {{ vegWeeks: number, vegGalPerWeek: number, flowerGalPerWeek: number, phoszyme: boolean, phUp: boolean, alk: number,
 *   triologic: boolean, triVeg: number, triFlower: number, si: boolean, siGal: number, siRate: number }} inputs
 */

const STAGES = DATA.phaseLabels.print;
/** Quick mode counts no mother plants, so its veg stage is plain "Veg". @param {UsagePrintView} v @param {number} i */
function stage(v, i) { return v.quick && i === 0 ? "Veg" : STAGES[i]; }
/** "harvests" in Quick mode (as on screen), "cycles" in the full calculator. @param {UsagePrintView} v */
function cyclesWord(v) { return v.quick ? "harvests" : "cycles"; }

/** @param {number} n @param {number} [d] */
export function fmt(n, d = 1) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
/** Weeks: whole numbers bare, fractions to 0.1. @param {number} n */
function wk(n) { return fmt(n, Number.isInteger(n) ? 0 : 1); }
/** @param {number} n */
function money(n) { return `$${fmt(n, 2)}`; }

/** Volume and amount formatting in the chosen units. */
/** @param {boolean} metric */
export function unitsFor(metric) {
  const L = DATA.units.litersPerGallon;
  return {
    vol: metric ? "L" : "gal",
    /** @param {number} gal @param {number} [d] */
    volume: (gal, d = 0) => `${fmt(metric ? gal * L : gal, d)} ${metric ? "L" : "gal"}`,
    /** @param {Purchase["products"][number]} p @param {"perCycle" | "perYear"} which */
    amount: (p, which) => {
      const v = metric ? (which === "perCycle" ? p.perCycleMetric : p.perYearMetric) : p[which];
      return `${fmt(v, 1)} ${p.liquid ? (metric ? "L" : "gal") : (metric ? "kg" : "lb")}`;
    },
    /** Short form for the phone screen. @param {Purchase["products"][number]} p */
    packShort: p => metric
      ? `${fmt(p.unitSizeMetric, 1)} ${p.liquid ? "L jug" : "kg bag"}`
      : `${fmt(p.unitSize, 0)} ${p.liquid ? "gal jug" : "lb bag"}`,
    /** @param {Purchase["products"][number]} p */
    pack: p => p.liquid
      ? `${fmt(p.unitSize, 0)} gal jug${metric ? ` (${fmt(p.unitSizeMetric, 2)} L)` : ""}`
      : `${fmt(p.unitSize, 0)} lb bag${metric ? ` (${fmt(p.unitSizeMetric, 2)} kg)` : ""}`,
  };
}

/** @param {Purchase["products"][number]} p @param {number} n */
function packages(p, n) {
  const word = p.liquid ? "jug" : "bag";
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** @param {UsagePrintView} v @param {string} kicker @param {string} title */
function head(v, kicker, title) {
  const meta = [v.date, v.preparedBy ? `Prepared by <b>${esc(v.preparedBy)}</b>` : "", "tools.frontrowag.com"].filter(Boolean).join("<br>");
  return `<header class="s-head"><img class="logo" src="${v.root}assets/feed-chart/logo-dark.png" alt="Front Row Ag">`
    + `<div class="s-title"><div class="s-kicker">${esc(kicker)}</div><h3>${esc(title)}</h3>`
    + (v.facility ? `<div class="s-for">Prepared for <b>${esc(v.facility)}</b></div>` : "")
    + `</div><div class="s-meta">${meta}</div></header>`;
}

/** @param {UsagePrintView} v */
function chips(v) {
  const u = unitsFor(v.metric);
  const list = [v.lineLabel, v.strengthLabel, v.scheduleLabel, `${u.volume(v.purchase.galPerCycle)} per cycle`, `${fmt(v.purchase.cyclesPerYear, 0)} ${cyclesWord(v)} per year`];
  return `<div class="s-setup">${list.map(c => `<span>${esc(c)}</span>`).join("")}</div>`;
}

/** @param {UsagePrintView} v */
function flowerWeeks(v) {
  return v.est.columns.filter(c => c.phase !== "Veg").reduce((sum, c) => sum + c.weeks, 0);
}

/** @param {UsagePrintView} v */
function scheduleTable(v, withPhUp = false) {
  const u = unitsFor(v.metric);
  const rows = v.est.columns.map((c, i) => {
    const perWeek = c.phase === "Veg" ? v.inputs.vegGalPerWeek : v.inputs.flowerGalPerWeek;
    return `<tr><td>${esc(stage(v, i))}</td><td>${esc(c.recipe)}</td><td class="r num">${c.ec.toFixed(1)}</td><td class="r num">${wk(c.weeks)}</td>`
      + `<td class="r num">${esc(u.volume(perWeek))}</td><td class="r num">${esc(u.volume(c.gallons))}</td>`
      + (withPhUp ? `<td class="r num">${c.phUp.target.toFixed(1)}</td><td class="r num">${c.phUp.gPerGal.toFixed(3)}${c.phUp.overMax ? " !" : ""}</td>` : "")
      + `</tr>`;
  }).join("");
  const total = `<tr class="total"><td>Per cycle</td><td></td><td></td><td class="r num">${wk(Math.round((v.inputs.vegWeeks + flowerWeeks(v)) * 10) / 10)}</td><td></td><td class="r num">${esc(u.volume(v.purchase.galPerCycle))}</td>${withPhUp ? "<td></td><td></td>" : ""}</tr>`;
  return `<table class="s-mini"><thead><tr><th>Stage</th><th>Recipe</th><th class="r">Target EC</th><th class="r">Weeks</th><th class="r">Feed per week</th><th class="r">Feed per cycle</th>`
    + (withPhUp ? `<th class="r">Target pH</th><th class="r">pH Up g/gal</th>` : "")
    + `</tr></thead><tbody>${rows}${total}</tbody></table>`;
}

/** Assumptions in plain words, built from the same inputs and engine constants. */
/** @param {UsagePrintView} v */
export function assumptions(v) {
  const u = unitsFor(v.metric);
  const i = v.inputs;
  const perVol = v.metric ? "L" : "gal";
  const phzRate = v.metric ? `${fmt(DATA.phoszyme.directGramsPerGallon / DATA.units.litersPerGallon, 2)} g/L` : `${DATA.phoszyme.directGramsPerGallon} g/gal`;
  const triRate = v.metric ? `${fmt(DATA.usage.triologicMlPerTreatedGal / DATA.units.litersPerGallon, 2)} mL/L` : `${DATA.usage.triologicMlPerTreatedGal} mL/gal`;
  const siRate = v.metric ? `${fmt(i.siRate / DATA.units.litersPerGallon, 2)} mL/L` : `${fmt(i.siRate, 1).replace(/\.0$/, "")} mL/gal`;
  const q = DATA.usage.quick;
  const quick = v.quick ? [
    `Flowering canopy of ${fmt(v.quick.canopyFt2, 0)} ft²: one plant per ${q.ftSqPerFlowerPlant} ft² (${fmt(v.quick.flowerPlants, 0)} plants), each fed ${q.flowerLitersPerPlantPerDay} L per day in flower.`,
    `Veg: ${fmt((q.vegPlantsPerFlowerPlant - 1) * 100, 0)}% more plants than flower (${fmt(v.quick.vegPlants, 0)}, for culls and spares), each fed ${q.vegLitersPerPlantPerDay} L per day. Mother plants are not included.`,
  ] : [];
  return [
    ...quick,
    `${v.lineLabel} at ${v.strengthPhrase}, ${v.scheduleLabel} schedule. Each stage uses its recipe at the target EC in the schedule above.`,
    `Each cycle: ${wk(i.vegWeeks)} weeks of veg at ${u.volume(i.vegGalPerWeek)} of feed per week, then ${wk(Math.round(flowerWeeks(v) * 10) / 10)} weeks of flower at ${u.volume(i.flowerGalPerWeek)} per week; ${fmt(v.purchase.cyclesPerYear, 0)} ${cyclesWord(v)} per year.`,
    `Feed volume is the finished feed delivered to plants. Nothing is added for runoff, flushing or spills.`,
    i.phoszyme ? `PhosZyme at ${phzRate} in every ${perVol} of feed, with the base nutrients reduced so the final EC stays on target.` : "",
    i.phUp ? `pH Up (potassium carbonate) to each stage's target pH, for source water with ${i.alk ? `${fmt(i.alk, 0)} ppm alkalinity as CaCO3` : "no alkalinity (RO)"}. Real use depends on your water and dripper pH; higher alkalinity needs less.` : "",
    i.triologic ? `Triologic at ${triRate}, once a week, on ${u.volume(i.triVeg)} per week in veg and ${u.volume(i.triFlower)} per week in flower${v.quick ? " (one day's feed each week)" : ""}.` : "",
    i.si ? `Front Row Si as a foliar spray only (never in the feed): ${u.volume(i.siGal)} of spray per cycle at ${siRate}${v.quick ? `, from ${v.metric ? `${fmt(q.siSprayGalPer100Ft2 * DATA.units.litersPerGallon, 1)} L` : `${q.siSprayGalPer100Ft2} gal`} of spray per 100 ft² of canopy once a week for the first ${q.siSpraysPerCycle} weeks of flower` : ""}.` : "",
    `Order quantities round up to whole bags and jugs for the year.`,
  ].filter(Boolean);
}

/** @param {UsagePrintView} v */
function notesBlock(v) {
  return `<div class="s-notes"><div class="s-h">Notes</div>`
    + (v.notes.trim() ? `<p class="s-typed">${esc(v.notes.trim())}</p>` : "")
    + `<div class="s-lines"></div></div>`;
}

/** @param {UsagePrintView} v */
function customer(v) {
  const u = unitsFor(v.metric);
  const priced = v.showPrices && v.cost.total > 0;
  const costByName = Object.fromEntries(v.cost.lines.map(l => [l.name, l.cost]));
  const rows = v.purchase.products.map(p => {
    const price = Number(v.prices[p.name]);
    return `<tr><td><b>${esc(p.name)}</b></td><td>${esc(u.pack(p))}</td><td class="r num">${esc(u.amount(p, "perCycle"))}</td><td class="r num">${esc(u.amount(p, "perYear"))}</td>`
      + `<td class="r num"><b>${esc(packages(p, p.perYearWholeUnits))}</b></td>`
      + (priced ? `<td class="r num">${price > 0 ? money(price) : "–"}</td><td class="r num">${costByName[p.name] ? money(costByName[p.name] * v.purchase.cyclesPerYear) : "–"}</td>` : "")
      + `</tr>`;
  }).join("");
  const totalRow = priced
    ? `<tr class="total"><td>Total per year</td><td></td><td></td><td></td><td></td><td></td><td class="r num">${money(v.cost.perYear)}</td></tr>`
    : "";
  const stats = [
    ["Feed per cycle", u.volume(v.purchase.galPerCycle)],
    [v.quick ? "Harvests per year" : "Cycles per year", fmt(v.purchase.cyclesPerYear, 0)],
    ["Feed per year", u.volume(v.purchase.galPerYear)],
    ...(priced ? [["Product per year", money(v.cost.perYear)]] : []),
  ];
  const rep = v.preparedBy ? esc(v.preparedBy) : "your Front Row Ag representative";
  return `<section class="sheet sheet--usage">`
    + head(v, "Front Row Ag · Usage estimate", "Product Usage Estimate")
    + chips(v)
    + `<div class="s-stats">${stats.map(([k, val]) => `<div><div class="s-stats__k">${esc(k)}</div><div class="s-stats__v num">${esc(val)}</div></div>`).join("")}</div>`
    + `<div class="s-block"><div class="s-h">Annual product order</div><table class="s-mini s-mini--order"><thead><tr><th>Product</th><th>Package</th><th class="r">Per cycle</th><th class="r">Per year</th><th class="r">Order per year</th>`
    + (priced ? `<th class="r">Price</th><th class="r">Cost per year</th>` : "")
    + `</tr></thead><tbody>${rows}${totalRow}</tbody></table></div>`
    + `<div class="s-block"><div class="s-h">Feed schedule</div>${scheduleTable(v)}</div>`
    + `<div class="s-block"><div class="s-h">Assumptions</div><ul class="s-list">${assumptions(v).map(a => `<li>${esc(a)}</li>`).join("")}</ul>`
    + `<p class="s-note"><i>This is a planning estimate, not a guarantee of use. Actual use depends on irrigation, water and how the program is run.</i></p></div>`
    + notesBlock(v)
    + `<div class="s-cta"><b>Questions or ready to order?</b> Contact ${rep}, or reach us at ${esc(CONTACT)}.</div>`
    + sheetFootHtml("Estimate for planning")
    + `</section>`;
}

/** @param {UsagePrintView} v */
function internal(v) {
  const u = unitsFor(v.metric);
  const i = v.inputs;
  const costByName = Object.fromEntries(v.cost.lines.map(l => [l.name, l.cost]));
  const rows = v.purchase.products.map(p => {
    const price = Number(v.prices[p.name]);
    const c = costByName[p.name] ?? 0;
    return `<tr><td>${esc(p.name)}<div class="s-sub">${esc(u.pack(p))}</div></td><td class="r num">${esc(u.amount(p, "perCycle"))}</td><td class="r num">${fmt(p.perCycleUnits, 1)}</td>`
      + `<td class="r num">${esc(u.amount(p, "perYear"))}</td><td class="r num">${fmt(p.perYearUnits, 1)} → ${p.perYearWholeUnits}</td>`
      + `<td class="r num">${price > 0 ? money(price) : "–"}</td><td class="r num">${c ? money(c) : "–"}</td><td class="r num">${c ? money(c * v.purchase.cyclesPerYear) : "–"}</td></tr>`;
  }).join("");
  const total = `<tr class="total"><td>Total</td><td></td><td></td><td></td><td></td><td></td><td class="r num">${v.cost.total ? money(v.cost.total) : "–"}</td><td class="r num">${v.cost.total ? money(v.cost.perYear) : "–"}</td></tr>`;
  const perVol = v.metric ? `$${fmt(v.cost.perGal / DATA.units.litersPerGallon, 4)} per L` : `$${fmt(v.cost.perGal, 4)} per gal`;
  const inputs = [
    ...(v.quick ? [["Flowering canopy (quick)", `${fmt(v.quick.canopyFt2, 0)} ft² · ${fmt(v.quick.flowerPlants, 0)} flower / ${fmt(v.quick.vegPlants, 0)} veg plants`]] : []),
    ["Source alkalinity", i.phUp ? (i.alk ? `${fmt(i.alk, 0)} ppm as CaCO3` : "0 (RO)") : "pH Up off"],
    ["Triologic treated per week", i.triologic ? `${u.volume(i.triVeg)} veg · ${u.volume(i.triFlower)} flower` : "off"],
    ["Si foliar spray per cycle", i.si ? `${u.volume(i.siGal)} at ${fmt(i.siRate, 1)} mL/gal` : "off"],
    ["PhosZyme", i.phoszyme ? `${DATA.phoszyme.directGramsPerGallon} g/gal in all feed` : "off"],
  ];
  const notes = [
    i.phUp ? `pH Up per stage = refit dose to pH 5.9 × target multiplier − alkalinity ÷ ${DATA.phUp.alkPpmPerGPerGal}, floored at zero. Targets match the pH Up calculator's defaults.` : "",
    i.phUp && v.lineId === "cplus" ? "C+ pH Up curves are modeled only; there is no bench check yet." : "",
    i.phUp && v.est.columns.some(c => c.phUp.overMax) ? "! A stage needs more than 0.25 g/gal pH Up at its target. It is counted; review that stage's EC and water." : "",
    v.cost.unpriced.length ? `No price for ${v.cost.unpriced.join(", ")}; not in the cost.` : "",
  ].filter(Boolean);
  return `<section class="sheet sheet--usage">`
    + head(v, "Team · usage analysis", "Usage Estimate")
    + chips(v)
    + `<div class="s-h" style="margin-top:4px">Products and cost</div>`
    + `<table class="s-mini"><thead><tr><th>Product</th><th class="r">Per cycle</th><th class="r">Bags</th><th class="r">Per year</th><th class="r">Bags/yr → order</th><th class="r">Price</th><th class="r">Cycle cost</th><th class="r">Year cost</th></tr></thead><tbody>${rows}${total}</tbody></table>`
    + `<p class="s-note">Cost ${v.cost.total ? perVol : "–"} of feed · ${esc(u.volume(v.purchase.galPerYear))} of feed per year over ${fmt(v.purchase.cyclesPerYear, 0)} cycles.</p>`
    + `<div class="s-block"><div class="s-h">By stage</div>${scheduleTable(v, i.phUp)}</div>`
    + `<div class="s-two s-two--even"><div><div class="s-h">Other inputs</div><table class="s-mini"><tbody>${inputs.map(([k, val]) => `<tr><td>${esc(k)}</td><td class="r">${esc(val)}</td></tr>`).join("")}</tbody></table></div>`
    + `<div><div class="s-h">Model notes</div>${notes.map(n => `<p class="s-note" style="margin-top:0;margin-bottom:4px">${esc(n)}</p>`).join("") || `<p class="s-note" style="margin-top:0">None.</p>`}</div></div>`
    + notesBlock(v)
    + sheetFootHtml("Internal · Front Row Ag team · not for customers")
    + `</section>`;
}

/** @param {UsagePrintView} view */
export function renderUsagePrint(view) {
  return view.mode === "customer" ? customer(view) : internal(view);
}
