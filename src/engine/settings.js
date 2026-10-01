// @ts-check
// Feed Chart settings: defaults, normalization, and the lookups that depend on them
// (recipe per phase, stock strength per tank, tank volumes, schedule labels).
import { DATA, getLine } from "./data.js";

/** @typedef {import("./data.js").LineId} LineId */
/** @typedef {import("./data.js").Role} Role */
/** @typedef {import("./data.js").Phase} Phase */
/** @typedef {import("./data.js").FeedUnit} FeedUnit */
/** @typedef {import("./data.js").RoleValues} RoleValues */

/**
 * @typedef {object} FeedSettings
 * @property {LineId} line
 * @property {"stock" | "direct"} application
 * @property {2 | 3} doserCount                 2 is stock-only.
 * @property {string} method                    3-doser stock method ("3-2-2", "4-3-3", "1-1-1", team-mode "custom"; C+ "1-1-1").
 * @property {RoleValues} customLbs             Team-mode custom charge per tank (lb), 3-Part only.
 * @property {number} stockTankVolumeGal        3-Part 2-doser and custom; every C+ tank.
 * @property {number} cplusCaStockLbPerGal      C+ 2-doser CaNO3 stock (0.75 or 1.00).
 * @property {"swell" | "near-ripen"} cplusFinalPhase  C+ 2-doser final phase.
 * @property {FeedUnit} unit
 * @property {"high" | "standard" | "custom"} ecPreset
 * @property {Record<Phase, number>} targetEc
 * @property {string} recipeSchedule            "commercial", "swell-flower", or "custom".
 * @property {Record<Phase, string>} phaseRecipe
 * @property {boolean} usePhoszyme
 */

/**
 * @param {LineId} lineId
 * @param {unknown} value
 */
export function normalizeStockTankVolume(lineId, value) {
  const limits = getLine(lineId).stockTankVolume;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < limits.minGal) return limits.defaultGal;
  return Math.round(Math.min(parsed, limits.maxGal) * 10) / 10;
}

/**
 * "50" or "37.5".
 * @param {LineId} lineId
 * @param {unknown} value
 */
export function formatStockTankVolume(lineId, value) {
  const normalized = normalizeStockTankVolume(lineId, value);
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
}

/** @param {unknown} value */
export function normalizeCplusCaStock(value) {
  const twoDoser = DATA.lines.cplus.twoDoser;
  const parsed = Number(value);
  return /** @type {readonly number[]} */ (twoDoser.caStockOptions).includes(parsed) ? parsed : twoDoser.defaultCaStock;
}

/** @param {unknown} value */
export function normalizeCplusFinalPhase(value) {
  const twoDoser = DATA.lines.cplus.twoDoser;
  return /** @type {readonly unknown[]} */ (twoDoser.finalPhaseOptions).includes(value)
    ? /** @type {"swell" | "near-ripen"} */ (value)
    : /** @type {"swell"} */ (twoDoser.defaultFinalPhase);
}

/**
 * Team-mode custom charge: clamped to 0.1 lb/gal .. the per-part cap, rounded to 0.1 lb.
 * @param {Role} role
 * @param {unknown} value
 * @param {number} tankGal  Normalized tank volume.
 */
export function normalizeCustomLbs(role, value, tankGal) {
  const custom = DATA.lines["3part"].customStock;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return custom.defaultLbs[role];
  const clamped = Math.min(Math.max(parsed, custom.minLbPerGal * tankGal), custom.maxLbPerGal[role] * tankGal);
  return Math.round(clamped * 10) / 10;
}

/**
 * lb/gal per tank from a custom charge, rounded to 0.001.
 * @param {RoleValues} customLbs
 * @param {number} tankGal
 * @returns {RoleValues}
 */
export function customStockRates(customLbs, tankGal) {
  /** @type {any} */
  const rates = {};
  /** @type {Role[]} */ (["partA", "partB", "bloom"]).forEach(role => {
    rates[role] = Math.round(customLbs[role] / tankGal * 1000) / 1000;
  });
  return rates;
}

/** @param {number} value */
export function formatLbPerGal(value) {
  return String(Math.round(value * 100) / 100);
}

/**
 * Fills defaults and applies the page rules: presets set target EC, schedules set
 * recipes, DTR has no 2-doser, and the unit must fit the application.
 * @param {Partial<FeedSettings> & { line?: LineId }} [input]
 * @returns {FeedSettings}
 */
export function resolveFeedSettings(input = {}) {
  const lineId = input.line ?? "3part";
  const line = getLine(lineId);
  const application = input.application === "direct" ? "direct" : "stock";
  const doserCount = application === "stock" && input.doserCount === 2 ? 2 : 3;
  const validMethods = /** @type {string[]} */ ([...line.methods, ...(lineId === "3part" ? ["custom"] : [])]);
  const method = input.method && validMethods.includes(input.method) ? input.method : line.defaultMethod;
  const ecPreset = input.ecPreset ?? /** @type {"high"} */ (DATA.defaultEcPreset);
  const presetTargets = ecPreset === "custom" ? DATA.ecPresets.high : DATA.ecPresets[ecPreset];
  const targetEc = ecPreset === "custom"
    ? { ...presetTargets, ...(input.targetEc ?? {}) }
    : { ...presetTargets };
  const schedules = /** @type {Record<string, Record<Phase, string>>} */ (line.schedules);
  const recipeSchedule = input.recipeSchedule ?? DATA.recipeSchedules.defaultSchedule;
  const phaseRecipe = recipeSchedule === "custom"
    ? { ...schedules[DATA.recipeSchedules.defaultSchedule], ...(input.phaseRecipe ?? {}) }
    : { ...(schedules[recipeSchedule] ?? schedules[DATA.recipeSchedules.defaultSchedule]) };
  const validUnits = /** @type {readonly string[]} */ (application === "stock" ? DATA.feedUnits.stock : DATA.feedUnits.direct);
  const unit = /** @type {FeedUnit} */ (input.unit && validUnits.includes(input.unit) ? input.unit : validUnits[0]);
  const stockTankVolumeGal = normalizeStockTankVolume(lineId, input.stockTankVolumeGal ?? line.stockTankVolume.defaultGal);
  const defaults = DATA.lines["3part"].customStock.defaultLbs;
  const rawLbs = input.customLbs ?? defaults;
  const customLbs = {
    partA: normalizeCustomLbs("partA", rawLbs.partA, stockTankVolumeGal),
    partB: normalizeCustomLbs("partB", rawLbs.partB, stockTankVolumeGal),
    bloom: normalizeCustomLbs("bloom", rawLbs.bloom, stockTankVolumeGal),
  };
  return {
    line: lineId,
    application,
    doserCount,
    method,
    customLbs,
    stockTankVolumeGal,
    cplusCaStockLbPerGal: normalizeCplusCaStock(input.cplusCaStockLbPerGal ?? DATA.lines.cplus.twoDoser.defaultCaStock),
    cplusFinalPhase: normalizeCplusFinalPhase(input.cplusFinalPhase),
    unit,
    ecPreset,
    targetEc,
    recipeSchedule: deriveRecipeSchedule(lineId, phaseRecipe),
    phaseRecipe,
    usePhoszyme: Boolean(input.usePhoszyme),
  };
}

/**
 * The schedule whose recipes match, else "custom".
 * @param {LineId} lineId
 * @param {Record<string, string>} phaseRecipe
 */
export function deriveRecipeSchedule(lineId, phaseRecipe) {
  const schedules = /** @type {Record<string, Record<string, string>>} */ (getLine(lineId).schedules);
  const match = Object.entries(schedules)
    .find(([, recipe]) => DATA.phases.every(phase => recipe[phase] === phaseRecipe[phase]));
  return match ? match[0] : "custom";
}

/**
 * The stock method in effect: "2-doser" for two dosers, else the chosen method.
 * @param {FeedSettings} settings
 */
export function effectiveMethod(settings) {
  return settings.doserCount === 2 ? "2-doser" : settings.method;
}

/**
 * The recipe the math uses for a phase. Two dosers lock every phase to Swell,
 * including Veg (which the 2-doser chart leaves blank).
 * @param {FeedSettings} settings
 * @param {Phase} phase
 */
export function recipeForPhase(settings, phase) {
  return settings.doserCount === 2 ? getLine(settings.line).twoDoser.recipe : settings.phaseRecipe[phase];
}

/**
 * Recipe names as the chart prints them. Two dosers show "Veg" over the unserved
 * Veg / Moms column and, on C+, "Near Ripen" for that final phase.
 * @param {FeedSettings} settings
 * @param {Phase} phase
 */
export function recipeLabel(settings, phase) {
  if (settings.doserCount !== 2) return settings.phaseRecipe[phase];
  if (phase === "Veg") return "Veg";
  if (settings.line === "cplus" && phase === "Ripen" && settings.cplusFinalPhase === "near-ripen") return "Near Ripen";
  return "Swell";
}

/**
 * lb/gal per tank for a stock method.
 * @param {FeedSettings} settings
 * @param {string} [method]
 * @returns {RoleValues}
 */
export function stockRates(settings, method = effectiveMethod(settings)) {
  if (settings.line === "3part" && method === "custom") {
    return customStockRates(settings.customLbs, settings.stockTankVolumeGal);
  }
  const line = getLine(settings.line);
  const entry = /** @type {Record<string, { rates: RoleValues }>} */ (line.stockMethods)[method];
  if (!entry) throw new Error(`Unknown ${settings.line} stock method: ${method}`);
  const rates = { ...entry.rates };
  if (settings.line === "cplus" && method === "2-doser") rates.partA = normalizeCplusCaStock(settings.cplusCaStockLbPerGal);
  return rates;
}

/**
 * Stock strength the dose math divides by: lb/gal for stock, 1 for DTR.
 * @param {FeedSettings} settings
 * @param {Role} role
 */
export function stockConcentration(settings, role) {
  if (settings.application === "direct") return 1;
  return stockRates(settings)[role];
}

/**
 * Finished stock volume (gal) of Tank 1 (partA) and the other tanks (tankB).
 * @param {FeedSettings} settings
 * @param {string} [method]
 */
export function tankVolumes(settings, method = effectiveMethod(settings)) {
  if (settings.line === "cplus") {
    const volume = normalizeStockTankVolume("cplus", settings.stockTankVolumeGal);
    return { tankA: volume, tankB: volume };
  }
  const line = DATA.lines["3part"];
  if (settings.doserCount === 2) {
    const tankA = normalizeStockTankVolume("3part", settings.stockTankVolumeGal);
    return { tankA, tankB: Math.round(tankA * line.twoDoser.tank2VolumeFactor * 10) / 10 };
  }
  if (method === "custom") {
    const volume = normalizeStockTankVolume("3part", settings.stockTankVolumeGal);
    return { tankA: volume, tankB: volume };
  }
  const entry = /** @type {Record<string, { tankVolumes: { tankA: number, tankB: number } }>} */ (line.stockMethods)[method];
  return { ...entry.tankVolumes };
}

/**
 * Label for the stock build: "3-2-2", "2-Doser", or "Custom 1.5/1/1 lb/gal" (3-Part).
 * @param {FeedSettings} settings
 */
export function stockConfigLabel(settings) {
  if (settings.doserCount === 2) return "2-Doser";
  if (settings.line === "3part" && settings.method === "custom") {
    const r = customStockRates(settings.customLbs, settings.stockTankVolumeGal);
    return `Custom ${formatLbPerGal(r.partA)}/${formatLbPerGal(r.partB)}/${formatLbPerGal(r.bloom)} lb/gal`;
  }
  return settings.method;
}

/**
 * Schedule label for the config line.
 * @param {FeedSettings} settings
 */
export function recipeScheduleLabel(settings) {
  const options = /** @type {Record<string, { label: string, printLabel?: string }>} */ (DATA.recipeSchedules.options);
  if (settings.doserCount === 2) {
    return settings.line === "cplus" && settings.cplusFinalPhase === "near-ripen"
      ? "Swell + Near Ripen"
      : options["locked-swell"].label;
  }
  const option = options[settings.recipeSchedule];
  return option.printLabel || option.label;
}

/**
 * C+ 2-doser: both dosers run one rate only with 0.75 lb/gal CaNO3 and a Swell final phase.
 * @param {FeedSettings} settings
 */
export function cplusTwoDoserEqualRate(settings) {
  return normalizeCplusCaStock(settings.cplusCaStockLbPerGal) === DATA.lines.cplus.twoDoser.defaultCaStock
    && settings.cplusFinalPhase === "swell";
}
