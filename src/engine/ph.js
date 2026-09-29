// @ts-check
// Dripper pH ranges, per chart column: each column's ceiling is the modeled 22 °C
// calcium-phosphate limit for its own recipe and target EC (Tyler 2026-09-29, N12).
import { DATA, getLine } from "./data.js";
import { recipeForPhase } from "./settings.js";

/** @typedef {import("./data.js").LineId} LineId */
/** @typedef {import("./data.js").Phase} Phase */
/** @typedef {import("./settings.js").FeedSettings} FeedSettings */

/**
 * "5.5–5.8", or "5.5" when the range has closed to the floor.
 * @param {readonly number[]} range
 */
export function formatPhRange(range) {
  return range[1] <= range[0] ? range[0].toFixed(1) : `${range[0].toFixed(1)}–${range[1].toFixed(1)}`;
}

/**
 * The modeled 22 °C limit, unrounded; Infinity below the fit floor (limit above the cap).
 * @param {LineId} line
 * @param {string} recipe
 * @param {number} ec
 */
export function phLimit(line, recipe, ec) {
  const fit = /** @type {Record<string, { lo: number, c: readonly number[] }>} */ (getLine(line).phCeilingFit)[recipe];
  if (!fit) throw new Error(`No pH ceiling fit for ${line} ${recipe}`);
  if (!(ec >= fit.lo)) return Infinity;
  const x = Math.log10(ec);
  return fit.c[0] + fit.c[1] * x + fit.c[2] * x * x;
}

/**
 * Dripper pH range for one recipe at one EC.
 * @param {LineId} line
 * @param {string} recipe
 * @param {number} ec
 * @returns {{ range: readonly number[], ceiling: number, limit: number, atLine: boolean }}
 */
export function dripperPhRange(line, recipe, ec) {
  const rule = DATA.dripperPh;
  const limit = phLimit(line, recipe, Number(ec));
  const step = 10 ** rule.decimals;
  const rounded = Number.isFinite(limit) ? Math.round(limit * step) / step : rule.cap;
  const ceiling = Math.min(rule.cap, Math.max(rule.floor, rounded));
  return { range: [rule.floor, ceiling], ceiling, limit, atLine: limit < rule.atLineBelow };
}

/**
 * @param {FeedSettings} settings
 * @param {Phase} phase
 */
function nearRipen(settings, phase) {
  return settings.line === "cplus" && settings.doserCount === 2 && phase === "Ripen" && settings.cplusFinalPhase === "near-ripen";
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
    const ec = Number(settings.targetEc[phase]);
    let result = dripperPhRange(settings.line, recipe, ec);
    // C+ 2-doser Near Ripen sits between Swell and Ripen; it takes the lower limit.
    if (nearRipen(settings, phase)) {
      const ripen = dripperPhRange(settings.line, "Ripen", ec);
      if (ripen.limit < result.limit) result = ripen;
    }
    return { phase, recipe, ...result, text: formatPhRange(result.range) };
  });
  return {
    columns,
    anyAtLine: columns.some(column => Boolean(column && column.atLine)),
  };
}
