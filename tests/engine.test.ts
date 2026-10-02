// Engine unit tests. Read src/engine directly; the approval snapshot below is the
// reviewed set of numbers, each tied to its source in src/engine/sources.js.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as E from "../src/engine/index.js";

const { DATA } = E;

function numericLeaves(value: unknown, path = ""): Array<[string, number]> {
  if (typeof value === "number") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => numericLeaves(child, path ? `${path}.${key}` : key));
}

function resolvePath(path: string) {
  return path.split(".").reduce<any>((node, key) => (node == null ? undefined : node[key]), DATA);
}

describe("approval snapshot", () => {
  test("units and PhosZyme", () => {
    expect(DATA.units).toEqual({ gramsPerPound: 454, millilitersPerGallon: 3785, litersPerGallon: 3.785 });
    expect(DATA.phoszyme).toEqual({
      ecPerGram: 0.22, directGramsPerGallon: 0.4, stockCarrierRatio: 0.1, directEc: 0.088,
      directDecimals: { "g/gal": 1, "g/L": 3 },
    });
  });

  test("EC per gram and recipes, both lines", () => {
    expect(DATA.lines["3part"].ecPerGram).toEqual({ partA: 0.306, partB: 0.255, bloom: 0.204 });
    expect(DATA.lines["3part"].recipes).toEqual({
      Veg: { partA: 0.6428571428571, partB: 0.3571428571429, bloom: 0 },
      Stretch: { partA: 0.55, partB: 0.29, bloom: 0.16 },
      Stack: { partA: 0.5, partB: 0.2777778, bloom: 0.2222222 },
      Swell: { partA: 0.441, partB: 0.234, bloom: 0.325 },
      Ripen: { partA: 0.35, partB: 0.3, bloom: 0.35 },
    });
    expect(DATA.lines.cplus.ecPerGram).toEqual({ partA: 0.317, partB: 0.283, bloom: 0.195 });
    expect(DATA.lines.cplus.recipes).toEqual({
      Veg: { partA: 0.6, partB: 0.4, bloom: 0 },
      Stack: { partA: 0.496, partB: 0.32, bloom: 0.184 },
      Swell: { partA: 0.3684, partB: 0.3294, bloom: 0.3022 },
      Ripen: { partA: 0.315, partB: 0.3, bloom: 0.385 },
    });
    for (const line of Object.values(DATA.lines)) {
      for (const recipe of Object.values(line.recipes)) {
        expect(recipe.partA + recipe.partB + recipe.bloom).toBeCloseTo(1, 6);
      }
    }
  });

  test("EC presets and schedules", () => {
    expect(DATA.ecPresets).toEqual({
      high: { Veg: 3.0, Stretch: 3.0, Stack: 2.7, Swell: 2.4, Ripen: 1.8 },
      standard: { Veg: 2.6, Stretch: 2.4, Stack: 2.2, Swell: 2.0, Ripen: 1.4 },
    });
    const commercial = { Veg: "Veg", Stretch: "Stack", Stack: "Swell", Swell: "Swell", Ripen: "Ripen" };
    const swellFlower = { Veg: "Veg", Stretch: "Swell", Stack: "Swell", Swell: "Swell", Ripen: "Swell" };
    expect(DATA.lines["3part"].schedules).toEqual({ commercial, "swell-flower": swellFlower });
    expect(DATA.lines.cplus.schedules).toEqual({ commercial, "swell-flower": swellFlower });
    expect(DATA.phaseLabels.print).toEqual(["Veg / Moms", "Week 1–2", "Week 3–5", "Week 6–8/9", "Final 1–2 Wks"]);
  });

  test("stock methods, tank sizes, and 2-doser builds", () => {
    const tp = DATA.lines["3part"];
    expect(tp.stockMethods).toEqual({
      "4-3-3": { rates: { partA: 1.87, partB: 1.25, bloom: 1.25 }, tankVolumes: { tankA: 53.5, tankB: 60 } },
      "3-2-2": { rates: { partA: 1.5, partB: 1, bloom: 1 }, tankVolumes: { tankA: 50, tankB: 50 } },
      "1-1-1": { rates: { partA: 1, partB: 1, bloom: 1 }, tankVolumes: { tankA: 50, tankB: 50 } },
      "2-doser": { rates: { partA: 1.5, partB: 0.56, bloom: 1 }, tankVolumes: { tankA: 50, tankB: 50 } },
    });
    expect(tp.twoDoser).toMatchObject({ tankGal: 50, bloomLb: 50, partBLb: 28, tank2VolumeFactor: 1 });
    expect(tp.stockTankVolume).toEqual({ defaultGal: 50, minGal: 10, maxGal: 100000, decimals: 1 });
    expect(tp.customStock).toEqual({
      maxLbPerGal: { partA: 3, partB: 2, bloom: 2 }, minLbPerGal: 0.1, defaultLbs: { partA: 75, partB: 50, bloom: 50 },
      lbDecimals: 1, rateDecimals: 3, labelDecimals: 2,
    });
    expect(DATA.lines.cplus.customStock).toEqual({
      maxLbPerGal: { partA: 2, partB: 2, bloom: 1.333 }, minLbPerGal: 0.1, defaultLbs: { partA: 50, partB: 50, bloom: 50 },
      lbDecimals: 1, rateDecimals: 3, labelDecimals: 2,
    });
    expect(DATA.lines.cplus.stockMethods).toEqual({
      "1-1-1": { rates: { partA: 1, partB: 1, bloom: 1 } },
      "2-doser": { rates: { partA: 0.75, partB: 0.75, bloom: 1 } },
    });
    expect(DATA.lines.cplus.twoDoser).toMatchObject({ caStockOptions: [0.75, 1], nearRipenCaEcShare: 0.315 });
    expect(DATA.lines.cplus.stockTankVolume.minGal).toBe(10);
    expect(DATA.validation).toEqual({ us: { sampleMl: 250, waterGal: 5 }, metric: { sampleMl: 250, waterL: 20 }, displayDecimals: 2 });
  });

  test("pH ranges and supplement rates", () => {
    expect(DATA.dripperPh).toEqual({ floor: 5.5, cap: 6.0, decimals: 1, atLineBelow: 5.55, warmLineC: 25, warmLineF: 77 });
    expect(Object.keys(DATA.lines["3part"].phCeilingFit)).toEqual(["Veg", "Stretch", "Stack", "Swell", "Ripen"]);
    expect(Object.keys(DATA.lines.cplus.phCeilingFit)).toEqual(["Veg", "Stack", "Swell", "Ripen"]);
    expect(DATA.lines["3part"].phCeilingFit.Stack).toEqual({ lo: 1.4, c: [6.689279781888666, -2.2837510566099475, 0.5899482694086496] });
    expect(DATA.lines.cplus.phCeilingFit.Swell).toEqual({ lo: 1.0, c: [6.369377076383701, -2.0998578582025647, 0.5002124440639382] });
    expect(DATA.supplements).toEqual({
      si: { foliarMlPerGal: [0.5, 2], foliarMlPerL: [0.13, 0.53] },
      phUp: {
        maxGPerGal: [0.2, 0.25], highStrengthFlowerStopGPerGal: [0.15, 0.2], metricDecimals: 2,
        incrementGPerGal: 0.05, waitMinutes: [5, 15],
      },
      bioflo: {
        heavyMlPerGal: 30, heavyMlPerL: 8, maintenanceMlPerGal: 15, maintenanceMlPerL: 4,
        soakHours: [8, 24], maintenanceEveryWeeks: [1, 2],
      },
      triologic: { weeklyMlPerGal: 1, weeklyMlPerL: 0.25, maxMlPerGal: 2, maxMlPerL: 0.5 },
    });
    expect(DATA.reference.sterileReservoirCalHypoGPer100Gal).toBe(1.2);
  });

  test("usage numbers", () => {
    expect(DATA.usage).toMatchObject({
      triologicMlPerTreatedGal: 1, siFoliarMlPerGal: 2,
      defaults: { vegWeeks: 2, vegGalPerWeek: 1000, flowerWeeks: { Stretch: 2, Stack: 3, Swell: 3, Ripen: 1 }, flowerGalPerWeek: 10000 },
    });
  });

  test("pH Up numbers", () => {
    expect(DATA.phUp).toMatchObject({
      targetMultiplier: [[5.5, 0.42], [5.6, 0.53], [5.7, 0.66], [5.8, 0.81], [5.9, 1.0], [6.0, 1.22]],
      defaultTargetMax: 5.9, targetBelowCeiling: 0.1, warmLimitOffset: 0.08, maxGPerGal: 0.25, alkPpmPerGPerGal: 190,
      stockPresets: { mz2: 20, mz3000: 100 },
    });
    expect(DATA.phUp.curves["3part"].Stack).toEqual([0.048763, 1.28618]);
    expect(DATA.phUp.curves.cplus.Swell).toEqual([0.090494, 1.27285]);
  });

  test("DATA is frozen", () => {
    expect(Object.isFrozen(DATA.lines["3part"].recipes.Swell)).toBe(true);
  });
});

describe("sources", () => {
  test("every number has a source", () => {
    const missing = numericLeaves(DATA).filter(([path]) => !E.sourceFor(path)).map(([path]) => path);
    expect(missing).toEqual([]);
  });

  test("every source points at something in DATA", () => {
    const dangling = Object.keys(E.SOURCES).filter(path => resolvePath(path) === undefined);
    expect(dangling).toEqual([]);
  });

  test("audit differences are marked", () => {
    expect(E.sourceFor("lines.3part.stockMethods.2-doser.rates.partB")).toContain("audit N2");
    expect(E.sourceFor("usage.siFoliarMlPerGal")).toContain("foliar");
    expect(E.sourceFor("lines.cplus.phCeilingFit.Stack.c")).toContain("PHREEQC");
    expect(E.sourceFor("dripperPh.cap")).toContain("N12");
    expect(E.sourceFor("phUp.curves.3part.Stack")).toContain("N15");
    expect(E.sourceFor("phUp.curves.cplus.Stack")).toContain("no bench check");
  });
});

describe("matches src/nutrition-core.js", () => {
  const source = readFileSync(new URL("../src/nutrition-core.js", import.meta.url), "utf8");
  const core = new Function(`${source}\nreturn FRA_NUTRITION_CORE;`)() as any;

  test("constants", () => {
    expect(DATA.units).toEqual(core.fieldUnits);
    expect(DATA.feedUnits.factors).toEqual(core.feedUnitFactors);
    const { directDecimals: _d, ...phz } = DATA.phoszyme;
    expect(phz).toEqual(core.phoszyme);
    for (const lineId of ["3part", "cplus"] as const) {
      const roleLine = core.getRoleLine(lineId);
      expect(DATA.lines[lineId].productsByRole).toEqual(roleLine.productsByRole);
      expect({ ...DATA.lines[lineId].ecPerGram, phoszyme: DATA.phoszyme.ecPerGram }).toEqual(roleLine.ecPerGram);
      expect(DATA.lines[lineId].recipes).toEqual(roleLine.recipes);
      expect(DATA.lines[lineId].recipeNames).toEqual(roleLine.recipeNames);
    }
  });

  test("dose math", () => {
    for (const lineId of ["3part", "cplus"] as const) {
      for (const recipe of DATA.lines[lineId].recipeNames) {
        for (const role of ["partA", "partB", "bloom"] as const) {
          for (const ec of [0, 0.05, 1.4, 2.2, 3, 3.37]) {
            expect(E.doseGramsPerGallon(lineId, recipe, role, ec)).toBe(core.doseRoleGramsPerGallon(lineId, recipe, role, ec));
          }
        }
        for (const application of ["stock", "direct"] as const) {
          for (const included of [true, false]) {
            expect(E.phoszymeAdjustment({ lineId, recipeName: recipe, targetEc: 2.7, application, included }))
              .toEqual(core.getPhoszymeAdjustment({ lineId, recipeName: recipe, targetEc: 2.7, application, included }));
          }
        }
      }
    }
    for (const unit of ["mL/gal", "injection %", "ratio", "mL/L", "g/gal", "g/L"] as const) {
      for (const pct of [0, 0.013, 0.528, 1.9]) {
        const engine = E.formatFeedDoseFromInjectionPercent(pct, unit);
        const legacy = core.formatFeedDoseFromInjectionPercent(pct, unit);
        // Ruled: a nonzero dose gets extra decimals instead of printing as zero.
        if (pct > 0 && legacy.dosage === 0) expect(engine.dosage).toBeGreaterThan(0);
        else expect(engine).toEqual(legacy);
      }
    }
  });
});

describe("documented values", () => {
  test("FR worked example A: 3-Part Stack at EC 2.2, 3-2-2 injects ~20.0 mL/gal on all three tanks", () => {
    expect(E.doseGramsPerGallon("3part", "Stack", "partA", 2.2)).toBeCloseTo(3.59, 2);
    expect(E.doseGramsPerGallon("3part", "Stack", "partB", 2.2)).toBeCloseTo(2.40, 2);
    expect(E.doseGramsPerGallon("3part", "Stack", "bloom", 2.2)).toBeCloseTo(2.40, 2);
    const chart = E.computeFeedChart({ line: "3part", ecPreset: "custom", targetEc: { Stack: 2.2 } as any, recipeSchedule: "custom", phaseRecipe: { Stack: "Stack" } as any, unit: "injection %" });
    const stackIndex = 2;
    expect(chart.rows.map(row => row.cells[stackIndex]!.display)).toEqual(["0.53", "0.53", "0.53"]);
    const ratio = E.computeFeedChart({ ...chart.settings, unit: "ratio" });
    expect(ratio.rows.map(row => row.cells[stackIndex]!.display)).toEqual(["1:189", "1:189", "1:189"]);
  });

  test("FR worked example B: PhosZyme scales Stack 2.2 to ~2.149 and delivers ~0.234 g/gal", () => {
    const adj = E.phoszymeAdjustment({ lineId: "3part", recipeName: "Stack", targetEc: 2.2, application: "stock" });
    expect(adj.baseTargetEc).toBeCloseTo(2.149, 3);
    expect(E.doseGramsPerGallon("3part", "Stack", "partB", adj.baseTargetEc) * DATA.phoszyme.stockCarrierRatio).toBeCloseTo(0.234, 3);
  });

  test("high-strength Veg PhosZyme in stock lands at ~0.408 g/gal (FR 10% rule)", () => {
    const adj = E.phoszymeAdjustment({ lineId: "3part", recipeName: "Veg", targetEc: 3.0, application: "stock" });
    expect(E.doseGramsPerGallon("3part", "Veg", "partB", adj.baseTargetEc) * 0.1).toBeCloseTo(0.408, 3);
  });

  test("DTR PhosZyme is fixed at 0.4 g/gal / 0.088 EC and warns below 0.088", () => {
    const chart = E.computeFeedChart({ line: "cplus", application: "direct", usePhoszyme: true, unit: "g/L", ecPreset: "custom", targetEc: { Swell: 0.05 } as any });
    const row = chart.rows.find(r => r.key === "phoszyme")!;
    expect(row.cells[0]).toEqual({ dosage: 0.106, ec: 0.088, display: "0.106" });
    expect(chart.phoszymeWarning.phases).toEqual(["Swell"]);
    expect(chart.phoszymeWarning.text).toContain("minimum final EC is 0.088");
  });

  test("3-Part stock validation ECs (TS § Stock Concentrate Methods)", () => {
    const val = (method: string) => Object.fromEntries(
      E.computeFeedChart({ line: "3part", method }).stock!.rows.map(r => [r.key, r.valEC]),
    );
    const v322 = val("3-2-2");
    expect([v322.partA, v322.partB, v322.bloom]).toEqual([2.75, 1.53, 1.22]);
    expect(Math.round((v322.partB + v322.phz) * 100) / 100).toBe(1.66);
    const v433 = val("4-3-3");
    expect([v433.partA, v433.partB, v433.bloom]).toEqual([3.43, 1.91, 1.53]);
  });

  test("3-Part 2-doser: 75 lb A, 28 lb B + 50 lb Bloom, Tank 2 validates 2.08 (2.15 with PhosZyme; TS says 2.06/2.13, audit N2)", () => {
    const chart = E.computeFeedChart({ line: "3part", doserCount: 2 });
    const rows = Object.fromEntries(chart.stock!.rows.map(r => [r.key, r]));
    expect([rows.partA.wt, rows.partB.wt, rows.bloom.wt, rows.phz.wt]).toEqual([75, 28, 50, 2.8]);
    expect([rows.partA.valEC, rows.partB.valEC, rows.bloom.valEC]).toEqual([2.75, 0.86, 1.22]);
    expect(chart.stock!.tank2Total).toBe("2.08");
    expect(E.computeFeedChart({ line: "3part", doserCount: 2, usePhoszyme: true }).stock!.tank2Total).toBe("2.15");
  });

  test("3-Part 2-doser at Swell EC 3.0 runs ~24.0 / ~40.3 mL/gal and hits the target EC", () => {
    const chart = E.computeFeedChart({ line: "3part", doserCount: 2, ecPreset: "custom", targetEc: { Stretch: 3.0 } as any });
    const [tank1, tank2] = chart.rows.map(row => row.cells[1]!);
    expect(tank1.display).toBe("24.0");
    expect(tank2.display).toBe("40.3");
    expect(tank1.ec + tank2.ec).toBeCloseTo(3.0, 10);
  });

  test("C+ stock validation ECs (FR § Component Plus Line)", () => {
    const rows = Object.fromEntries(E.computeFeedChart({ line: "cplus" }).stock!.rows.map(r => [r.key, r.valEC]));
    expect([rows.partA, rows.partB, rows.bloom]).toEqual([1.9, 1.7, 1.17]);
    expect(Math.round((rows.partB + rows.phz) * 100) / 100).toBe(1.83);
    const two = E.computeFeedChart({ line: "cplus", doserCount: 2 });
    expect(two.stock!.rows.map(r => r.valEC)).toEqual([1.43, 1.27, 0.1, 1.17]);
    expect(two.stock!.tank2Total).toBe("2.44");
    expect(E.computeFeedChart({ line: "cplus", doserCount: 2, usePhoszyme: true }).stock!.tank2Total).toBe("2.54");
  });

  test("C+ 2-doser rates print exactly as the FR controlled outputs table", () => {
    const rates = (settings: any, index: number) =>
      E.computeFeedChart({ line: "cplus", doserCount: 2, ...settings }).rows.map(row => row.cells[index]!.display);
    const swell3 = { ecPreset: "custom", targetEc: { Stretch: 3.0 } };
    expect(rates(swell3, 1)).toEqual(["38.8", "38.8"]);
    expect(rates({ ...swell3, cplusCaStockLbPerGal: 1 }, 1)).toEqual(["29.1", "38.8"]);
    expect(rates({ cplusFinalPhase: "near-ripen" }, 4)).toEqual(["19.9", "25.2"]);
    expect(rates({ cplusFinalPhase: "near-ripen", cplusCaStockLbPerGal: 1 }, 4)).toEqual(["14.9", "25.2"]);
    const mlPerGal = (role: "partA" | "partB", lbPerGal: number) =>
      E.doseGramsPerGallon("cplus", "Swell", role, 3.0) / (lbPerGal * 454) * 3785;
    expect(mlPerGal("partA", 0.75)).toBeCloseTo(38.8, 1);
    expect(mlPerGal("partB", 0.75)).toBeCloseTo(38.8, 1);
    expect(mlPerGal("partA", 1)).toBeCloseTo(29.1, 1);
  });
});

describe("settings", () => {
  test("defaults per line", () => {
    expect(E.resolveFeedSettings({})).toMatchObject({ line: "3part", method: "3-2-2", unit: "mL/gal", ecPreset: "high", recipeSchedule: "commercial" });
    expect(E.resolveFeedSettings({ line: "cplus" })).toMatchObject({ method: "1-1-1", stockTankVolumeGal: 50 });
  });

  test("DTR has no 2-doser and only g/gal or g/L", () => {
    const s = E.resolveFeedSettings({ application: "direct", doserCount: 2, unit: "mL/gal" });
    expect([s.doserCount, s.unit]).toEqual([3, "g/gal"]);
  });

  test("tank volume minimum is 10 gal on both lines", () => {
    expect(E.normalizeStockTankVolume("3part", 5)).toBe(50);
    expect(E.normalizeStockTankVolume("3part", 12.34)).toBe(12.3);
    expect(E.normalizeStockTankVolume("cplus", 5)).toBe(50);
    expect(E.normalizeStockTankVolume("cplus", 10)).toBe(10);
    expect(E.normalizeStockTankVolume("cplus", 0.5)).toBe(50);
    expect(E.normalizeStockTankVolume("cplus", 250000)).toBe(100000);
  });

  test("team-mode custom stock clamps to 0.1 lb/gal .. 3/2/2 lb/gal and labels itself", () => {
    expect(E.normalizeCustomLbs("3part", "partA", 200, 37.5)).toBe(112.5);
    expect(E.normalizeCustomLbs("3part", "partB", 1, 37.5)).toBe(3.8);
    expect(E.normalizeCustomLbs("3part", "bloom", "x", 50)).toBe(50);
    const s = E.resolveFeedSettings({ method: "custom", stockTankVolumeGal: 50, customLbs: { partA: 100, partB: 60, bloom: 40 } });
    expect(E.stockRates(s)).toEqual({ partA: 2, partB: 1.2, bloom: 0.8 });
    expect(E.stockConfigLabel(s)).toBe("Custom 2/1.2/0.8 lb/gal");
    expect(E.tankVolumes(s)).toEqual({ tankA: 50, tankB: 50 });
  });

  test("C+ team-mode custom stock clamps to 0.1 lb/gal .. 2/2/1.333 lb/gal and labels itself", () => {
    expect(E.normalizeCustomLbs("cplus", "partA", 200, 75)).toBe(150);
    expect(E.normalizeCustomLbs("cplus", "partB", 200, 75)).toBe(150);
    expect(E.normalizeCustomLbs("cplus", "bloom", 200, 75)).toBe(100);
    expect(E.normalizeCustomLbs("cplus", "bloom", 1, 50)).toBe(5);
    expect(E.normalizeCustomLbs("cplus", "partB", "x", 50)).toBe(50);
    const s = E.resolveFeedSettings({ line: "cplus", method: "custom", stockTankVolumeGal: 75, customLbs: { partA: 150, partB: 75, bloom: 100 } });
    expect(s.method).toBe("custom");
    expect(E.stockRates(s)).toEqual({ partA: 2, partB: 1, bloom: 1.333 });
    expect(E.stockConfigLabel(s)).toBe("Custom 2/1/1.33 lb/gal");
    expect(E.tankVolumes(s)).toEqual({ tankA: 75, tankB: 75 });
    const stock = E.computeFeedChart(s).stock!;
    expect(stock.rows.map(r => [r.key, r.wt, r.conc, r.valEC])).toEqual([
      ["partA", 150, 2, 3.8], ["partB", 75, 1, 1.7], ["phz", 7.5, 0.1, 0.13], ["bloom", 100, 1.333, 1.56],
    ]);
    // Two dosers ignore the custom charge.
    expect(E.stockRates({ ...s, doserCount: 2 })).toEqual({ partA: 0.75, partB: 0.75, bloom: 1 });
  });

  test("C+ custom at 1/1/1 lb/gal in 50 gal is the standard 1-1-1 chart", () => {
    for (const unit of DATA.feedUnits.stock) for (const usePhoszyme of [false, true]) for (const ecPreset of ["high", "standard"] as const) {
      const base = { line: "cplus" as const, unit, usePhoszyme, ecPreset };
      const standard = E.computeFeedChart(base);
      const custom = E.computeFeedChart({ ...base, method: "custom", stockTankVolumeGal: 50, customLbs: { partA: 50, partB: 50, bloom: 50 } });
      expect(custom.rows).toEqual(standard.rows);
      expect(custom.stock).toEqual(standard.stock);
      expect(custom.ph).toEqual(standard.ph);
      expect(custom.tankVolumes).toEqual(standard.tankVolumes);
    }
  });

  test("C+ custom 2.0/1.0/1.333 lb/gal in 75 gal matches the 2026-08-26 hand calculation", () => {
    const s = E.resolveFeedSettings({ line: "cplus", method: "custom", stockTankVolumeGal: 75, customLbs: { partA: 150, partB: 75, bloom: 100 }, ecPreset: "custom", targetEc: { Veg: 3.0, Stretch: 3.0, Stack: 2.7, Swell: 2.4, Ripen: 1.8 } });
    const rates = E.stockRates(s);
    const mlPerGal = (role: "partA" | "partB" | "bloom") => DATA.phases.map(phase =>
      E.doseGramsPerGallon("cplus", E.recipeForPhase(s, phase), role, s.targetEc[phase]) / rates[role] * DATA.feedUnits.factors["mL/gal"]);
    const hand = {
      partA: [23.7, 19.6, 13.1, 11.6, 7.5],
      partB: [35.4, 28.3, 26.2, 23.3, 15.9],
      bloom: [0, 17.7, 26.2, 23.3, 22.2],
    };
    for (const role of ["partA", "partB", "bloom"] as const) {
      mlPerGal(role).forEach((value, i) => expect(Math.abs(value - hand[role][i])).toBeLessThanOrEqual(0.1));
    }
    // The chart prints the same doses at the unit's display rounding.
    const rows = Object.fromEntries(E.computeFeedChart(s).rows.map(row => [row.key, row.cells.map(c => c && c.dosage)]));
    for (const role of ["partA", "partB", "bloom"] as const) expect(rows[role]).toEqual(mlPerGal(role).map(v => Math.round(v)));
  });

  test("recipe schedule derivation", () => {
    expect(E.deriveRecipeSchedule("cplus", DATA.lines.cplus.schedules["swell-flower"])).toBe("swell-flower");
    expect(E.resolveFeedSettings({ recipeSchedule: "custom", phaseRecipe: { Ripen: "Swell" } as any }).recipeSchedule).toBe("custom");
    expect(E.recipeScheduleLabel(E.resolveFeedSettings({ line: "cplus", doserCount: 2, cplusFinalPhase: "near-ripen" }))).toBe("Swell + Near Ripen");
  });
});

describe("pH ranges", () => {
  const cols = (input: any) => E.computeFeedChart(input).ph.columns.map(c => c && c.text);

  test("3-Part: each column follows its own recipe and EC", () => {
    expect(cols({ line: "3part" })).toEqual(["5.5–6.0", "5.5–5.7", "5.5–5.8", "5.5–5.8", "5.5–6.0"]);
    expect(cols({ line: "3part", ecPreset: "standard" })).toEqual(["5.5–6.0", "5.5–5.9", "5.5–5.9", "5.5–6.0", "5.5–6.0"]);
  });

  test("C+: each column follows its own recipe and EC; at the line the range closes to 5.5", () => {
    expect(cols({ line: "cplus" })).toEqual(["5.5–6.0", "5.5", "5.5–5.6", "5.5–5.6", "5.5–5.9"]);
    expect(cols({ line: "cplus", ecPreset: "standard" })).toEqual(["5.5–6.0", "5.5–5.7", "5.5–5.7", "5.5–5.8", "5.5–6.0"]);
    const flags = E.computeFeedChart({ line: "cplus", recipeSchedule: "swell-flower" }).ph.columns.map(c => c && c.atLine);
    expect(flags).toEqual([false, true, false, false, false]);
  });

  test("ceiling: modeled limit to the nearest 0.1, floor 5.5, cap 6.0, cap below the fit floor", () => {
    const stack3 = E.dripperPhRange("3part", "Stack", 3.0);
    expect(stack3.limit).toBeCloseTo(5.734, 3);
    expect(stack3.ceiling).toBe(5.7);
    expect(E.dripperPhRange("3part", "Stack", 1.39).ceiling).toBe(6.0);
    expect(E.dripperPhRange("cplus", "Swell", 3.0)).toMatchObject({ ceiling: 5.5, atLine: true });
    expect(E.dripperPhRange("cplus", "Swell", 4.5).ceiling).toBe(5.5);
    expect(E.dripperPhRange("cplus", "Swell", 2.7)).toMatchObject({ ceiling: 5.6, atLine: false });
    expect(E.formatPhRange([5.5, 5.5])).toBe("5.5");
  });

  test("C+ 2-doser Near Ripen takes the lower of the Swell and Ripen limits", () => {
    const col = E.computeFeedChart({ line: "cplus", doserCount: 2, cplusFinalPhase: "near-ripen" }).ph.columns[4]!;
    const lower = Math.min(E.dripperPhRange("cplus", "Swell", 1.8).limit, E.dripperPhRange("cplus", "Ripen", 1.8).limit);
    expect(col.limit).toBe(lower);
  });

  test("2-doser: the unserved Veg column has no range", () => {
    expect(cols({ line: "3part", doserCount: 2 })[0]).toBeNull();
    expect(cols({ line: "cplus", doserCount: 2 })[0]).toBeNull();
  });
});

describe("supplements", () => {
  test("rates, US and metric", () => {
    expect(E.supplementRates(false)).toMatchObject({
      siFoliar: "0.5–2 mL/gal", phUpMax: "0.2–0.25", phUpHighStrengthFlowerStop: "0.15–0.2",
      biofloHeavy: "30 mL/gal", biofloMaintenance: "15 mL/gal", triologicWeekly: "1 mL/gal", triologicMax: "2 mL/gal",
    });
    expect(E.supplementRates(true)).toMatchObject({
      siFoliar: "0.13–0.53 mL/L", phUpMax: "0.05–0.07", phUpHighStrengthFlowerStop: "0.04–0.05", phUpUnit: "g/L",
      biofloHeavy: "8 mL/L", biofloMaintenance: "4 mL/L", triologicWeekly: "0.25 mL/L", triologicMax: "0.5 mL/L",
    });
  });
});

describe("usage", () => {
  const base = {
    lineId: "3part" as const,
    ec: DATA.ecPresets.high,
    vegWeeks: 2, vegGalPerWeek: 1000,
    flowerWeeks: DATA.usage.defaults.flowerWeeks, flowerGalPerWeek: 10000,
  };
  const amount = (est: any, name: string) => est.products.find((p: any) => p.name === name).amount;

  test("columns follow the Commercial schedule and preset ECs", () => {
    const cols = E.usageColumns(base);
    expect(cols.map(c => `${c.recipe} ${c.ec} ${c.gallons}`)).toEqual([
      "Veg 3 2000", "Stack 3 20000", "Swell 2.7 30000", "Swell 2.4 30000", "Ripen 1.8 10000",
    ]);
    expect(E.usageColumns({ ...base, schedule: "swell-flower" }).map(c => c.recipe)).toEqual(["Veg", "Swell", "Swell", "Swell", "Swell"]);
  });

  test("base products sum each column's recipe dose", () => {
    const est = E.usageEstimate(base);
    const expected = E.usageColumns(base).reduce((sum, c) => sum + c.gallons * E.doseGramsPerGallon("3part", c.recipe, "partA", c.ec) / 454, 0);
    expect(amount(est, "Part A")).toBeCloseTo(expected, 9);
    expect(est.totalGal).toBe(92000);
  });

  test("PhosZyme takes 0.088 EC off the base and adds 0.4 g/gal", () => {
    const withPhz = E.usageEstimate({ ...base, phoszyme: true });
    expect(amount(withPhz, "PhosZyme")).toBeCloseTo(92000 * 0.4 / 454, 9);
    expect(amount(withPhz, "Part A")).toBeLessThan(amount(E.usageEstimate(base), "Part A"));
  });

  test("pH Up = refit curve × target multiplier − alkalinity / 190, per column", () => {
    const ro = E.usageEstimate({ ...base, phUp: true, alkPpm: 0 });
    const expected = E.usageColumns(base).reduce((sum, c) =>
      sum + c.gallons * E.phUpDoseTo59("3part", c.recipe, c.ec) * E.phUpTargetMultiplier(E.phUpTarget("3part", c.recipe, c.ec).target) / 454, 0);
    expect(amount(ro, "pH Up")).toBeCloseTo(expected, 9);
    expect(amount(ro, "pH Up")).toBeCloseTo(25.9, 1);
    expect(amount(E.usageEstimate({ ...base, phUp: true, alkPpm: 10 }), "pH Up")).toBeLessThan(amount(ro, "pH Up"));
    expect(amount(E.usageEstimate({ ...base, phUp: true, alkPpm: 30 }), "pH Up")).toBe(0);
    expect(amount(E.usageEstimate(base), "pH Up")).toBe(0);
  });

  test("Triologic per treated gallon; Si only as foliar", () => {
    const est = E.usageEstimate({ ...base, triologic: true, triologicVegGalPerWeek: 500, triologicFlowerGalPerWeek: 1000, si: true, siFoliarGal: 400 });
    expect(amount(est, "Triologic")).toBeCloseTo((2 * 500 + 9 * 1000) / 3785, 9);
    expect(amount(est, "Si")).toBeCloseTo(400 * 2 / 3785, 9);
    expect(est.products.find((p: any) => p.name === "Si").byColumn).toEqual([0, 0, 0, 0, 0]);
  });

  test("bags round up to 0.1 and cost uses supplied prices only", () => {
    expect(E.usageUnitsNeeded(26, 25)).toBe(1.1);
    expect(E.usageUnitsNeeded(25, 25)).toBe(1);
    const est = E.usageEstimate(base);
    const cost = E.usageCost(est, { "Part A": 100 }, 5);
    expect(cost.total).toBeCloseTo(amount(est, "Part A") * 4, 9);
    expect(cost.perYear).toBeCloseTo(cost.total * 5, 9);
    expect(cost.unpriced).toEqual(["Part B", "Bloom"]);
  });

  test("purchase: per year = per cycle × cycles, whole packages round up, metric from the unit constants", () => {
    const est = E.usageEstimate({ ...base, triologic: true, triologicVegGalPerWeek: 500, triologicFlowerGalPerWeek: 1000 });
    const buy = E.usagePurchase(est, 5);
    const partA = buy.products.find((p: any) => p.name === "Part A")!;
    expect(partA.perYear).toBeCloseTo(amount(est, "Part A") * 5, 9);
    expect(partA.perYearUnits).toBe(E.usageUnitsNeeded(amount(est, "Part A") * 5, 25));
    expect(partA.perYearWholeUnits).toBe(Math.ceil(partA.perYearUnits));
    expect(partA.perYearMetric).toBeCloseTo(partA.perYear * 454 / 1000, 9);
    expect(partA.unitSizeMetric).toBeCloseTo(11.35, 9);
    const tri = buy.products.find((p: any) => p.name === "Triologic")!;
    expect(tri.liquid).toBe(true);
    expect(tri.perCycleMetric).toBeCloseTo(tri.perCycle * 3.785, 9);
    expect(buy.products.map((p: any) => p.name)).toEqual(["Part A", "Part B", "Bloom", "Triologic"]);
    expect(buy.galPerYear).toBe(92000 * 5);
    expect(E.usagePurchase(est, 0).products[0].perYearWholeUnits).toBe(0);
    expect(E.usageUnitsNeeded(50, 25)).toBe(2);
    expect(E.usagePurchase({ ...est, products: [{ ...est.products[0], amount: 50 }] } as any, 1).products[0].perYearWholeUnits).toBe(2);
  });

  test("the engine holds no prices", () => {
    const text = JSON.stringify(DATA);
    expect(text).not.toMatch(/price/i);
  });
});

// Ruled display behavior (Tyler 2026-09-29).
describe("display rules", () => {
  test("2-doser rates print one decimal finer in every unit except ratio", () => {
    const at = (unit: string) => E.computeFeedChart({ line: "3part", doserCount: 2, unit } as any).rows[0].cells[4]!;
    expect(at("mL/gal")).toMatchObject({ display: "14.4", dosage: 14.4 });
    expect(at("injection %").display).toBe("0.381");
    expect(at("ratio").display).toBe("1:263");
    expect(at("mL/L").display).toBe("3.81");
  });

  test("a nonzero dose never prints as a dash", () => {
    const chart = E.computeFeedChart({ line: "3part", ecPreset: "custom", targetEc: { Swell: 0.05 } as any });
    const cell = chart.rows[0].cells[3]!;
    expect(cell.display).not.toBe("–");
    expect(Number(cell.display)).toBeGreaterThan(0);
  });

  test("2-doser charts label the unserved column Veg on every surface", () => {
    expect(E.computeFeedChart({ line: "3part", doserCount: 2 }).phases[0].recipeLabel).toBe("Veg");
  });
});

// Tyler's 2026-09-29 rulings N17-N19.
describe("stock and 2-doser rulings", () => {
  test("N17: metric charge from exact litres and g/L, rounded once, on both lines", () => {
    expect(E.metricWeightKg(53.5, 1.87)).toBe(45.4);
    const three = E.computeFeedChart({ line: "3part", method: "4-3-3", unit: "mL/L" }).stock!.rows[0].wt;
    const cplus = E.computeFeedChart({ line: "cplus", stockTankVolumeGal: 53.5, unit: "mL/L" }).stock!.rows[0].wt;
    expect(three).toBe(45.4);
    expect(cplus).toBe(E.metricWeightKg(53.5, 1));
  });

  test("N18: metric validation is 250 mL of stock in 20 L, computed for that sample", () => {
    const us = E.computeFeedChart({ line: "3part" }).stock!.rows[0].valEC;
    const metric = E.computeFeedChart({ line: "3part", unit: "mL/L" }).stock!;
    expect(us).toBe(2.75);
    expect(metric.rows[0]).toMatchObject({ sample: 250, valEC: +(1.5 * 454 / 3.785 * 0.25 / 20 * 0.306 * 3.785).toFixed(2) });
    expect(metric.sampleUnit).toBe("mL / 20L");
  });

  test("N19: C+ 2-doser Tank 2 uses the whole-tank solve, so its EC is what the tank delivers", () => {
    const chart = E.computeFeedChart({ line: "cplus", doserCount: 2, unit: "injection %" });
    const cell = chart.rows[1].cells[1]!;
    const t2 = E.twoDoserTank2TargetEc(chart.settings, "Stretch", 3.0);
    const cplusGramsPerGal = E.doseGramsPerGallon("cplus", "Swell", "partB", t2);
    const delivered = cplusGramsPerGal * 0.283 + cplusGramsPerGal * (1 / 0.75) * 0.195;
    expect(cell.ec).toBeCloseTo(delivered, 12);
    expect(cell.ec).toBeCloseTo(3.0 * (0.3294 + 0.3022), 12);
  });
});
