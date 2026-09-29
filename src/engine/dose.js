// @ts-check
// Per-part dose math, unit conversion, and the PhosZyme EC adjustment. Ported from
// src/nutrition-core.js with the same operation order so results match to the bit.
import { DATA, getLine } from "./data.js";

/** @typedef {import("./data.js").LineId} LineId */
/** @typedef {import("./data.js").Role} Role */
/** @typedef {import("./data.js").FeedUnit} FeedUnit */
/** @typedef {{ dosage: number, display: string }} FormattedDose */
/** @typedef {{ dosage: number, display: string, ec: number }} DoseCell */
/**
 * @typedef {object} PhoszymeAdjustment
 * @property {number} baseTargetEc  EC the three parts deliver after PhosZyme's share is removed.
 * @property {number} phoszymeEc    EC PhosZyme adds.
 * @property {boolean} achievable   False when DTR PhosZyme alone exceeds the target.
 * @property {number} minimumFinalEc
 */

export const EMPTY_CELL = Object.freeze({ dosage: 0, ec: 0, display: "–" });

/** @param {unknown} value */
function nonNegative(value) {
  return Math.max(0, Number(value) || 0);
}

/** @param {string} unit */
export function isMetricUnit(unit) {
  return unit === "g/L" || unit === "mL/L";
}

/** @param {string} unit */
export function feedUnitDecimals(unit) {
  if (unit === "mL/gal") return 0;
  if (unit === "mL/L" || unit === "g/gal" || unit === "g/L") return 1;
  return 2;
}

/**
 * Formats a dose given as the injection % it would need from a 1 lb/gal stock.
 * DTR doses pass through this with a stock concentration of 1. `extraDecimals` adds
 * precision for every unit except ratio (2-doser charts use 1).
 * @param {number} injectionPercent
 * @param {FeedUnit} unit
 * @returns {FormattedDose}
 */
export function formatFeedDoseFromInjectionPercent(injectionPercent, unit, extraDecimals = 0) {
  const normalizedPercent = nonNegative(injectionPercent);
  if (!(normalizedPercent > 0)) return { dosage: 0, display: "–" };
  if (unit === "ratio") {
    const ratio = Math.round(100 / normalizedPercent);
    return { dosage: ratio, display: `1:${ratio}` };
  }
  const factors = /** @type {Record<string, number | null>} */ (DATA.feedUnits.factors);
  if (!Object.hasOwn(factors, unit) || factors[unit] === null) {
    throw new Error(`Unknown feed unit: ${unit}`);
  }
  const gramsPerGallonAtOnePoundStock = normalizedPercent / 100 * DATA.units.gramsPerPound;
  const dosage = gramsPerGallonAtOnePoundStock * /** @type {number} */ (factors[unit]);
  // A dose that is not zero never prints as zero: add decimals (up to 3 more) until it shows.
  let decimals = feedUnitDecimals(unit) + extraDecimals;
  const maxDecimals = decimals + 3;
  while (decimals < maxDecimals && Number(dosage.toFixed(decimals)) === 0) decimals += 1;
  return { dosage: +dosage.toFixed(decimals), display: dosage.toFixed(decimals) };
}

/**
 * @param {LineId} lineId
 * @param {string} recipeName
 */
export function getRecipe(lineId, recipeName) {
  const recipe = /** @type {Record<string, Record<Role, number>>} */ (getLine(lineId).recipes)[recipeName];
  if (!recipe) throw new Error(`Unknown ${lineId} recipe: ${recipeName}`);
  return recipe;
}

/**
 * EC a part contributes: recipe share × target EC.
 * @param {LineId} lineId
 * @param {string} recipeName
 * @param {Role} role
 * @param {number} targetEc
 */
export function ecContribution(lineId, recipeName, role, targetEc) {
  return getRecipe(lineId, recipeName)[role] * nonNegative(targetEc);
}

/**
 * Core formula: g/gal in the final feed = share × target EC ÷ EC per g/gal.
 * @param {LineId} lineId
 * @param {string} recipeName
 * @param {Role} role
 * @param {number} targetEc
 */
export function doseGramsPerGallon(lineId, recipeName, role, targetEc) {
  const line = getLine(lineId);
  const recipe = getRecipe(lineId, recipeName);
  if (!(role in line.ecPerGram)) throw new Error(`Unknown ${lineId} role: ${role}`);
  return nonNegative(targetEc) * recipe[role] / line.ecPerGram[role];
}

/**
 * @param {object} args
 * @param {LineId} args.lineId
 * @param {string} args.recipeName
 * @param {number} args.targetEc  Final EC including PhosZyme.
 * @param {"stock" | "direct"} args.application
 * @param {boolean} [args.included]
 * @returns {PhoszymeAdjustment}
 */
export function phoszymeAdjustment({ lineId, recipeName, targetEc, application, included = true }) {
  const phz = DATA.phoszyme;
  const normalizedTarget = nonNegative(targetEc);
  if (!included) {
    return { baseTargetEc: normalizedTarget, phoszymeEc: 0, achievable: true, minimumFinalEc: 0 };
  }
  if (application === "direct") {
    return {
      baseTargetEc: Math.max(0, normalizedTarget - phz.directEc),
      phoszymeEc: phz.directEc,
      achievable: normalizedTarget >= phz.directEc,
      minimumFinalEc: phz.directEc,
    };
  }
  if (application !== "stock") throw new Error(`Unknown PhosZyme application: ${application}`);
  const line = getLine(lineId);
  const recipe = getRecipe(lineId, recipeName);
  const overheadFraction = recipe.partB
    * phz.stockCarrierRatio
    * (phz.ecPerGram / line.ecPerGram.partB);
  const baseTargetEc = normalizedTarget / (1 + overheadFraction);
  return {
    baseTargetEc,
    phoszymeEc: baseTargetEc * overheadFraction,
    achievable: true,
    minimumFinalEc: 0,
  };
}

/**
 * Warning text for DTR phases PhosZyme alone overshoots.
 * @param {string[]} phases
 */
export function formatDirectPhoszymeWarning(phases) {
  const phz = DATA.phoszyme;
  if (!phases.length) return "";
  return `PhosZyme contributes ${phz.directEc.toFixed(3)} EC by itself. ${phases.join(", ")} cannot reach the selected target at the fixed ${phz.directGramsPerGallon.toFixed(1)} g/gal rate; minimum final EC is ${phz.directEc.toFixed(3)}.`;
}

/**
 * One part's dose at a stock concentration (lb/gal; 1 for DTR).
 * @param {object} args
 * @param {LineId} args.lineId
 * @param {string} args.recipeName
 * @param {Role} args.role
 * @param {number} args.targetEc  EC the three parts deliver (PhosZyme already removed).
 * @param {number} args.stockLbPerGal
 * @param {FeedUnit} args.unit
 * @param {number} [args.extraDecimals]
 * @returns {DoseCell}
 */
export function partDose({ lineId, recipeName, role, targetEc, stockLbPerGal, unit, extraDecimals = 0 }) {
  const ec = ecContribution(lineId, recipeName, role, targetEc);
  if (ec === 0) return { ...EMPTY_CELL };
  const gramsPerGallon = doseGramsPerGallon(lineId, recipeName, role, targetEc);
  const injectionPercent = gramsPerGallon / stockLbPerGal * (100 / DATA.units.gramsPerPound);
  return { ...formatFeedDoseFromInjectionPercent(injectionPercent, unit, extraDecimals), ec };
}

/**
 * The PhosZyme row. DTR g/gal and g/L use the fixed rate; otherwise PhosZyme rides its
 * carrier (Part B / C+) and shows the carrier's rate.
 * @param {object} args
 * @param {LineId} args.lineId
 * @param {string} args.recipeName
 * @param {number} args.finalTargetEc
 * @param {"stock" | "direct"} args.application
 * @param {boolean} args.included
 * @param {number} args.carrierStockLbPerGal
 * @param {FeedUnit} args.unit
 * @returns {DoseCell}
 */
export function phoszymeDose({ lineId, recipeName, finalTargetEc, application, included, carrierStockLbPerGal, unit, extraDecimals = 0 }) {
  const phz = DATA.phoszyme;
  const adjustment = phoszymeAdjustment({ lineId, recipeName, targetEc: finalTargetEc, application, included });
  if (!included) return { ...EMPTY_CELL };
  if (application === "direct" && (unit === "g/gal" || unit === "g/L")) {
    const dosage = unit === "g/L"
      ? phz.directGramsPerGallon / DATA.units.litersPerGallon
      : phz.directGramsPerGallon;
    const decimals = phz.directDecimals[unit];
    return { dosage: +dosage.toFixed(decimals), ec: phz.directEc, display: dosage.toFixed(decimals) };
  }
  const carrier = partDose({
    lineId, recipeName, role: "partB", targetEc: adjustment.baseTargetEc,
    stockLbPerGal: carrierStockLbPerGal, unit, extraDecimals,
  });
  if (carrier.dosage === 0) return { ...EMPTY_CELL };
  return { dosage: carrier.dosage, ec: adjustment.phoszymeEc, display: carrier.display };
}
