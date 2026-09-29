// @ts-check
// pH Up (potassium carbonate) dose per chart column: the refit dose to pH 5.9 on RO
// water, scaled to the column's target pH, less the base the source water supplies.
import { DATA } from "./data.js";
import { dripperPhRange } from "./ph.js";

/** @typedef {import("./data.js").LineId} LineId */

/**
 * @param {LineId} line
 * @param {string} recipe
 */
function curve(line, recipe) {
  const byRecipe = /** @type {Record<string, readonly number[]>} */ (DATA.phUp.curves[line]);
  const fit = byRecipe && byRecipe[recipe];
  if (!fit) throw new Error(`No pH Up curve for ${line} ${recipe}`);
  return fit;
}

/**
 * g/gal of pH Up that takes the recipe at this EC to pH 5.9 on RO water.
 * @param {LineId} line
 * @param {string} recipe
 * @param {number} ec
 */
export function phUpDoseTo59(line, recipe, ec) {
  const [k, n] = curve(line, recipe);
  const value = Number(ec);
  return value > 0 ? k * value ** n : 0;
}

/**
 * Multiplier on the 5.9 dose for another target pH; linear between points, clamped.
 * @param {number} target
 */
export function phUpTargetMultiplier(target) {
  const points = DATA.phUp.targetMultiplier;
  const t = Number(target);
  if (!(t > points[0][0])) return points[0][1];
  const last = points[points.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (t <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + (y1 - y0) * (t - x0) / (x1 - x0);
    }
  }
  return last[1];
}

/**
 * g/gal of pH Up the source water's alkalinity already supplies.
 * @param {number} alkPpm  ppm as CaCO3
 */
export function phUpAlkalinityCredit(alkPpm) {
  return Math.max(0, Number(alkPpm) || 0) / DATA.phUp.alkPpmPerGPerGal;
}

/**
 * The column's dripper pH range and the default pH Up target (ceiling − 0.1, 5.5–5.9).
 * @param {LineId} line
 * @param {string} recipe
 * @param {number} ec
 * @param {{ warm?: boolean }} [options]
 */
export function phUpTarget(line, recipe, ec, { warm = false } = {}) {
  const rule = DATA.phUp;
  const ph = dripperPhRange(line, recipe, ec, warm ? -rule.warmLimitOffset : 0);
  const raw = Math.min(rule.defaultTargetMax, ph.ceiling - rule.targetBelowCeiling);
  const target = Math.max(DATA.dripperPh.floor, Math.round(raw * 10) / 10);
  return { ...ph, target };
}

/**
 * Full dose for one column.
 * @param {object} args
 * @param {LineId} args.line
 * @param {string} args.recipe
 * @param {number} args.ec
 * @param {number} [args.target]  Defaults to the column's default target.
 * @param {number} [args.alkPpm]
 * @param {boolean} [args.warm]
 */
export function phUpDose({ line, recipe, ec, target, alkPpm = 0, warm = false }) {
  const rule = DATA.phUp;
  const ph = phUpTarget(line, recipe, ec, { warm });
  const finalTarget = target === undefined || !Number.isFinite(Number(target)) ? ph.target : Number(target);
  const to59 = phUpDoseTo59(line, recipe, ec);
  const multiplier = phUpTargetMultiplier(finalTarget);
  const gross = to59 * multiplier;
  const credit = phUpAlkalinityCredit(alkPpm);
  const gPerGal = Math.max(0, gross - credit);
  const e = Number(ec);
  return {
    recipe,
    ec: e,
    target: finalTarget,
    defaultTarget: ph.target,
    ceiling: ph.ceiling,
    range: ph.range,
    limit: ph.limit,
    atLine: ph.atLine,
    to59,
    multiplier,
    gross,
    credit,
    gPerGal,
    overCeiling: finalTarget > ph.ceiling + 1e-9,
    overMax: gPerGal > rule.maxGPerGal + 1e-9,
    outsideFit: !(e >= rule.fitEc[0] && e <= rule.fitEc[1]),
  };
}

/**
 * mL of stock per gal of feed, for a stock holding `stockGPerGal` g of pH Up per gal.
 * @param {number} gPerGal
 * @param {number} stockGPerGal
 */
export function phUpStockMlPerGal(gPerGal, stockGPerGal) {
  return stockGPerGal > 0 ? gPerGal / stockGPerGal * DATA.units.millilitersPerGallon : 0;
}

/**
 * Injection % for the same stock (mL/gal ÷ 37.85).
 * @param {number} gPerGal
 * @param {number} stockGPerGal
 */
export function phUpStockPercent(gPerGal, stockGPerGal) {
  return phUpStockMlPerGal(gPerGal, stockGPerGal) / DATA.units.millilitersPerGallon * 100;
}
