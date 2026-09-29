// @ts-check
// The Feed Chart: per-phase rows for every part, the 2-doser solvers for both lines,
// the stock tank table, and the PhosZyme warning. Pure; reproduces feed-calc.html,
// feed-calc-admin.html, and cplus-calc.html.
import { DATA, getLine } from "./data.js";
import {
  EMPTY_CELL,
  ecContribution,
  formatDirectPhoszymeWarning,
  formatFeedDoseFromInjectionPercent,
  getRecipe,
  isMetricUnit,
  partDose,
  phoszymeAdjustment,
  phoszymeDose,
} from "./dose.js";
import {
  effectiveMethod,
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
import { phRanges } from "./ph.js";

/** @typedef {import("./data.js").Phase} Phase */
/** @typedef {import("./data.js").Role} Role */
/** @typedef {import("./data.js").FeedUnit} FeedUnit */
/** @typedef {import("./dose.js").DoseCell} DoseCell */
/** @typedef {import("./settings.js").FeedSettings} FeedSettings */
/**
 * @typedef {object} FeedRow
 * @property {"partA" | "partB" | "partB+phoszyme" | "phoszyme" | "bloom" | "tank2"} key
 * @property {string} label
 * @property {Array<DoseCell | null>} cells  One per phase; null where the build serves no feed.
 */
/**
 * @typedef {object} StockRow
 * @property {"partA" | "partB" | "phz" | "bloom"} key
 * @property {number | string} tank
 * @property {string} part
 * @property {number} vol   gal, or L (rounded) for metric units
 * @property {number} wt    lb, or kg for metric units
 * @property {number} conc  lb/gal, or g/L (rounded) for metric units
 * @property {number} sample  mL of stock in the validation sample
 * @property {number | string} ecG  EC per g/gal (number), or per g/L (string, 3 decimals)
 * @property {number} valEC  Validation EC of the sample
 */
/**
 * @typedef {object} StockTable
 * @property {string} volUnit
 * @property {string} wtUnit
 * @property {string} concUnit
 * @property {string} sampleUnit
 * @property {string} ecUnit
 * @property {StockRow[]} rows  Always includes the PhosZyme row; hide it when PhosZyme is off.
 * @property {string | null} tank2Total  2-doser combined Tank 2 validation EC (2 decimals).
 */

/**
 * @param {FeedSettings} settings
 * @param {Phase} phase
 */
function phaseAdjustment(settings, phase) {
  return phoszymeAdjustment({
    lineId: settings.line,
    recipeName: recipeForPhase(settings, phase),
    targetEc: settings.targetEc[phase],
    application: settings.application,
    included: settings.usePhoszyme,
  });
}

/**
 * @param {FeedSettings} settings
 * @param {Phase} phase
 * @param {Role} role
 * @param {number} targetEc
 * @returns {DoseCell}
 */
function roleDose(settings, phase, role, targetEc) {
  return partDose({
    lineId: settings.line,
    recipeName: recipeForPhase(settings, phase),
    role,
    targetEc,
    stockLbPerGal: stockConcentration(settings, role),
    unit: settings.unit,
    extraDecimals: extraDecimals(settings),
  });
}

/**
 * 2-doser tanks run at different rates, so their rates print one decimal finer in
 * every unit (ratio excepted).
 * @param {FeedSettings} settings
 */
export function extraDecimals(settings) {
  return settings.doserCount === 2 ? 1 : 0;
}

// ── 3-Part 2-doser ──────────────────────────────────────────────────────────

/**
 * Bloom:Part B by weight as Tank 2 is charged (50 lb : 28 lb).
 * @param {FeedSettings} settings
 */
export function threePartTankBloomToPartBRatio(settings) {
  const rates = stockRates(settings);
  return rates.bloom / rates.partB;
}

/**
 * The EC to hand the Part B dose math so Part B plus the Bloom riding with it deliver
 * Tank 2's combined recipe share of the target.
 * @param {FeedSettings} settings
 * @param {Phase} phase
 * @param {number} targetEc
 */
export function threePartTwoDoserTankTargetEc(settings, phase, targetEc) {
  const recipe = getRecipe("3part", recipeForPhase(settings, phase));
  const ecPerGram = DATA.lines["3part"].ecPerGram;
  const share = recipe.partB + recipe.bloom;
  if (!(share > 0) || !(recipe.partB > 0)) return targetEc;
  const ecPerGramB = ecPerGram.partB + ecPerGram.bloom * threePartTankBloomToPartBRatio(settings);
  return targetEc * share * ecPerGram.partB / (recipe.partB * ecPerGramB);
}

/**
 * @param {FeedSettings} settings
 * @returns {FeedRow[]}
 */
function threePartRows(settings) {
  const line = DATA.lines["3part"];
  const is2Doser = settings.doserCount === 2;
  const usePhz = settings.usePhoszyme;
  const phases = /** @type {Phase[]} */ ([...DATA.phases]);
  /** @type {FeedRow[]} */
  const rows = [];

  rows.push({
    key: "partA",
    label: line.productsByRole.partA,
    cells: phases.map(phase => {
      if (is2Doser && phase === "Veg") return null;
      const eEC = phaseAdjustment(settings, phase).baseTargetEc;
      const r = roleDose(settings, phase, "partA", eEC);
      return { display: r.display, dosage: r.dosage, ec: r.ec };
    }),
  });

  if (is2Doser) {
    rows.push({
      key: "tank2",
      label: usePhz ? line.twoDoserComboPhzLabel : line.twoDoserComboLabel,
      cells: phases.map(phase => {
        if (phase === "Veg") return null;
        const adjustment = phaseAdjustment(settings, phase);
        const eEC = adjustment.baseTargetEc;
        const t2EC = threePartTwoDoserTankTargetEc(settings, phase, eEC);
        const resultB = roleDose(settings, phase, "partB", t2EC);
        const gramsB = (t2EC * getRecipe("3part", recipeForPhase(settings, phase)).partB) / line.ecPerGram.partB;
        const partBEc = gramsB * line.ecPerGram.partB;
        const bloomEc = gramsB * threePartTankBloomToPartBRatio(settings) * line.ecPerGram.bloom;
        let combinedEc = partBEc + bloomEc;
        if (usePhz) combinedEc += adjustment.phoszymeEc;
        return { display: resultB.display, dosage: resultB.dosage, ec: combinedEc };
      }),
    });
    return rows;
  }

  if (usePhz && settings.application === "stock") {
    rows.push({
      key: "partB+phoszyme",
      label: line.phzComboLabel,
      cells: phases.map(phase => {
        const adjustment = phaseAdjustment(settings, phase);
        const resultB = roleDose(settings, phase, "partB", adjustment.baseTargetEc);
        return { display: resultB.display, dosage: resultB.dosage, ec: resultB.ec + adjustment.phoszymeEc };
      }),
    });
  } else {
    rows.push({
      key: "partB",
      label: line.productsByRole.partB,
      cells: phases.map(phase => {
        const r = roleDose(settings, phase, "partB", phaseAdjustment(settings, phase).baseTargetEc);
        return { display: r.display, dosage: r.dosage, ec: r.ec };
      }),
    });
  }
  if (usePhz && settings.application === "direct") {
    rows.push({ key: "phoszyme", label: "PhosZyme", cells: phases.map(phase => directPhoszymeCell(settings, phase)) });
  }
  rows.push({
    key: "bloom",
    label: line.productsByRole.bloom,
    cells: phases.map(phase => {
      const r = roleDose(settings, phase, "bloom", phaseAdjustment(settings, phase).baseTargetEc);
      return { display: r.display, dosage: r.dosage, ec: r.ec };
    }),
  });
  return rows;
}

/**
 * @param {FeedSettings} settings
 * @param {Phase} phase
 */
function directPhoszymeCell(settings, phase) {
  return phoszymeDose({
    lineId: settings.line,
    recipeName: recipeForPhase(settings, phase),
    finalTargetEc: settings.targetEc[phase],
    application: settings.application,
    included: settings.usePhoszyme,
    carrierStockLbPerGal: stockConcentration(settings, "partB"),
    unit: settings.unit,
    extraDecimals: extraDecimals(settings),
  });
}

// ── Component Plus 2-doser ──────────────────────────────────────────────────

/**
 * Dose from one stock tank holding several products, sized to deliver `targetEc`.
 * @param {number} targetEc
 * @param {Array<{ lbPerGal: number, ecPerGram: number }>} components
 * @param {FeedUnit} unit
 * @param {number} [extra]  Extra display decimals.
 * @returns {DoseCell}
 */
export function mixedTankDose(targetEc, components, unit, extra = 0) {
  const normalizedEc = Math.max(0, Number(targetEc) || 0);
  const stockEcPerGallon = components.reduce((sum, component) =>
    sum + component.lbPerGal * DATA.units.gramsPerPound * component.ecPerGram, 0);
  const injectionPercent = stockEcPerGallon > 0 ? normalizedEc / stockEcPerGallon * 100 : 0;
  return { ...formatFeedDoseFromInjectionPercent(injectionPercent, unit, extra), ec: normalizedEc };
}

/**
 * C+ 2-doser Near Ripen final phase: CaNO3 holds 31.5% of the final EC; the fixed
 * C+ + MKP tank (with its PhosZyme, if used) supplies the rest.
 * @param {FeedSettings} settings
 * @param {number} targetEc  Final Ripen-phase EC.
 */
export function cplusNearRipenDoses(settings, targetEc) {
  const line = DATA.lines.cplus;
  const normalizedTarget = Math.max(0, Number(targetEc) || 0);
  const rates = stockRates(settings, "2-doser");
  const calciumEc = normalizedTarget * line.twoDoser.nearRipenCaEcShare;
  const comboEc = normalizedTarget - calciumEc;
  const tank2Components = [
    { lbPerGal: rates.partB, ecPerGram: line.ecPerGram.partB },
    { lbPerGal: rates.bloom, ecPerGram: line.ecPerGram.bloom },
  ];
  if (settings.usePhoszyme) {
    tank2Components.push({ lbPerGal: rates.partB * DATA.phoszyme.stockCarrierRatio, ecPerGram: DATA.phoszyme.ecPerGram });
  }
  return {
    partA: mixedTankDose(calciumEc, [{ lbPerGal: rates.partA, ecPerGram: line.ecPerGram.partA }], settings.unit, extraDecimals(settings)),
    combo: mixedTankDose(comboEc, tank2Components, settings.unit, extraDecimals(settings)),
  };
}

/**
 * @param {FeedSettings} settings
 * @returns {FeedRow[]}
 */
function cplusRows(settings) {
  const line = DATA.lines.cplus;
  const is2Doser = settings.doserCount === 2;
  const usePhz = settings.usePhoszyme;
  const phases = /** @type {Phase[]} */ ([...DATA.phases]);
  const nearRipen = is2Doser && settings.cplusFinalPhase === "near-ripen"
    ? cplusNearRipenDoses(settings, settings.targetEc.Ripen)
    : null;
  /** @type {FeedRow[]} */
  const rows = [];

  rows.push({
    key: "partA",
    label: line.productsByRole.partA,
    cells: phases.map(phase => {
      if (is2Doser && phase === "Veg") return null;
      if (phase === "Ripen" && nearRipen) return nearRipen.partA;
      return roleDose(settings, phase, "partA", phaseAdjustment(settings, phase).baseTargetEc);
    }),
  });

  if (is2Doser) {
    rows.push({
      key: "tank2",
      label: usePhz ? line.twoDoserComboPhzLabel : line.twoDoserComboLabel,
      cells: phases.map(phase => {
        if (phase === "Veg") return null;
        if (phase === "Ripen" && nearRipen) return nearRipen.combo;
        const adjustment = phaseAdjustment(settings, phase);
        const effectiveEC = adjustment.baseTargetEc;
        const carrier = roleDose(settings, phase, "partB", effectiveEC);
        const phzEC = usePhz ? adjustment.phoszymeEc : 0;
        return {
          display: carrier.display,
          dosage: carrier.dosage,
          ec: carrier.ec + ecContribution("cplus", recipeForPhase(settings, phase), "bloom", effectiveEC) + phzEC,
        };
      }),
    });
    return rows;
  }

  if (usePhz && settings.application === "stock") {
    rows.push({
      key: "partB+phoszyme",
      label: line.phzComboLabel,
      cells: phases.map(phase => {
        const adjustment = phaseAdjustment(settings, phase);
        const carrier = roleDose(settings, phase, "partB", adjustment.baseTargetEc);
        return { display: carrier.display, dosage: carrier.dosage, ec: carrier.ec + adjustment.phoszymeEc };
      }),
    });
  } else {
    rows.push({
      key: "partB",
      label: line.productsByRole.partB,
      cells: phases.map(phase => roleDose(settings, phase, "partB", phaseAdjustment(settings, phase).baseTargetEc)),
    });
  }
  if (usePhz && settings.application === "direct") {
    rows.push({ key: "phoszyme", label: "PhosZyme", cells: phases.map(phase => directPhoszymeCell(settings, phase)) });
  }
  rows.push({
    key: "bloom",
    label: line.productsByRole.bloom,
    cells: phases.map(phase => roleDose(settings, phase, "bloom", phaseAdjustment(settings, phase).baseTargetEc)),
  });
  return rows;
}

/**
 * Per-part rows for the chart, the same rows the screen, Copy Summary, and print use.
 * A cell prints as a dash only when the part is not in the recipe (display "–").
 * @param {FeedSettings} settings
 * @returns {FeedRow[]}
 */
export function feedRows(settings) {
  return settings.line === "cplus" ? cplusRows(settings) : threePartRows(settings);
}

// ── Stock tank table ───────────────────────────────────────────────────────

/**
 * Stock tank table: charge weights, concentrations, and validation EC per tank.
 * The 3-Part and C+ pages compute metric weights differently; see
 * cplusMetricWeightKg and threePartMetricWeightKg.
 * @param {FeedSettings} settings
 * @param {string} [method]
 * @returns {StockTable}
 */
export function stockTable(settings, method = effectiveMethod(settings)) {
  const met = isMetricUnit(settings.unit);
  const { gramsPerPound, litersPerGallon, millilitersPerGallon } = DATA.units;
  const line = getLine(settings.line);
  const ecPerGram = { ...line.ecPerGram, phoszyme: DATA.phoszyme.ecPerGram };
  const ratio = DATA.phoszyme.stockCarrierRatio;
  const rates = stockRates(settings, method);
  const vols = tankVolumes(settings, method);
  const names = line.stockNames;

  /** @param {Role} role */
  const concDisplay = role => (met ? Math.round(rates[role] * gramsPerPound / litersPerGallon) : rates[role]);

  const volA = met ? Math.round(vols.tankA * litersPerGallon) : vols.tankA;
  const volB = met ? Math.round(vols.tankB * litersPerGallon) : vols.tankB;

  /** @type {(role: Role) => number} */
  let weight;
  if (settings.line === "cplus") {
    const stockVolumeGal = normalizeStockTankVolume("cplus", settings.stockTankVolumeGal);
    weight = role => (met ? cplusMetricWeightKg(stockVolumeGal, rates[role]) : +(stockVolumeGal * rates[role]).toFixed(1));
  } else {
    weight = role => {
      const isTankA = role === "partA";
      if (met) return threePartMetricWeightKg(isTankA ? volA : volB, concDisplay(role));
      return +((isTankA ? vols.tankA : vols.tankB) * rates[role]).toFixed(1);
    };
  }
  const wtA = weight("partA");
  const wtB = weight("partB");
  const wtPhz = +(wtB * ratio).toFixed(1);
  const wtBloom = weight("bloom");

  const sampleVol = met ? DATA.validation.metric.sampleMl : DATA.validation.us.sampleMl;
  const sampleDilution = met ? DATA.validation.metric.waterL : DATA.validation.us.waterGal;
  /** @param {number} ecBase */
  const ecPerUnit = ecBase => (met ? ecBase * litersPerGallon : ecBase);
  /** @param {number} conc @param {number} ecBase */
  const valEcMetric = (conc, ecBase) => +(conc * ecPerUnit(ecBase) * (sampleVol / sampleDilution / 1000)).toFixed(2);
  /** @param {number} rateLbs @param {number} ecBase */
  const valEcUs = (rateLbs, ecBase) =>
    +(rateLbs * gramsPerPound * ecBase * (sampleVol / DATA.validation.us.waterGal / millilitersPerGallon)).toFixed(2);

  const concA = concDisplay("partA");
  const concB = concDisplay("partB");
  const concPhz = met ? Math.round(concB * ratio) : +(concB * ratio).toFixed(2);
  const concBloom = concDisplay("bloom");

  const valA = met ? valEcMetric(concA, ecPerGram.partA) : valEcUs(rates.partA, ecPerGram.partA);
  const valB = met ? valEcMetric(concB, ecPerGram.partB) : valEcUs(rates.partB, ecPerGram.partB);
  const valPhz = met ? valEcMetric(concPhz, ecPerGram.phoszyme) : valEcUs(rates.partB * ratio, ecPerGram.phoszyme);
  const valBlm = met ? valEcMetric(concBloom, ecPerGram.bloom) : valEcUs(rates.bloom, ecPerGram.bloom);
  /** @param {number} ec */
  const ecG = ec => (met ? ecPerUnit(ec).toFixed(3) : ec);

  /** @type {StockRow[]} */
  const rows = [
    { key: "partA", tank: 1, part: names.partA, vol: volA, wt: wtA, conc: concA, sample: sampleVol, ecG: ecG(ecPerGram.partA), valEC: valA },
    { key: "partB", tank: 2, part: names.partB, vol: volB, wt: wtB, conc: concB, sample: sampleVol, ecG: ecG(ecPerGram.partB), valEC: valB },
    { key: "phz", tank: "–", part: "PhosZyme*", vol: volB, wt: wtPhz, conc: concPhz, sample: sampleVol, ecG: ecG(ecPerGram.phoszyme), valEC: valPhz },
    { key: "bloom", tank: 3, part: names.bloom, vol: volB, wt: wtBloom, conc: concBloom, sample: sampleVol, ecG: ecG(ecPerGram.bloom), valEC: valBlm },
  ];

  let tank2Total = null;
  if (settings.doserCount === 2) {
    const tank2Keys = settings.usePhoszyme ? ["partB", "phz", "bloom"] : ["partB", "bloom"];
    tank2Total = rows.filter(row => tank2Keys.includes(row.key)).reduce((sum, row) => sum + row.valEC, 0).toFixed(2);
  }

  return {
    volUnit: met ? "L" : "gal",
    wtUnit: met ? "kg" : "lbs",
    concUnit: met ? "g / L" : "lbs / gal",
    sampleUnit: met ? "mL / 20L" : "mL / 5gal",
    ecUnit: met ? "EC / g / L" : "EC / g / gal",
    rows,
    tank2Total,
  };
}

/**
 * feed-calc.html metric charge: rounded litres × rounded g/L.
 * @param {number} volumeL
 * @param {number} gramsPerLiter
 */
export function threePartMetricWeightKg(volumeL, gramsPerLiter) {
  return +(volumeL * gramsPerLiter / 1000).toFixed(1);
}

/**
 * cplus-calc.html metric charge: gallons × lb/gal × 454 g/lb, unrounded until the end.
 * Differs from the 3-Part rounding by up to a few tenths of a kg.
 * @param {number} volumeGal
 * @param {number} lbPerGal
 */
export function cplusMetricWeightKg(volumeGal, lbPerGal) {
  return +(volumeGal * lbPerGal * DATA.units.gramsPerPound / 1000).toFixed(1);
}

// ── Whole chart ────────────────────────────────────────────────────────────

/**
 * Everything a Feed Chart renders, from one settings object.
 * @param {Partial<FeedSettings>} input  Passed through resolveFeedSettings.
 */
export function computeFeedChart(input) {
  const settings = resolveFeedSettings(input);
  const phases = /** @type {Phase[]} */ ([...DATA.phases]);
  const unreachable = phases.filter(phase =>
    settings.application === "direct" && settings.usePhoszyme && !phaseAdjustment(settings, phase).achievable);
  return {
    settings,
    phases: phases.map((phase, index) => ({
      phase,
      targetEc: settings.targetEc[phase],
      recipe: recipeForPhase(settings, phase),
      recipeLabel: recipeLabel(settings, phase),
      label: { print: DATA.phaseLabels.print[index], summary: DATA.phaseLabels.summary[index] },
    })),
    rows: feedRows(settings),
    stock: settings.application === "stock" ? stockTable(settings) : null,
    tankVolumes: settings.application === "stock" ? tankVolumes(settings) : null,
    stockConfigLabel: stockConfigLabel(settings),
    recipeScheduleLabel: recipeScheduleLabel(settings),
    ph: phRanges(settings),
    phoszymeWarning: { phases: unreachable, text: formatDirectPhoszymeWarning(unreachable) },
  };
}

export { EMPTY_CELL };
