// @ts-check
// Dripper pH ranges, per chart column: each column's range follows its own recipe and
// target EC (Tyler 2026-09-29, N12). The ceilings are today's published values until
// the modeled rule replaces dripperPhRange.
import { DATA } from "./data.js";
import { recipeForPhase } from "./settings.js";

/** @typedef {import("./data.js").LineId} LineId */
/** @typedef {import("./data.js").Phase} Phase */
/** @typedef {import("./settings.js").FeedSettings} FeedSettings */

/** @param {readonly number[]} range */
export function formatPhRange(range) {
  return `${range[0].toFixed(1)}–${range[1].toFixed(1)}`;
}

/**
 * True when `ec`, rounded to the displayed 0.1, is at or above `threshold`.
 * @param {number} ec
 * @param {number | undefined} threshold
 */
function atOrAbove(ec, threshold) {
  if (!threshold || !isFinite(ec)) return false;
  const d = DATA.highStrengthEcDecimals;
  return Number(ec.toFixed(d)) >= Number(threshold.toFixed(d));
}

/**
 * Dripper pH range for one recipe at one EC.
 * 3-Part: Stretch, Stack, and Swell at or above their High preset EC run 5.5–5.8;
 * everything else 5.5–6.0. C+: Stack/Swell and Veg/Ripen each have a standard and a
 * high-strength range, switched at the recipe's high-strength EC.
 * @param {LineId} line
 * @param {string} recipe
 * @param {number} ec
 * @returns {{ range: readonly number[], highStrength: boolean, flower: boolean }}
 */
export function dripperPhRange(line, recipe, ec) {
  if (line === "cplus") {
    const ph = DATA.lines.cplus.ph;
    const flower = /** @type {readonly string[]} */ (ph.flowerRecipes).includes(recipe);
    const high = atOrAbove(ec, /** @type {Record<string, number>} */ (ph.highStrengthEc)[recipe]);
    const group = flower ? ph.flower : ph.vegRipen;
    return { range: high ? group.high : group.standard, highStrength: high, flower };
  }
  const ph = DATA.lines["3part"].ph;
  const flower = /** @type {readonly string[]} */ (ph.flowerRecipes).includes(recipe);
  // The High preset table is keyed by phase; the rule reads it by recipe name.
  const high = flower && atOrAbove(ec, /** @type {Record<string, number>} */ (DATA.ecPresets.high)[recipe]);
  return { range: high ? ph.highStrengthFlower : ph.standard, highStrength: high, flower };
}

/**
 * The chart's dripper pH, one entry per phase (null for the Veg column a 2-doser
 * does not serve).
 * @param {FeedSettings} settings
 */
export function phRanges(settings) {
  const columns = DATA.phases.map(phase => {
    if (settings.doserCount === 2 && phase === "Veg") return null;
    const recipe = recipeForPhase(settings, phase);
    const result = dripperPhRange(settings.line, recipe, Number(settings.targetEc[phase]));
    return { phase, recipe, ...result, text: formatPhRange(result.range) };
  });
  return {
    columns,
    anyHighStrengthFlower: columns.some(column => Boolean(column && column.flower && column.highStrength)),
  };
}
