// @ts-check
// Supplement rates as display strings, for the screen/summary (unit-aware) and the
// 3-Part printed additive table (US units only, with its own ranges; audit N3-N5).
import { DATA } from "./data.js";

/** @param {readonly number[]} range */
export function formatRange(range) {
  return `${range[0]}–${range[1]}`;
}

/**
 * Screen and Copy Summary rates. Metric values are the pages' hand-rounded literals,
 * except pH Up, which is converted and shown to 2 decimals.
 * @param {boolean} metric
 */
export function supplementRates(metric) {
  const s = DATA.supplements;
  const L = DATA.units.litersPerGallon;
  const d = s.phUp.metricDecimals;
  /** @param {readonly number[]} range */
  const perLiter = range => `${(range[0] / L).toFixed(d)}–${(range[1] / L).toFixed(d)}`;
  return {
    siFoliar: metric ? `${formatRange(s.si.foliarMlPerL)} mL/L` : `${formatRange(s.si.foliarMlPerGal)} mL/gal`,
    phUpUnit: metric ? "g/L" : "g/gal",
    phUpMax: metric ? perLiter(s.phUp.maxGPerGal) : formatRange(s.phUp.maxGPerGal),
    // 3-Part only; the C+ page has no high-strength stop (audit N5).
    phUpHighStrengthFlowerStop: metric
      ? perLiter(s.phUp.highStrengthFlowerStopGPerGal)
      : formatRange(s.phUp.highStrengthFlowerStopGPerGal),
    phUpWaitMinutes: formatRange(s.phUp.waitMinutes),
    biofloHeavy: metric ? `${s.bioflo.heavyMlPerL} mL/L` : `${s.bioflo.heavyMlPerGal} mL/gal`,
    biofloMaintenance: metric ? `${s.bioflo.maintenanceMlPerL} mL/L` : `${s.bioflo.maintenanceMlPerGal} mL/gal`,
    biofloSoakHours: formatRange(s.bioflo.soakHours),
    biofloMaintenanceEveryWeeks: formatRange(s.bioflo.maintenanceEveryWeeks),
    triologicWeekly: metric ? `${s.triologic.weeklyMlPerL} mL/L` : `${s.triologic.weeklyMlPerGal} mL/gal`,
    triologicTransplant: metric ? `${s.triologic.transplantMlPerL} mL/L` : `${s.triologic.transplantMlPerGal} mL/gal`,
  };
}

/**
 * The 3-Part printed additive table's Rate column. US units regardless of the chart
 * unit, and ranges that differ from the screen and from docs (audit N3, N4, N5).
 */
export function threePartPrintAdditiveRates() {
  const s = DATA.supplements;
  return {
    si: `${formatRange(s.si.foliarMlPerGal)} mL/gal`,
    triologic: `${formatRange(s.triologic.printRangeMlPerGal)} mL/gal`,
    bioflo: `${s.bioflo.printMlPerGal} mL/gal`,
    phUp: `${formatRange(s.phUp.printRangeGPerGal)} g/gal`,
  };
}
