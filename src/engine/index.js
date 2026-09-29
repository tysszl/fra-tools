// @ts-check
// FRA calculation engine: every number and calculation behind the Feed Chart (both
// lines, customer and team modes) and the usage estimate. Pure ES modules; no DOM.
export { DATA, deepFreeze, getLine } from "./data.js";
export { SOURCES, sourceFor } from "./sources.js";
export {
  EMPTY_CELL,
  doseGramsPerGallon,
  ecContribution,
  feedUnitDecimals,
  formatDirectPhoszymeWarning,
  formatFeedDoseFromInjectionPercent,
  getRecipe,
  isMetricUnit,
  partDose,
  phoszymeAdjustment,
  phoszymeDose,
} from "./dose.js";
export {
  cplusTwoDoserEqualRate,
  customStockRates,
  deriveRecipeSchedule,
  effectiveMethod,
  formatLbPerGal,
  formatStockTankVolume,
  normalizeCplusCaStock,
  normalizeCplusFinalPhase,
  normalizeCustomLbs,
  normalizeStockTankVolume,
  recipeForPhase,
  recipeLabels,
  recipeScheduleLabel,
  resolveFeedSettings,
  stockConcentration,
  stockConfigLabel,
  stockRates,
  tankVolumes,
  threePartPrintRecipeLabel,
} from "./settings.js";
export {
  computeFeedChart,
  cplusMetricWeightKg,
  cplusNearRipenDoses,
  feedRows,
  mixedTankDose,
  stockTable,
  threePartMetricWeightKg,
  threePartTankBloomToPartBRatio,
  threePartTwoDoserRateDisplayMlPerGalOnly,
  threePartTwoDoserTankTargetEc,
} from "./chart.js";
export { cplusHighStrength, formatPhRange, phRanges, threePartHighStrengthFlower } from "./ph.js";
export { formatRange, supplementRates, threePartPrintAdditiveRates } from "./supplements.js";
export {
  usageBagsNeeded,
  usageEstimate,
  usageProductAmount,
  usageProductCost,
  usageProducts,
  usageSiRate,
} from "./usage.js";

/** @param {number} value */
export function formatTargetEc(value) {
  return Number(value).toFixed(1);
}
