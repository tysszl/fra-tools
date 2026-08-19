import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Extract the target-engine constants and helpers from ph-up-calc.html and run them
// outside the DOM. The engine's provenance: PHREEQC speciation of the FRA recipes,
// validated against the 131-point pH Up trials (FRA repo,
// docs/alkalinity-ph-and-calcium-phosphate.md, 2026-08-19).
const html = readFileSync(new URL("../ph-up-calc.html", import.meta.url), "utf8");

function extractEngine(warm: boolean, alkPpm: number) {
  const start = html.indexOf("const CEILINGS =");
  const end = html.indexOf("const targetManual");
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const src = html
    .slice(start, end)
    .replace(/document\.getElementById\('warm-lines'\)\.checked/g, JSON.stringify(warm))
    .replace(
      /parseFloat\(document\.getElementById\('source-alk'\)\.value\)/g,
      String(alkPpm),
    );
  return new Function(
    `${src}\nreturn { ceilingFor, defaultTarget, doseMultiplier, getAlkCredit, CEILINGS, TARGET_MULT, DOSE_CEILING_GPG };`,
  )() as any;
}

const phasesMatch = html.match(/const phases = \[[\s\S]*?\];/);
const phases = new Function(`${phasesMatch![0]}\nreturn phases;`)() as Array<{
  id: string;
  calc: (ec: number) => number;
}>;
const phase = (id: string) => phases.find((p) => p.id === id)!;

describe("pH ceiling model", () => {
  const e = extractEngine(false, 0);

  test("matches the speciation model's brushite ceilings within 0.05 pH", () => {
    // Reference points from chemistry-model/feed_speciation.py (RO, 22C)
    const ref: Array<[string, number, number]> = [
      ["veg", 3.0, 6.14],
      ["veg", 2.6, 6.26],
      ["stretch", 3.0, 5.78],
      ["stack", 2.7, 5.81],
      ["stack", 2.2, 5.97],
      ["swell", 2.4, 5.84],
      ["swell", 2.0, 5.99],
      ["ripen", 1.8, 6.16],
    ];
    for (const [id, ec, ceiling] of ref) {
      expect(Math.abs(e.ceilingFor(id, ec) - ceiling)).toBeLessThan(0.05);
    }
  });

  test("default targets reproduce the published standards", () => {
    // Veg & Ripen: 5.9. Standard-strength flower: 5.8. High-strength flower: 5.6-5.7.
    expect(e.defaultTarget("veg", 3.0)).toBe(5.9);
    expect(e.defaultTarget("veg", 2.6)).toBe(5.9);
    expect(e.defaultTarget("ripen", 1.8)).toBe(5.9);
    expect(e.defaultTarget("ripen", 1.4)).toBe(5.9);
    expect(e.defaultTarget("stack", 2.2)).toBe(5.8);
    expect(e.defaultTarget("swell", 2.0)).toBe(5.8);
    expect(e.defaultTarget("stack", 2.7)).toBe(5.7);
    expect(e.defaultTarget("swell", 2.4)).toBe(5.7);
    expect(e.defaultTarget("stretch", 3.0)).toBe(5.6);
    expect(e.defaultTarget("stretch", 2.4)).toBe(5.8);
  });

  test("default target never exceeds 5.9 or the ceiling minus 0.1", () => {
    for (const p of phases) {
      for (const ec of [1.4, 1.8, 2.2, 2.6, 3.0, 3.4]) {
        const t = e.defaultTarget(p.id, ec);
        expect(t).toBeLessThanOrEqual(5.9);
        expect(t).toBeLessThan(e.ceilingFor(p.id, ec));
      }
    }
  });

  test("warm lines lower the ceiling by 0.08 and can lower the default target", () => {
    const w = extractEngine(true, 0);
    expect(e.ceilingFor("stack", 2.7) - w.ceilingFor("stack", 2.7)).toBeCloseTo(0.08, 6);
    expect(w.defaultTarget("stack", 2.7)).toBeLessThanOrEqual(e.defaultTarget("stack", 2.7));
  });
});

describe("dose scaling by target pH", () => {
  const e = extractEngine(false, 0);

  test("anchor points match the speciation-model multipliers", () => {
    expect(e.doseMultiplier(5.9)).toBe(1.0);
    expect(e.doseMultiplier(5.5)).toBeCloseTo(0.43, 6);
    expect(e.doseMultiplier(5.7)).toBeCloseTo(0.67, 6);
    expect(e.doseMultiplier(5.8)).toBeCloseTo(0.82, 6);
    expect(e.doseMultiplier(6.0)).toBeCloseTo(1.21, 6);
  });

  test("interpolates between anchors and clamps outside 5.5-6.0", () => {
    expect(e.doseMultiplier(5.85)).toBeCloseTo((0.82 + 1.0) / 2, 6);
    expect(e.doseMultiplier(5.0)).toBeCloseTo(0.43, 6);
    expect(e.doseMultiplier(6.4)).toBeCloseTo(1.21, 6);
  });

  test("scaled doses stay near the FRA trial values at 5.9 and drop at recipe defaults", () => {
    // Trial anchors: Stack 3.0 EC ~0.20 g/gal to ~5.9; Swell 3.0 ~0.25.
    const stack59 = phase("stack").calc(3.0) * e.doseMultiplier(5.9);
    const swell59 = phase("swell").calc(3.0) * e.doseMultiplier(5.9);
    expect(stack59).toBeGreaterThan(0.17);
    expect(stack59).toBeLessThan(0.22);
    expect(swell59).toBeGreaterThan(0.2);
    expect(swell59).toBeLessThan(0.27);
    // At the high-strength default (5.7) the dose is ~0.67x.
    const stackDefault = phase("stack").calc(2.7) * e.doseMultiplier(e.defaultTarget("stack", 2.7));
    expect(stackDefault).toBeLessThan(phase("stack").calc(2.7) * 0.7);
  });
});

describe("source-water alkalinity credit", () => {
  test("19 ppm is worth 0.1 g/gal, floored at zero after subtraction", () => {
    const e = extractEngine(false, 19);
    expect(e.getAlkCredit()).toBeCloseTo(0.1, 6);
    const e60 = extractEngine(false, 60);
    const dose = Math.max(
      0,
      phase("stack").calc(2.7) * e60.doseMultiplier(5.7) - e60.getAlkCredit(),
    );
    expect(dose).toBe(0);
  });
});

describe("page copy no longer hardcodes the 5.9 destination", () => {
  test("the universal 5.9 sentence is gone and the ceiling framing is present", () => {
    expect(html).not.toContain("All recommendations target a final pH of");
    expect(html).toContain("Why Each Recipe Has a pH Ceiling");
    expect(html).toContain('id="col-target"');
    expect(html).toContain('id="warm-lines"');
  });
});
