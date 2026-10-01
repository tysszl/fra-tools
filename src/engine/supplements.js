// @ts-check
// Supplement rates as display strings. One set for every surface (screen, Copy Summary,
// print), in the chart's units.
import { DATA } from "./data.js";

/** @param {readonly number[]} range */
export function formatRange(range) {
  return `${range[0]}–${range[1]}`;
}

/**
 * Metric values are hand-rounded literals, except pH Up, which is converted and shown
 * to 2 decimals.
 * @param {boolean} metric
 */
export function supplementRates(metric) {
  const s = DATA.supplements;
  const L = DATA.units.litersPerGallon;
  const d = s.phUp.metricDecimals;
  /** @param {readonly number[]} range */
  const perLiter = range => `${(range[0] / L).toFixed(d)}–${(range[1] / L).toFixed(d)}`;
  const vol = metric ? "mL/L" : "mL/gal";
  return {
    siFoliar: metric ? `${formatRange(s.si.foliarMlPerL)} ${vol}` : `${formatRange(s.si.foliarMlPerGal)} ${vol}`,
    phUpUnit: metric ? "g/L" : "g/gal",
    phUpMax: metric ? perLiter(s.phUp.maxGPerGal) : formatRange(s.phUp.maxGPerGal),
    phUpHighStrengthFlowerStop: metric
      ? perLiter(s.phUp.highStrengthFlowerStopGPerGal)
      : formatRange(s.phUp.highStrengthFlowerStopGPerGal),
    phUpIncrement: metric ? (s.phUp.incrementGPerGal / L).toFixed(d) : String(s.phUp.incrementGPerGal),
    phUpWaitMinutes: formatRange(s.phUp.waitMinutes),
    biofloHeavy: `${metric ? s.bioflo.heavyMlPerL : s.bioflo.heavyMlPerGal} ${vol}`,
    biofloMaintenance: `${metric ? s.bioflo.maintenanceMlPerL : s.bioflo.maintenanceMlPerGal} ${vol}`,
    biofloSoakHours: formatRange(s.bioflo.soakHours),
    biofloMaintenanceEveryWeeks: formatRange(s.bioflo.maintenanceEveryWeeks),
    triologicWeekly: `${metric ? s.triologic.weeklyMlPerL : s.triologic.weeklyMlPerGal} ${vol}`,
    triologicMax: `${metric ? s.triologic.maxMlPerL : s.triologic.maxMlPerGal} ${vol}`,
  };
}
