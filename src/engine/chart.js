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

// ── 2-doser Tank 2 (both lines) ─────────────────────────────────────────────

/**
 * Bloom-role : Part B-role by weight as Tank 2 is charged (3-Part 50 lb : 28 lb;
 * C+ MKP 0.84 : C+ 1.00 lb/gal).
 * @param {FeedSettings} settings
 */
export function tank2BloomToPartBRatio(settings) {
  const rates = stockRates(settings);
  return rates.bloom / rates.partB;
}

/**
 * The EC to hand the Part B-role dose math so it, plus the Bloom-role product riding
 * with it, delivers Tank 2's combined recipe share of the target (the whole-tank solve;
 * both lines since Tyler's 2026-09-29 ruling N19).
 * @param {FeedSettings} settings
 * @param {Phase} phase
 * @param {number} targetEc
 */
export function twoDoserTank2TargetEc(settings, phase, targetEc) {
  const recipe = getRecipe(settings.line, recipeForPhase(settings, phase));
  const ecPerGram = getLine(settings.line).ecPerGram;
  const share = recipe.partB + recipe.bloom;
  if (!(share > 0) || !(recipe.partB > 0)) return targetEc;
  const ecPerGramB = ecPerGram.partB + ecPerGram.bloom * tank2BloomToPartBRatio(settings);
  return targetEc * share * ecPerGram.partB / (recipe.partB * ecPerGramB);
}

/**
 * One 2-doser Tank 2 cell: the dose of the combined stock and the EC it delivers.
 * @param {FeedSettings} settings
 * @param {Phase} phase
 * @returns {DoseCell}
 */
function twoDoserTank2Cell(settings, phase) {
  const line = getLine(settings.line);
  const adjustment = phaseAdjustment(settings, phase);
  const t2EC = twoDoserTank2TargetEc(settings, phase, adjustment.baseTargetEc);
  const resultB = roleDose(settings, phase, "partB", t2EC);
  const gramsB = (t2EC * getRecipe(settings.line, recipeForPhase(settings, phase)).partB) / line.ecPerGram.partB;
  const partBEc = gramsB * line.ecPerGram.partB;
  const bloomEc = gramsB * tank2BloomToPartBRatio(settings) * line.ecPerGram.bloom;
  const phzEc = settings.usePhoszyme ? adjustment.phoszymeEc : 0;
  return { display: resultB.display, dosage: resultB.dosage, ec: partBEc + bloomEc + phzEc };
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
      cells: phases.map(phase => (phase === "Veg" ? null : twoDoserTank2Cell(settings, phase))),
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
        return twoDoserTank2Cell(settings, phase);
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
  const phzRate = rates.partB * ratio;

  /** @param {number} lbPerGal */
  const gramsPerLiter = lbPerGal => lbPerGal * gramsPerPound / litersPerGallon;
  /** @param {number} lbPerGal */
  const concDisplay = lbPerGal => (met ? Math.round(gramsPerLiter(lbPerGal)) : lbPerGal);
  /** @param {number} gal @param {number} lbPerGal */
  const weight = (gal, lbPerGal) => (met ? metricWeightKg(gal, lbPerGal) : +(gal * lbPerGal).toFixed(1));

  const volA = met ? Math.round(vols.tankA * litersPerGallon) : vols.tankA;
  const volB = met ? Math.round(vols.tankB * litersPerGallon) : vols.tankB;
  const wtA = weight(vols.tankA, rates.partA);
  const wtB = weight(vols.tankB, rates.partB);
  const wtPhz = met ? metricWeightKg(vols.tankB, phzRate) : +(wtB * ratio).toFixed(1);
  const wtBloom = weight(vols.tankB, rates.bloom);

  const sampleVol = met ? DATA.validation.metric.sampleMl : DATA.validation.us.sampleMl;
  /** @param {number} lbPerGal @param {number} ecBase */
  const valEc = (lbPerGal, ecBase) => (met
    ? +(gramsPerLiter(lbPerGal) * ecBase * litersPerGallon * (sampleVol / 1000 / DATA.validation.metric.waterL)).toFixed(2)
    : +(lbPerGal * gramsPerPound * ecBase * (sampleVol / DATA.validation.us.waterGal / millilitersPerGallon)).toFixed(2));
  /** @param {number} ec */
  const ecG = ec => (met ? (ec * litersPerGallon).toFixed(3) : ec);

  const concPhz = met ? Math.round(gramsPerLiter(phzRate)) : +phzRate.toFixed(2);

  /** @type {StockRow[]} */
  const rows = [
    { key: "partA", tank: 1, part: names.partA, vol: volA, wt: wtA, conc: concDisplay(rates.partA), sample: sampleVol, ecG: ecG(ecPerGram.partA), valEC: valEc(rates.partA, ecPerGram.partA) },
    { key: "partB", tank: 2, part: names.partB, vol: volB, wt: wtB, conc: concDisplay(rates.partB), sample: sampleVol, ecG: ecG(ecPerGram.partB), valEC: valEc(rates.partB, ecPerGram.partB) },
    { key: "phz", tank: "–", part: "PhosZyme*", vol: volB, wt: wtPhz, conc: concPhz, sample: sampleVol, ecG: ecG(ecPerGram.phoszyme), valEC: valEc(phzRate, ecPerGram.phoszyme) },
    { key: "bloom", tank: 3, part: names.bloom, vol: volB, wt: wtBloom, conc: concDisplay(rates.bloom), sample: sampleVol, ecG: ecG(ecPerGram.bloom), valEC: valEc(rates.bloom, ecPerGram.bloom) },
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
    sampleUnit: met ? `mL / ${DATA.validation.metric.waterL}L` : `mL / ${DATA.validation.us.waterGal}gal`,
    ecUnit: met ? "EC / g / L" : "EC / g / gal",
    rows,
    tank2Total,
  };
}

/**
 * Metric charge (kg) from the exact tank volume and concentration, rounded once for
 * display (Tyler 2026-09-29, N17). Equal to gal × lb/gal × 454 g/lb.
 * @param {number} volumeGal
 * @param {number} lbPerGal
 */
export function metricWeightKg(volumeGal, lbPerGal) {
  const { gramsPerPound, litersPerGallon } = DATA.units;
  const liters = volumeGal * litersPerGallon;
  const gramsPerLiter = lbPerGal * gramsPerPound / litersPerGallon;
  return +(liters * gramsPerLiter / 1000).toFixed(1);
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
