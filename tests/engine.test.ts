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
    expect(tp.twoDoser).toMatchObject({ tankGal: 50, bloomLb: 50, partBLb: 28, tank2VolumeFactor: 1, mlPerGalDecimals: 1 });
    expect(tp.stockTankVolume).toEqual({ defaultGal: 50, minGal: 10, maxGal: 100000, decimals: 1 });
    expect(tp.customStock).toEqual({
      maxLbPerGal: { partA: 3, partB: 2, bloom: 2 }, minLbPerGal: 0.1, defaultLbs: { partA: 75, partB: 50, bloom: 50 },
      lbDecimals: 1, rateDecimals: 3, labelDecimals: 2,
    });
    expect(DATA.lines.cplus.stockMethods).toEqual({
      "1-1-1": { rates: { partA: 1, partB: 1, bloom: 1 } },
      "2-doser": { rates: { partA: 0.75, partB: 0.75, bloom: 1 } },
    });
    expect(DATA.lines.cplus.twoDoser).toMatchObject({ caStockOptions: [0.75, 1], nearRipenCaEcShare: 0.315 });
    expect(DATA.lines.cplus.stockTankVolume.minGal).toBe(1);
    expect(DATA.validation).toEqual({ us: { sampleMl: 250, waterGal: 5 }, metric: { sampleMl: 400, waterL: 20 }, displayDecimals: 2 });
  });

  test("pH ranges and supplement rates", () => {
    expect(DATA.lines["3part"].ph).toEqual({
      standard: [5.5, 6.0], highStrengthFlower: [5.5, 5.8], flowerRecipes: ["Stretch", "Stack", "Swell"],
    });
    expect(DATA.lines.cplus.ph).toEqual({
      flower: { standard: [5.5, 5.7], high: [5.5, 5.6] },
      vegRipen: { standard: [5.5, 6.0], high: [5.5, 5.8] },
      flowerRecipes: ["Stack", "Swell"],
      highStrengthEc: { Veg: 3.0, Stack: 2.7, Swell: 2.4, Ripen: 1.8 },
    });
    expect(DATA.supplements).toEqual({
      si: { foliarMlPerGal: [0.5, 2], foliarMlPerL: [0.13, 0.53] },
      phUp: {
        maxGPerGal: [0.2, 0.25], highStrengthFlowerStopGPerGal: [0.15, 0.2], metricDecimals: 2,
        incrementGPerGal: 0.05, waitMinutes: [5, 15], printRangeGPerGal: [0.05, 0.25],
      },
      bioflo: {
        heavyMlPerGal: 30, heavyMlPerL: 8, maintenanceMlPerGal: 15, maintenanceMlPerL: 4,
        soakHours: [8, 24], maintenanceEveryWeeks: [1, 2], printMlPerGal: 30,
      },
      triologic: { weeklyMlPerGal: 1, weeklyMlPerL: 0.25, transplantMlPerGal: 2, transplantMlPerL: 0.5, printRangeMlPerGal: [1, 2] },
    });
  });

  test("usage numbers", () => {
    expect(DATA.usage).toMatchObject({
      flowerRecipe: "Swell", phUpGPerGal: 0.2, triologicMlPerTreatedGal: 1,
      siRateByEc: { zeroAbove: 3.5, bands: [[3.1, 0.125], [2.7, 0.25], [2.3, 0.375]], below: 0.5 },
    });
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
    expect(E.sourceFor("supplements.triologic.printRangeMlPerGal")).toContain("audit N3");
    expect(E.sourceFor("supplements.bioflo.printMlPerGal")).toContain("audit N4");
    expect(E.sourceFor("supplements.phUp.printRangeGPerGal")).toContain("audit N5");
    expect(E.sourceFor("reference.threePartSterileReservoirCalHypoGPer100Gal")).toContain("audit N6");
    expect(E.sourceFor("usage.siRateByEc.below")).toContain("audit N10");
    expect(E.sourceFor("lines.cplus.stockTankVolume.minGal")).toContain("audit N11");
    expect(E.sourceFor("lines.cplus.ph.flower.high")).toContain("audit N12");
    expect(E.sourceFor("lines.3part.ph.highStrengthFlower")).toContain("audit N13");
    expect(E.sourceFor("usage.phUpGPerGal")).toContain("audit N14");
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
        expect(E.formatFeedDoseFromInjectionPercent(pct, unit)).toEqual(core.formatFeedDoseFromInjectionPercent(pct, unit));
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

  test("C+ 2-doser rates (FR controlled outputs table)", () => {
    const wholeMl = (settings: any, index: number) =>
      E.computeFeedChart({ line: "cplus", doserCount: 2, ...settings }).rows.map(row => row.cells[index]!.dosage);
    const swell3 = { ecPreset: "custom", targetEc: { Stretch: 3.0 } };
    expect(wholeMl(swell3, 1)).toEqual([39, 39]);
    expect(wholeMl({ ...swell3, cplusCaStockLbPerGal: 1 }, 1)).toEqual([29, 39]);
    expect(wholeMl({ cplusFinalPhase: "near-ripen" }, 4)).toEqual([20, 25]);
    expect(wholeMl({ cplusFinalPhase: "near-ripen", cplusCaStockLbPerGal: 1 }, 4)).toEqual([15, 25]);
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

  test("tank volume limits differ per line (3-Part 10 gal, C+ 1 gal)", () => {
    expect(E.normalizeStockTankVolume("3part", 5)).toBe(50);
    expect(E.normalizeStockTankVolume("3part", 12.34)).toBe(12.3);
    expect(E.normalizeStockTankVolume("cplus", 5)).toBe(5);
    expect(E.normalizeStockTankVolume("cplus", 0.5)).toBe(50);
    expect(E.normalizeStockTankVolume("cplus", 250000)).toBe(100000);
  });

  test("team-mode custom stock clamps to 0.1 lb/gal .. 3/2/2 lb/gal and labels itself", () => {
    expect(E.normalizeCustomLbs("partA", 200, 37.5)).toBe(112.5);
    expect(E.normalizeCustomLbs("partB", 1, 37.5)).toBe(3.8);
    expect(E.normalizeCustomLbs("bloom", "x", 50)).toBe(50);
    const s = E.resolveFeedSettings({ method: "custom", stockTankVolumeGal: 50, customLbs: { partA: 100, partB: 60, bloom: 40 } });
    expect(E.stockRates(s)).toEqual({ partA: 2, partB: 1.2, bloom: 0.8 });
    expect(E.stockConfigLabel(s)).toBe("Custom 2/1.2/0.8 lb/gal");
    expect(E.tankVolumes(s)).toEqual({ tankA: 50, tankB: 50 });
  });

  test("recipe schedule derivation", () => {
    expect(E.deriveRecipeSchedule("cplus", DATA.lines.cplus.schedules["swell-flower"])).toBe("swell-flower");
    expect(E.resolveFeedSettings({ recipeSchedule: "custom", phaseRecipe: { Ripen: "Swell" } as any }).recipeSchedule).toBe("custom");
    expect(E.recipeScheduleLabel(E.resolveFeedSettings({ line: "cplus", doserCount: 2, cplusFinalPhase: "near-ripen" }))).toBe("Swell + Near Ripen");
  });
});

describe("pH ranges", () => {
  test("3-Part: high preset is high-strength flower; standard is not; tolerance just under 0.001", () => {
    expect(E.computeFeedChart({ line: "3part" }).ph).toMatchObject({ highStrengthFlower: true, flower: "5.5–5.8", vegRipen: "5.5–6.0" });
    expect(E.computeFeedChart({ line: "3part", ecPreset: "standard" }).ph).toMatchObject({ highStrengthFlower: false, flower: "5.5–6.0" });
    const edge = { line: "3part", ecPreset: "custom", recipeSchedule: "custom", phaseRecipe: { Stack: "Stack" } } as any;
    const low = { Veg: 2, Stretch: 2, Stack: 2.698, Swell: 2, Ripen: 1 };
    expect(E.computeFeedChart({ ...edge, targetEc: { ...low } }).ph.highStrengthFlower).toBe(false);
    expect(E.computeFeedChart({ ...edge, targetEc: { ...low, Stack: 2.6995 } }).ph.highStrengthFlower).toBe(true);
    // 2.7 - 0.001 is 2.6990000000000003 in floating point, so 2.699 itself is not high strength.
    expect(E.computeFeedChart({ ...edge, targetEc: { ...low, Stack: 2.699 } }).ph.highStrengthFlower).toBe(false);
  });

  test("C+: flower and Veg/Ripen switch separately", () => {
    expect(E.computeFeedChart({ line: "cplus" }).ph).toMatchObject({ flower: "5.5–5.6", vegRipen: "5.5–5.8" });
    expect(E.computeFeedChart({ line: "cplus", ecPreset: "standard" }).ph).toMatchObject({ flower: "5.5–5.7", vegRipen: "5.5–6.0" });
  });
});

describe("supplements", () => {
  test("screen rates, US and metric", () => {
    expect(E.supplementRates(false)).toMatchObject({
      siFoliar: "0.5–2 mL/gal", phUpMax: "0.2–0.25", phUpHighStrengthFlowerStop: "0.15–0.2",
      biofloHeavy: "30 mL/gal", biofloMaintenance: "15 mL/gal", triologicWeekly: "1 mL/gal", triologicTransplant: "2 mL/gal",
    });
    expect(E.supplementRates(true)).toMatchObject({
      siFoliar: "0.13–0.53 mL/L", phUpMax: "0.05–0.07", phUpHighStrengthFlowerStop: "0.04–0.05", phUpUnit: "g/L",
      biofloHeavy: "8 mL/L", biofloMaintenance: "4 mL/L", triologicWeekly: "0.25 mL/L", triologicTransplant: "0.5 mL/L",
    });
  });

  test("3-Part printed additive table is US-only with its own ranges (audit N3-N5)", () => {
    expect(E.threePartPrintAdditiveRates()).toEqual({
      si: "0.5–2 mL/gal", triologic: "1–2 mL/gal", bioflo: "30 mL/gal", phUp: "0.05–0.25 g/gal",
    });
  });
});

describe("usage", () => {
  test("Si rate bands", () => {
    expect([3.6, 3.5, 3.1, 3.0, 2.7, 2.69, 2.3, 2.29].map(E.usageSiRate)).toEqual([0, 0.125, 0.125, 0.25, 0.25, 0.375, 0.375, 0.5]);
  });

  test("amounts and bags", () => {
    const products = E.usageProducts("3part", { "Part A": 100 });
    const result = E.usageEstimate({
      lineId: "3part",
      veg: { feedEC: 3, weeks: 2, galPerWeek: 1000, triologicGalPerWeek: 0 },
      flower: { feedEC: 3, weeks: 9, galPerWeek: 10000, triologicGalPerWeek: 0 },
      products,
    });
    const partA = result.products[0];
    expect(partA.vegAmount).toBeCloseTo(2000 * 3 * 0.6428571428571 / 0.306 / 454, 10);
    expect(partA.bags).toBe(Math.ceil(partA.totalAmount / 25 * 10) / 10);
    expect(partA.totalCost).toBeCloseTo(partA.totalAmount * 4, 10);
  });
});

// Places where the current pages are inconsistent. The engine reproduces each one on
// purpose; these tests document the behavior until Tyler decides.
describe("reproduced inconsistencies", () => {
  test("3-Part 2-doser re-prints only mL/gal to 0.1; other units keep their usual rounding", () => {
    const at = (unit: string) => E.computeFeedChart({ line: "3part", doserCount: 2, unit } as any).rows[0].cells[4]!;
    expect(at("mL/gal")).toMatchObject({ display: "14.4", dosage: 14 });
    expect(at("injection %").display).toBe("0.38");
    expect(at("ratio").display).toBe("1:263");
    expect(at("mL/L").display).toBe("3.8");
  });

  test("3-Part 2-doser: a rate that rounds to 0 whole mL prints as a dash even though its 0.1 mL display is not 0", () => {
    const chart = E.computeFeedChart({ line: "3part", doserCount: 2, ecPreset: "custom", targetEc: { Swell: 0.05 } as any });
    const tank1 = chart.rows[0].cells[3]!;
    expect(tank1).toMatchObject({ display: "0.4", dosage: 0 });
  });

  test("3-Part 2-doser prints 'Swell' under Veg / Moms on the printed chart but 'Veg' in Copy Summary", () => {
    const veg = E.computeFeedChart({ line: "3part", doserCount: 2 }).phases[0];
    expect(veg.recipeLabel).toEqual({ summary: "Veg", print: "Swell" });
  });

  test("2-doser pH: the unserved Veg column counts as Swell (3-Part), and C+ Veg/Ripen never switch to high strength", () => {
    const lowFlower = { Veg: 3.0, Stretch: 2.0, Stack: 2.0, Swell: 2.0, Ripen: 1.0 };
    expect(E.computeFeedChart({ line: "3part", doserCount: 2, ecPreset: "custom", targetEc: lowFlower }).ph.highStrengthFlower).toBe(true);
    expect(E.computeFeedChart({ line: "3part", doserCount: 3, ecPreset: "custom", targetEc: lowFlower }).ph.highStrengthFlower).toBe(false);
    expect(E.computeFeedChart({ line: "cplus", doserCount: 2 }).ph.vegRipen).toBe("5.5–6.0");
    expect(E.computeFeedChart({ line: "cplus", doserCount: 3 }).ph.vegRipen).toBe("5.5–5.8");
  });

  test("metric stock charge: 3-Part rounds litres and g/L first, C+ does not", () => {
    // 4-3-3 Part A: 53.5 gal at 1.87 lb/gal.
    expect(E.threePartMetricWeightKg(Math.round(53.5 * 3.785), Math.round(1.87 * 454 / 3.785))).toBe(45.2);
    expect(E.cplusMetricWeightKg(53.5, 1.87)).toBe(45.4);
  });

  test("metric validation uses 400 mL in 20 L, so metric validation ECs are not the US ones", () => {
    const us = E.computeFeedChart({ line: "3part" }).stock!.rows[0].valEC;
    const metric = E.computeFeedChart({ line: "3part", unit: "mL/L" }).stock!.rows[0].valEC;
    expect([us, metric]).toEqual([2.75, 4.17]);
  });

  test("C+ 2-doser Tank 2 rate comes from the C+ share alone and its EC from the recipe, unlike the 3-Part tank solver", () => {
    const chart = E.computeFeedChart({ line: "cplus", doserCount: 2, unit: "injection %" });
    const cell = chart.rows[1].cells[1]!;
    const eEc = 3.0;
    expect(cell.ec).toBeCloseTo(eEc * (0.3294 + 0.3022), 12);
    // What the tank actually delivers at that rate (MKP rides at 1.00:0.75 by weight):
    const cplusGramsPerGal = E.doseGramsPerGallon("cplus", "Swell", "partB", eEc);
    const delivered = cplusGramsPerGal * 0.283 + cplusGramsPerGal * (1 / 0.75) * 0.195;
    expect(Math.abs(delivered - cell.ec)).toBeGreaterThan(0);
    expect(Math.abs(delivered - cell.ec) / cell.ec).toBeLessThan(0.002);
  });
});
