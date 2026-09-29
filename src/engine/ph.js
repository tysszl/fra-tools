// @ts-check
// Dripper pH ranges. Each line has its own high-strength rule, kept as the pages have it.
import { DATA } from "./data.js";
import { recipeForPhase } from "./settings.js";

/** @typedef {import("./data.js").Phase} Phase */
/** @typedef {import("./settings.js").FeedSettings} FeedSettings */

/** @param {readonly number[]} range */
export function formatPhRange(range) {
  return `${range[0].toFixed(1)}–${range[1].toFixed(1)}`;
}

/**
 * 3-Part: the chart is high-strength flower when any phase running a flower recipe
 * (Stretch, Stack, Swell) sits at or above that recipe's High preset EC. The High
 * preset is keyed by phase; the page looks it up by recipe name.
 * On two dosers every phase counts as Swell, including the unserved Veg column.
 * @param {FeedSettings} settings
 */
export function threePartHighStrengthFlower(settings) {
  const ph = DATA.lines["3part"].ph;
  const high = /** @type {Record<string, number>} */ (DATA.ecPresets.high);
  return DATA.phases.some(phase => {
    const recipe = recipeForPhase(settings, phase);
    const hi = high[recipe];
    const ec = Number(settings.targetEc && settings.targetEc[phase]);
    return /** @type {readonly string[]} */ (ph.flowerRecipes).includes(recipe)
      && Boolean(hi) && isFinite(ec) && ec >= hi - DATA.highStrengthTolerance;
  });
}

/**
 * C+: flower (Stack, Swell) and Veg/Ripen each switch to their high-strength range when
 * any phase running that recipe sits at or above the recipe's high-strength EC.
 * On two dosers every phase counts as Swell, so Veg/Ripen never switch there.
 * @param {FeedSettings} settings
 */
export function cplusHighStrength(settings) {
  const ph = DATA.lines.cplus.ph;
  const thresholds = /** @type {Record<string, number>} */ (ph.highStrengthEc);
  let flower = false;
  let vegRipen = false;
  DATA.phases.forEach(phase => {
    const recipe = recipeForPhase(settings, phase);
    const hi = thresholds[recipe];
    const ec = Number(settings.targetEc && settings.targetEc[phase]);
    if (!hi || !isFinite(ec) || ec < hi - DATA.highStrengthTolerance) return;
    if (/** @type {readonly string[]} */ (ph.flowerRecipes).includes(recipe)) flower = true;
    else vegRipen = true;
  });
  return { flower, vegRipen };
}

/**
 * Dripper pH targets for the chart.
 * 3-Part: `flower` covers Stretch/Stack/Swell; `vegRipen` covers Veg and Ripen.
 * C+: `flower` covers Stack/Swell.
 * @param {FeedSettings} settings
 */
export function phRanges(settings) {
  if (settings.line === "cplus") {
    const ph = DATA.lines.cplus.ph;
    const high = cplusHighStrength(settings);
    const flowerRange = high.flower ? ph.flower.high : ph.flower.standard;
    const vegRipenRange = high.vegRipen ? ph.vegRipen.high : ph.vegRipen.standard;
    return {
      highStrengthFlower: high.flower,
      highStrengthVegRipen: high.vegRipen,
      flowerRange,
      vegRipenRange,
      flower: formatPhRange(flowerRange),
      vegRipen: formatPhRange(vegRipenRange),
    };
  }
  const ph = DATA.lines["3part"].ph;
  const highStrengthFlower = threePartHighStrengthFlower(settings);
  const flowerRange = highStrengthFlower ? ph.highStrengthFlower : ph.standard;
  return {
    highStrengthFlower,
    highStrengthVegRipen: false,
    flowerRange,
    vegRipenRange: ph.standard,
    flower: formatPhRange(flowerRange),
    vegRipen: formatPhRange(ph.standard),
  };
}
