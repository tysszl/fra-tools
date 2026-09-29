// @ts-check
// Usage estimate (today's usage-calc.html): product amounts, bags, and cost for a
// veg + flower cycle. Prices are inputs; this module stores none.
import { DATA, getLine } from "./data.js";
import { doseGramsPerGallon, phoszymeAdjustment } from "./dose.js";

/** @typedef {import("./data.js").LineId} LineId */
/** @typedef {import("./data.js").Role} Role */
/** @typedef {{ feedEC: number, weeks: number, galPerWeek: number, triologicGalPerWeek: number }} UsagePhase */
/**
 * @typedef {object} UsageProduct
 * @property {string} name        Product name ("Part A", "CaNO3", "PhosZyme", "pH Up", "Si", "Triologic").
 * @property {number} price       Price per unit (bag or jug).
 * @property {number} unitSize    lb per bag, or gal per jug.
 * @property {string} unitType    "lbs" or "gal".
 * @property {boolean} isBase     True for the line's three nutrient products.
 * @property {boolean} [included] Additives only.
 */

/**
 * Si mL/gal in the feed by EC (audit N10: Si is now foliar only).
 * @param {number} feedEC
 */
export function usageSiRate(feedEC) {
  const table = DATA.usage.siRateByEc;
  if (feedEC > table.zeroAbove) return 0;
  for (const [min, rate] of table.bands) if (feedEC >= min) return rate;
  return table.below;
}

/**
 * @param {LineId} lineId
 * @param {string} productName
 * @returns {Role | undefined}
 */
function roleForProduct(lineId, productName) {
  const byRole = getLine(lineId).productsByRole;
  return /** @type {Role[]} */ (Object.keys(byRole)).find(role => byRole[role] === productName);
}

/**
 * Product list with the page's defaults and the given prices (by product name).
 * @param {LineId} lineId
 * @param {Record<string, number>} [prices]
 * @returns {UsageProduct[]}
 */
export function usageProducts(lineId, prices = {}) {
  const defaults = /** @type {Record<string, { unitSize: number, unitType: string }>} */ (DATA.usage.productDefaults[lineId]);
  const base = Object.values(getLine(lineId).productsByRole).map(name => ({
    name, price: prices[name] || 0, unitSize: defaults[name].unitSize, unitType: defaults[name].unitType, isBase: true,
  }));
  const adds = DATA.usage.additiveDefaults.map(a => ({
    name: a.name, price: prices[a.name] || 0, unitSize: a.unitSize, unitType: a.unitType, isBase: false, included: false,
  }));
  return [...base, ...adds];
}

/**
 * Amount of one product for one phase: lb for dry products, gal for liquids.
 * @param {object} args
 * @param {LineId} args.lineId
 * @param {string} args.productName
 * @param {"veg" | "flower"} args.phaseName
 * @param {UsagePhase} args.phase
 * @param {number} args.phaseVolume  gal of feed in the phase
 * @param {boolean} args.phoszymeIncluded
 */
export function usageProductAmount({ lineId, productName, phaseName, phase, phaseVolume, phoszymeIncluded }) {
  const { gramsPerPound, millilitersPerGallon } = DATA.units;
  const usage = DATA.usage;
  const role = roleForProduct(lineId, productName);
  if (role) {
    const recipeName = phaseName === "veg" ? "Veg" : usage.flowerRecipe;
    // The PhosZyme reduction always uses the flower recipe; DTR PhosZyme is recipe-independent.
    const baseFertilizerEC = phoszymeAdjustment({
      lineId, recipeName: usage.flowerRecipe, targetEc: phase.feedEC, application: "direct", included: phoszymeIncluded,
    }).baseTargetEc;
    return phaseVolume * doseGramsPerGallon(lineId, recipeName, role, baseFertilizerEC) / gramsPerPound;
  }
  if (productName === "Triologic") {
    const treatedVolume = phase.weeks * phase.triologicGalPerWeek;
    return treatedVolume * usage.triologicMlPerTreatedGal / millilitersPerGallon;
  }
  if (productName === "PhosZyme") return phaseVolume * DATA.phoszyme.directGramsPerGallon / gramsPerPound;
  if (productName === "pH Up") return phaseVolume * usage.phUpGPerGal / gramsPerPound;
  if (productName === "Si") return phaseVolume * usageSiRate(phase.feedEC) / millilitersPerGallon;
  return 0;
}

/**
 * Bags (or jugs) needed, rounded up to 0.1.
 * @param {number} totalAmount
 * @param {number} unitSize
 */
export function usageBagsNeeded(totalAmount, unitSize) {
  if (unitSize <= 0) return 0;
  const f = Math.pow(10, DATA.usage.bagRoundUpDecimals);
  return Math.ceil(totalAmount / unitSize * f) / f;
}

/**
 * @param {number} totalAmount
 * @param {number} price
 * @param {number} unitSize
 */
export function usageProductCost(totalAmount, price, unitSize) {
  if (unitSize <= 0 || price <= 0) return 0;
  return totalAmount * (price / unitSize);
}

/**
 * Full estimate for one cycle.
 * @param {object} args
 * @param {LineId} args.lineId
 * @param {UsagePhase} args.veg
 * @param {UsagePhase} args.flower
 * @param {UsageProduct[]} args.products
 */
export function usageEstimate({ lineId, veg, flower, products }) {
  const L = DATA.units.litersPerGallon;
  const vegVol = veg.weeks * veg.galPerWeek;
  const flowerVol = flower.weeks * flower.galPerWeek;
  const totalVol = vegVol + flowerVol;
  const phoszymeIncluded = Boolean(products.find(p => p.name === "PhosZyme")?.included);
  const results = {
    vegVol, flowerVol, totalVol,
    totalVolL: totalVol * L,
    /** @type {any[]} */
    products: [],
    totalCost: 0,
    costPerGal: 0,
    costPerL: 0,
  };
  for (const product of products) {
    if (!product.isBase && !product.included) {
      results.products.push({
        name: product.name, unitType: product.unitType, isBase: product.isBase,
        vegAmount: 0, flowerAmount: 0, totalAmount: 0, bags: 0,
        vegCost: 0, flowerCost: 0, totalCost: 0, costPerGal: 0,
      });
      continue;
    }
    const common = { lineId, productName: product.name, phoszymeIncluded };
    const vegAmount = usageProductAmount({ ...common, phaseName: "veg", phase: veg, phaseVolume: vegVol });
    const flowerAmount = usageProductAmount({ ...common, phaseName: "flower", phase: flower, phaseVolume: flowerVol });
    const totalAmount = vegAmount + flowerAmount;
    const bags = usageBagsNeeded(totalAmount, product.unitSize);
    const vegCost = usageProductCost(vegAmount, product.price, product.unitSize);
    const flowerCost = usageProductCost(flowerAmount, product.price, product.unitSize);
    const totalCost = vegCost + flowerCost;
    results.products.push({
      name: product.name, unitType: product.unitType, isBase: product.isBase,
      vegAmount, flowerAmount, totalAmount, bags,
      vegCost, flowerCost, totalCost,
      costPerGal: totalVol > 0 ? totalCost / totalVol : 0,
    });
    results.totalCost += totalCost;
  }
  results.costPerGal = totalVol > 0 ? results.totalCost / totalVol : 0;
  results.costPerL = totalVol > 0 ? results.totalCost / (totalVol * L) : 0;
  return results;
}
