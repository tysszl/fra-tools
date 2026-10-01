import { describe, expect, test } from "bun:test";
import * as E from "../src/engine/index.js";

// pH Up: the 2026-09-29 PHREEQC refit (dose to 5.9 = k·EC^n), one multiplier per
// target, the per-column dripper ceiling (N12), and the source-alkalinity credit.

describe("dose to pH 5.9 on RO water", () => {
  test("reproduces the trial anchors", () => {
    // Trials: Stack 3.0 EC ~0.20 g/gal and Swell 3.0 ~0.25 to ~5.9 (ALK § Level 3).
    expect(E.phUpDoseTo59("3part", "Stack", 3.0)).toBeCloseTo(0.200, 3);
    expect(E.phUpDoseTo59("3part", "Swell", 3.0)).toBeCloseTo(0.250, 3);
  });

  test("matches the refit table at preset ECs", () => {
    const table: Array<[string, string, number, number]> = [
      ["3part", "Veg", 2.6, 0.063], ["3part", "Veg", 3.0, 0.076],
      ["3part", "Stretch", 2.4, 0.124], ["3part", "Stretch", 3.0, 0.166],
      ["3part", "Stack", 2.2, 0.134], ["3part", "Stack", 2.7, 0.175],
      ["3part", "Swell", 2.0, 0.149], ["3part", "Swell", 2.4, 0.188], ["3part", "Swell", 2.7, 0.218],
      ["3part", "Ripen", 1.4, 0.104], ["3part", "Ripen", 1.8, 0.143],
      ["cplus", "Veg", 3.0, 0.101], ["cplus", "Stack", 2.7, 0.235], ["cplus", "Swell", 2.4, 0.276], ["cplus", "Ripen", 1.8, 0.220],
    ];
    for (const [line, recipe, ec, dose] of table) {
      expect(Math.abs(E.phUpDoseTo59(line as any, recipe, ec) - dose)).toBeLessThanOrEqual(0.0006);
    }
  });

  test("C+ needs more pH Up than 3-Part at the same recipe and EC", () => {
    expect(E.phUpDoseTo59("cplus", "Swell", 2.4)).toBeGreaterThan(E.phUpDoseTo59("3part", "Swell", 2.4) * 1.3);
  });
});

describe("target multiplier", () => {
  test("uses the refit medians", () => {
    expect([5.5, 5.6, 5.7, 5.8, 5.9, 6.0].map(E.phUpTargetMultiplier)).toEqual([0.42, 0.53, 0.66, 0.81, 1.0, 1.22]);
  });

  test("interpolates between points and clamps outside 5.5–6.0", () => {
    expect(E.phUpTargetMultiplier(5.85)).toBeCloseTo((0.81 + 1.0) / 2, 9);
    expect(E.phUpTargetMultiplier(5.0)).toBe(0.42);
    expect(E.phUpTargetMultiplier(6.4)).toBe(1.22);
  });
});

describe("default target per column", () => {
  test("is the printed ceiling minus 0.1, within 5.5–5.9", () => {
    const at = (line: string, recipe: string, ec: number) => E.phUpTarget(line as any, recipe, ec).target;
    expect(at("3part", "Veg", 3.0)).toBe(5.9);
    expect(at("3part", "Stack", 3.0)).toBe(5.6); // ceiling 5.7
    expect(at("3part", "Swell", 2.7)).toBe(5.7); // ceiling 5.8
    expect(at("3part", "Swell", 2.0)).toBe(5.9); // ceiling 6.0
    expect(at("3part", "Ripen", 1.4)).toBe(5.9);
    expect(at("cplus", "Stack", 3.0)).toBe(5.5); // ceiling 5.5, floor holds
  });

  test("never exceeds 5.9 or the ceiling", () => {
    for (const line of ["3part", "cplus"] as const) for (const recipe of E.DATA.lines[line].recipeNames) {
      for (const ec of [1.0, 1.4, 1.8, 2.2, 2.6, 3.0, 3.4]) {
        const r = E.phUpTarget(line, recipe, ec);
        expect(r.target).toBeLessThanOrEqual(5.9);
        expect(r.target).toBeGreaterThanOrEqual(5.5);
        expect(r.target).toBeLessThanOrEqual(r.ceiling);
      }
    }
  });

  test("uses the engine's dripper ceiling, and warm lines take 0.08 off the limit", () => {
    const cool = E.phUpTarget("3part", "Swell", 2.4);
    expect(cool.ceiling).toBe(E.dripperPhRange("3part", "Swell", 2.4).ceiling);
    const warm = E.phUpTarget("3part", "Swell", 2.4, { warm: true });
    expect(warm.limit).toBeCloseTo(cool.limit - 0.08, 9);
    expect(warm.target).toBeLessThanOrEqual(cool.target);
  });
});

describe("dose", () => {
  test("scales by target and flags targets over the ceiling", () => {
    const d = E.phUpDose({ line: "3part", recipe: "Stack", ec: 3.0 });
    expect(d.target).toBe(5.6);
    expect(d.gPerGal).toBeCloseTo(E.phUpDoseTo59("3part", "Stack", 3.0) * 0.53, 12);
    expect(d.overCeiling).toBe(false);
    expect(E.phUpDose({ line: "3part", recipe: "Stack", ec: 3.0, target: 5.9 }).overCeiling).toBe(true);
  });

  test("flags doses over 0.25 g/gal and ECs outside the fit", () => {
    expect(E.phUpDose({ line: "cplus", recipe: "Swell", ec: 3.0, target: 5.9 }).overMax).toBe(true);
    expect(E.phUpDose({ line: "3part", recipe: "Ripen", ec: 0.8 }).outsideFit).toBe(true);
    expect(E.phUpDose({ line: "3part", recipe: "Ripen", ec: 1.8 }).outsideFit).toBe(false);
  });

  test("19 ppm alkalinity is worth 0.1 g/gal, floored at zero", () => {
    expect(E.phUpAlkalinityCredit(19)).toBeCloseTo(0.1, 9);
    const d = E.phUpDose({ line: "3part", recipe: "Stack", ec: 2.7, alkPpm: 60 });
    expect(d.gPerGal).toBe(0);
  });

  test("stock conversions", () => {
    expect(E.phUpStockMlPerGal(0.2, 20)).toBeCloseTo(0.2 / 20 * 3785, 9);
    expect(E.phUpStockPercent(0.2, 20)).toBeCloseTo(1.0, 9);
  });
});
