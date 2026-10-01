import { describe, expect, test } from "bun:test";
import * as E from "../src/engine/index.js";

describe("pH Down (70% phosphoric acid)", () => {
  test("the rate constant follows from the acid's composition", () => {
    // (1 ppm / 50 mg per meq) × 98 mg H3PO4 per mmol / 1068.2 mg per mL × 3.785 L/gal
    expect(E.DATA.phDown.mlPerGalPerPpm).toBeCloseTo(1 / 50 * 98 / 1068.2 * 3.785, 5);
    expect(E.DATA.phDown.mlPerGalPerPpm).toBe(0.006946);
  });

  test("defaults: 20 ppm target, 15 for Veg", () => {
    expect(E.DATA.phDown.defaultTargetPpm).toBe(20);
    expect(E.DATA.phDown.vegTargetPpm).toBe(15);
  });

  test("neutralizes start minus target", () => {
    const d = E.phDownDose({ startPpm: 140, targetPpm: 20, volumeGal: 100 });
    expect(d.neutralizePpm).toBe(120);
    expect(d.mlPerGal).toBeCloseTo(120 * 0.006946, 12);
    expect(d.mlPerL).toBeCloseTo(120 * 0.006946 / 3.785, 12);
    expect(d.totalMl).toBeCloseTo(100 * 120 * 0.006946, 9);
  });

  test("nothing to neutralize at or below the target, and bad input reads as zero", () => {
    expect(E.phDownDose({ startPpm: 15, targetPpm: 20 }).mlPerGal).toBe(0);
    expect(E.phDownDose({ startPpm: Number.NaN, targetPpm: 20, volumeGal: -5 })).toMatchObject({ neutralizePpm: 0, totalMl: 0 });
  });

  test("quick reference rows", () => {
    const rows = E.phDownReference();
    expect(rows.map(r => r.ppm)).toEqual([20, 40, 60, 80, 100, 120, 150, 200, 250, 300]);
    expect(rows[0].mlPerGal).toBeCloseTo(0.13892, 9);
  });
});
