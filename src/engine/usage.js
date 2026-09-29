// @ts-check
// Usage estimate for one cycle, column by column on the feed schedule: each chart
// column's recipe and EC, its weeks and gallons, and the products it uses. Prices are
// inputs; this module stores none.
import { DATA, getLine } from "./data.js";
import { doseGramsPerGallon, phoszymeAdjustment } from "./dose.js";
import { phUpDose } from "./phup.js";

/** @typedef {import("./data.js").LineId} LineId */
/** @typedef {import("./data.js").Phase} Phase */
/**
 * @typedef {object} UsageInput
 * @property {LineId} lineId
 * @property {string} [schedule]                 "commercial" (default) or "swell-flower"
 * @property {Partial<Record<Phase, number>>} ec Target EC per chart column (final, incl. PhosZyme).
 * @property {number} vegWeeks
 * @property {number} vegGalPerWeek
 * @property {Partial<Record<Phase, number>>} flowerWeeks  Stretch, Stack, Swell, Ripen columns.
 * @property {number} flowerGalPerWeek
 * @property {boolean} [phoszyme]
 * @property {boolean} [phUp]
 * @property {number} [alkPpm]                   Source alkalinity, ppm as CaCO3.
 * @property {boolean} [triologic]
 * @property {number} [triologicVegGalPerWeek]   Gallons treated per week.
 * @property {number} [triologicFlowerGalPerWeek]
 * @property {boolean} [si]
 * @property {number} [siFoliarGal]              Foliar spray gallons per cycle.
 * @property {number} [siMlPerGal]
 */
/**
 * @typedef {object} UsageProduct
 * @property {string} name
 * @property {number} unitSize   lb per bag, or gal per jug.
 * @property {string} unitType   "lbs" or "gal".
 * @property {boolean} isBase
 */

/** @param {unknown} value */
function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Products in display order with their package sizes.
 * @param {LineId} lineId
 * @returns {UsageProduct[]}
 */
export function usageProducts(lineId) {
  const defaults = /** @type {Record<string, { unitSize: number, unitType: string }>} */ (DATA.usage.productDefaults[lineId]);
  const base = Object.values(getLine(lineId).productsByRole).map(name => ({ name, ...defaults[name], isBase: true }));
  const adds = DATA.usage.additiveDefaults.map(a => ({ ...a, isBase: false }));
  return [...base, ...adds];
}

/**
 * Each chart column with its recipe, EC, weeks, gallons, and pH Up dose.
 * @param {UsageInput} input
 */
export function usageColumns(input) {
  const line = getLine(input.lineId);
  const schedule = /** @type {Record<string, Record<Phase, string>>} */ (line.schedules)[input.schedule ?? DATA.recipeSchedules.defaultSchedule]
    ?? line.schedules.commercial;
  return DATA.phases.map(phase => {
    const recipe = schedule[phase];
    const ec = nonNegative(input.ec[phase]);
    const veg = phase === "Veg";
    const weeks = veg ? nonNegative(input.vegWeeks) : nonNegative(input.flowerWeeks[phase]);
    const gallons = weeks * (veg ? nonNegative(input.vegGalPerWeek) : nonNegative(input.flowerGalPerWeek));
    const phUp = phUpDose({ line: input.lineId, recipe, ec, alkPpm: input.alkPpm ?? 0 });
    return { phase, recipe, ec, weeks, gallons, phUp };
  });
}

/**
 * Amount of each product per column: lb for dry products, gal for liquids.
 * @param {UsageInput} input
 */
export function usageEstimate(input) {
  const { gramsPerPound, millilitersPerGallon, litersPerGallon } = DATA.units;
  const line = getLine(input.lineId);
  const columns = usageColumns(input);
  const totalGal = columns.reduce((sum, c) => sum + c.gallons, 0);
  /** @type {Record<string, string>} */
  const roleByName = Object.fromEntries(Object.entries(line.productsByRole).map(([role, name]) => [name, role]));

  /** @param {UsageProduct} product */
  function perColumn(product) {
    const role = roleByName[product.name];
    return columns.map(c => {
      if (role) {
        const base = phoszymeAdjustment({
          lineId: input.lineId, recipeName: c.recipe, targetEc: c.ec, application: "direct", included: Boolean(input.phoszyme),
        }).baseTargetEc;
        return c.gallons * doseGramsPerGallon(input.lineId, c.recipe, /** @type {any} */ (role), base) / gramsPerPound;
      }
      if (product.name === "PhosZyme") return input.phoszyme ? c.gallons * DATA.phoszyme.directGramsPerGallon / gramsPerPound : 0;
      if (product.name === "pH Up") return input.phUp ? c.gallons * c.phUp.gPerGal / gramsPerPound : 0;
      if (product.name === "Triologic") {
        if (!input.triologic) return 0;
        const perWeek = c.phase === "Veg" ? input.triologicVegGalPerWeek : input.triologicFlowerGalPerWeek;
        return c.weeks * nonNegative(perWeek) * DATA.usage.triologicMlPerTreatedGal / millilitersPerGallon;
      }
      return 0;
    });
  }

  const products = usageProducts(input.lineId).map(product => {
    let byColumn = perColumn(product);
    let amount = byColumn.reduce((sum, v) => sum + v, 0);
    let included = product.isBase || Boolean(/** @type {any} */ (input)[{ PhosZyme: "phoszyme", "pH Up": "phUp", Triologic: "triologic", Si: "si" }[product.name] ?? ""]);
    if (product.name === "Si") {
      // Foliar only, not in the feed: spray gallons × mL/gal.
      const ml = input.siMlPerGal === undefined ? DATA.usage.siFoliarMlPerGal : nonNegative(input.siMlPerGal);
      amount = input.si ? nonNegative(input.siFoliarGal) * ml / millilitersPerGallon : 0;
      byColumn = columns.map(() => 0);
    }
    return { ...product, included, byColumn, amount, units: usageUnitsNeeded(amount, product.unitSize) };
  });
  return { columns, products, totalGal, totalL: totalGal * litersPerGallon };
}

/**
 * Bags (or jugs) needed, rounded up to 0.1.
 * @param {number} amount
 * @param {number} unitSize
 */
export function usageUnitsNeeded(amount, unitSize) {
  if (!(unitSize > 0)) return 0;
  const f = 10 ** DATA.usage.bagRoundUpDecimals;
  return Math.ceil(amount / unitSize * f - 1e-9) / f;
}

/**
 * Cost of the estimate at the given prices (per bag or jug, by product name). Products
 * without a price cost nothing and are listed in `unpriced`.
 * @param {ReturnType<typeof usageEstimate>} estimate
 * @param {Record<string, number | null | undefined>} prices
 * @param {number} [cyclesPerYear]
 */
export function usageCost(estimate, prices, cyclesPerYear = 1) {
  /** @type {string[]} */
  const unpriced = [];
  const lines = estimate.products.filter(p => p.included).map(p => {
    const price = Number(prices[p.name]);
    const priced = Number.isFinite(price) && price > 0;
    if (!priced && p.amount > 0) unpriced.push(p.name);
    const cost = priced ? p.amount * price / p.unitSize : 0;
    return { name: p.name, cost };
  });
  const total = lines.reduce((sum, l) => sum + l.cost, 0);
  return {
    lines,
    total,
    perGal: estimate.totalGal > 0 ? total / estimate.totalGal : 0,
    perYear: total * Math.max(0, cyclesPerYear),
    unpriced,
  };
}
