// @ts-check
// FRA calculation engine: every number and calculation behind the Feed Chart (both
// lines, customer and team modes), pH Up, pH Down, and the usage estimate. Pure ES modules; no DOM.
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
  recipeLabel,
  recipeScheduleLabel,
  resolveFeedSettings,
  stockConcentration,
  stockConfigLabel,
  stockRates,
  tankVolumes,
} from "./settings.js";
export {
  computeFeedChart,
  cplusNearRipenDoses,
  feedRows,
  mixedTankDose,
  stockTable,
  metricWeightKg,
  tank2BloomToPartBRatio,
  extraDecimals,
  twoDoserTank2TargetEc,
} from "./chart.js";
export { dripperPhRange, formatPhRange, phLimit, phRanges } from "./ph.js";
export { formatRange, supplementRates } from "./supplements.js";
export {
  phUpAlkalinityCredit,
  phUpDose,
  phUpDoseTo59,
  phUpStockMlPerGal,
  phUpStockPercent,
  phUpTarget,
  phUpTargetMultiplier,
} from "./phup.js";
export { phDownDose, phDownReference } from "./phdown.js";
export { usageColumns, usageCost, usageEstimate, usageProducts, usageUnitsNeeded } from "./usage.js";

/** @param {number} value */
export function formatTargetEc(value) {
  return Number(value).toFixed(1);
}
