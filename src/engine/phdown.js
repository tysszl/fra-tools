// @ts-check
// pH Down (70% phosphoric acid): acid to neutralize source alkalinity down to a target.
import { DATA } from "./data.js";

/**
 * @param {object} args
 * @param {number} args.startPpm   Source alkalinity, ppm as CaCO3.
 * @param {number} args.targetPpm  Alkalinity to leave, ppm as CaCO3.
 * @param {number} [args.volumeGal]
 */
export function phDownDose({ startPpm, targetPpm, volumeGal = 0 }) {
  const start = Math.max(0, Number(startPpm) || 0);
  const target = Math.max(0, Number(targetPpm) || 0);
  const neutralizePpm = Math.max(0, start - target);
  const mlPerGal = neutralizePpm * DATA.phDown.mlPerGalPerPpm;
  const mlPerL = mlPerGal / DATA.units.litersPerGallon;
  const volume = Math.max(0, Number(volumeGal) || 0);
  return { startPpm: start, targetPpm: target, neutralizePpm, mlPerGal, mlPerL, totalMl: mlPerGal * volume };
}

/** Quick-reference rows: ppm neutralized → mL/gal and mL/L. */
export function phDownReference() {
  return DATA.phDown.referencePpm.map(ppm => ({
    ppm,
    mlPerGal: ppm * DATA.phDown.mlPerGalPerPpm,
    mlPerL: ppm * DATA.phDown.mlPerGalPerPpm / DATA.units.litersPerGallon,
  }));
}
