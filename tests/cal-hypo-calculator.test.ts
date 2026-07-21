import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const calculator = readFileSync(new URL("../cal-hypo/index.html", import.meta.url), "utf8");
const inlineScript = calculator.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!inlineScript) throw new Error("Calculator is missing its inline script");

type Result = { valid: true; [key: string]: any } | { valid: false; code: string; message: string };
type Api = {
  CAL_HYPO_CONTRACT: any;
  stockRateToGPerLiter: (value: unknown, unit: string) => Result;
  stockPreparationVolume: (value: unknown, unit: string) => Result;
  calculateStockUsage: (input: Record<string, unknown>) => Result;
  calculateStockPreparation: (input: Record<string, unknown>) => Result;
  calculateDirectPowder: (input: Record<string, unknown>) => Result;
  calculateStockStrengthFromDrytec: (input: Record<string, unknown>) => Result;
  calculateDoseFromStock: (input: Record<string, unknown>) => Result;
  calculateInjectorOutput: (input: Record<string, unknown>) => Result;
  buildQuickReferenceRows: (input: Record<string, unknown>) => Result[];
  buildDirectDoseReferenceRows: (unitSystem: string) => Array<{ ppm: number; label: string; category: string; calculation: Result }>;
  formatMass: (grams: number) => { text: string };
  formatLiquidVolume: (milliliters: number) => string;
  formatMilliliters: (milliliters: number) => string;
  CAL_HYPO_UI: {
    modes: Array<{ id: string; label: string }>;
    createState: () => Record<string, any>;
    setField: (state: Record<string, any>, mode: string, field: string, value: unknown) => Record<string, any>;
    selectMode: (state: Record<string, any>, mode: string) => Record<string, any>;
    selectStockPreset: (state: Record<string, any>, preset: string) => Record<string, any>;
    changeUnitSystem: (state: Record<string, any>, unitSystem: string) => Record<string, any>;
    compareResidual: (value: unknown) => Record<string, any>;
    evaluate: (state: Record<string, any>) => Record<string, any>;
  };
};

const api = new Function(`${inlineScript}\nreturn CAL_HYPO_API;`)() as Api;

function expectValid(result: Result) {
  expect(result.valid).toBe(true);
  if (!result.valid) throw new Error(result.message);
  return result;
}

describe("calcium hypochlorite calculation contract", () => {
  test("uses the guaranteed-minimum 65% available chlorine", () => {
    expect(Object.isFrozen(api.CAL_HYPO_CONTRACT)).toBe(true);
    expect(api.CAL_HYPO_CONTRACT.product).toEqual({
      calciumHypochloriteFraction: 0.68,
      availableChlorineFraction: 0.65,
    });
  });

  test("defines the FRA stock presets and injector ranges", () => {
    expect(api.CAL_HYPO_CONTRACT.stockPresets.mz3000.gramsPerUsGallon).toBe(11);
    expect(api.CAL_HYPO_CONTRACT.stockPresets.mz2.gramsPerUsGallon).toBe(3);
    expect(api.CAL_HYPO_CONTRACT.stockPresets.mz3000.label).toBe("11 g/gal · 0.03–0.3% injection range");
    expect(api.CAL_HYPO_CONTRACT.stockPresets.mz2.label).toBe("3 g/gal · 0.2–2% injection range");
    expect(api.CAL_HYPO_CONTRACT.injectors.mz3000).toMatchObject({ minPercent: 0.03, maxPercent: 0.3 });
    expect(api.CAL_HYPO_CONTRACT.injectors.mz2).toMatchObject({ minPercent: 0.2, maxPercent: 2 });
  });

  test("converts 11 g/gal to the equivalent metric stock rate", () => {
    const result = expectValid(api.stockRateToGPerLiter(11, "g-per-us-gal"));
    expect(result.gramsPerLiter).toBeCloseTo(2.905892576, 9);
    const metric = expectValid(api.stockRateToGPerLiter(result.gramsPerLiter, "g-per-l"));
    expect(metric.gramsPerLiter).toBeCloseTo(result.gramsPerLiter, 12);
  });

  test("calculates the standard MZ3000 usage rate at 2 ppm", () => {
    const result = expectValid(api.calculateStockUsage({
      stockRate: 11,
      stockRateUnit: "g-per-us-gal",
      targetPpm: 2,
      treatedVolume: 100,
      treatedVolumeUnit: "us-gal",
    }));
    expect(result.stockAvailableChlorineMgL).toBeCloseTo(1888.830174, 6);
    expect(result.millilitersPerUsGallon).toBeCloseTo(4.008208, 6);
    expect(result.injectionPercent).toBeCloseTo(0.105886, 6);
    expect(result.totalStockMilliliters).toBeCloseTo(400.820766, 6);
  });

  test("calculates the 3 g/gal MZ2 reference rate at 2 ppm", () => {
    const result = expectValid(api.calculateStockUsage({
      stockRate: 3,
      stockRateUnit: "g-per-us-gal",
      targetPpm: 2,
      treatedVolume: 100,
      treatedVolumeUnit: "us-gal",
    }));
    expect(result.millilitersPerUsGallon).toBeCloseTo(14.69676141, 8);
    expect(result.injectionPercent).toBeCloseTo(0.388247362, 8);
  });

  test("US and metric stock calculations preserve the same physical result", () => {
    const us = expectValid(api.calculateStockUsage({ stockRate: 11, stockRateUnit: "g-per-us-gal", targetPpm: 2, treatedVolume: 100, treatedVolumeUnit: "us-gal" }));
    const metric = expectValid(api.calculateStockUsage({ stockRate: 11 / 3.785411784, stockRateUnit: "g-per-l", targetPpm: 2, treatedVolume: 378.5411784, treatedVolumeUnit: "l" }));
    expect(metric.totalStockMilliliters).toBeCloseTo(us.totalStockMilliliters, 8);
    expect(metric.injectionPercent).toBeCloseTo(us.injectionPercent, 10);
  });

  test("stock preparation is based directly on grams per volume", () => {
    const us = expectValid(api.calculateStockPreparation({ stockRate: 11, stockRateUnit: "g-per-us-gal", finalStockVolume: 5, stockVolumeUnit: "us-gal" }));
    expect(us.productMassGrams).toBeCloseTo(55, 10);
    const metric = expectValid(api.calculateStockPreparation({ stockRate: 2.905889, stockRateUnit: "g-per-l", finalStockVolume: 5, stockVolumeUnit: "l" }));
    expect(metric.productMassGrams).toBeCloseTo(14.529445, 6);
  });

  test("keeps normal stock preparation volumes between 5 and 50 gallons", () => {
    expect(api.stockPreparationVolume(5, "us-gal").valid).toBe(true);
    expect(api.stockPreparationVolume(50, "us-gal").valid).toBe(true);
    expect(api.stockPreparationVolume(4.99, "us-gal")).toMatchObject({ valid: false, code: "stock-preparation-range" });
    expect(api.stockPreparationVolume(50.01, "us-gal")).toMatchObject({ valid: false, code: "stock-preparation-range" });
    expect(api.stockPreparationVolume(18.92705892, "l").valid).toBe(true);
  });

  test("direct powder retains the independent 100 gal / 2 ppm vector", () => {
    const result = expectValid(api.calculateDirectPowder({ treatedVolume: 100, treatedVolumeUnit: "us-gal", targetPpm: 2 }));
    expect(result.productMassGrams).toBeCloseTo(1.164742087, 9);
    expect(api.formatMass(result.productMassGrams).text).toBe("1.16 g");
  });

  test("retains the low-level prepared-stock calculation", () => {
    const strength = expectValid(api.calculateStockStrengthFromDrytec({ productMass: 11, productMassUnit: "g", stockVolume: 1, stockVolumeUnit: "us-gal" }));
    const result = expectValid(api.calculateDoseFromStock({ stockAvailableChlorine: strength.stockAvailableChlorineMgL, stockStrengthUnit: "mg-l", treatedVolume: 50, treatedVolumeUnit: "us-gal", targetPpm: 2 }));
    expect(result.stockVolumeMilliliters).toBeCloseTo(200.410383, 6);
  });

  test("validates injector settings against the selected equipment", () => {
    const stock = expectValid(api.calculateStockStrengthFromDrytec({ productMass: 11, productMassUnit: "g", stockVolume: 1, stockVolumeUnit: "us-gal" }));
    expect(api.calculateInjectorOutput({ stockAvailableChlorine: stock.stockAvailableChlorineMgL, stockStrengthUnit: "mg-l", injectionSetting: 0.1, injectionSettingUnit: "percent", preset: "mz3000" }).valid).toBe(true);
    expect(api.calculateInjectorOutput({ stockAvailableChlorine: stock.stockAvailableChlorineMgL, stockStrengthUnit: "mg-l", injectionSetting: 0.5, injectionSettingUnit: "percent", preset: "mz3000" })).toMatchObject({ valid: false, code: "equipment-range" });
  });

  test("rejects blank, zero, negative, non-finite, and unsupported stock rates", () => {
    for (const value of ["", 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(api.stockRateToGPerLiter(value, "g-per-us-gal").valid).toBe(false);
    }
    expect(api.stockRateToGPerLiter(11, "lb-per-gal")).toMatchObject({ valid: false, code: "unsupported-unit" });
  });

  test("builds stock quick-reference rows with the same calculation", () => {
    const rows = api.buildQuickReferenceRows({ mode: "stock-solution", stockRate: 11, stockRateUnit: "g-per-us-gal", targetPpm: 2, volumes: [1, 50, 100], volumeUnit: "us-gal" });
    expect(rows).toHaveLength(3);
    expect(expectValid(rows[0]).millilitersPerUsGallon).toBeCloseTo(4.008208, 6);
    expect(expectValid(rows[2]).totalStockMilliliters).toBeCloseTo(400.820766, 6);
  });

  test("builds the direct-dose reference table from the shared powder calculation", () => {
    const rows = api.buildDirectDoseReferenceRows("us");
    expect(rows.map(row => row.ppm)).toEqual([0.5, 1, 2, 3, 5, 10, 8, 15, 20]);
    const twoPpm = expectValid(rows.find(row => row.ppm === 2)!.calculation);
    const eightPpm = expectValid(rows.find(row => row.ppm === 8)!.calculation);
    const fifteenPpm = expectValid(rows.find(row => row.ppm === 15)!.calculation);
    expect(twoPpm.productMassGrams).toBeCloseTo(1.164742087, 9);
    expect(eightPpm.productMassGrams).toBeCloseTo(4.658968349, 8);
    expect(fifteenPpm.productMassGrams).toBeCloseTo(8.735565656, 8);
  });

  test("converts the direct-dose reference table to a 1,000 liter basis", () => {
    const rows = api.buildDirectDoseReferenceRows("metric");
    const twoPpm = expectValid(rows.find(row => row.ppm === 2)!.calculation);
    expect(twoPpm.productMassGrams).toBeCloseTo(3.076923077, 9);
  });

  test("formats practical liquid volumes", () => {
    expect(api.formatLiquidVolume(400.820766)).toBe("400.82 mL");
    expect(api.formatLiquidVolume(1400)).toBe("1.4 L");
    expect(api.formatLiquidVolume(0.001)).toBe("<0.01 mL");
    expect(api.formatMilliliters(1400)).toBe("1,400 mL");
  });
});

describe("sales-team workflow", () => {
  test("starts on the 11 g/gal MZ3000 stock workflow with useful defaults", () => {
    const state = api.CAL_HYPO_UI.createState();
    expect(state.mode).toBe("stock-solution");
    expect(state.values["stock-solution"]).toMatchObject({ preset: "mz3000", stockRate: 11, prepVolume: 5, targetPpm: 2, treatedVolume: 100, outputUnit: "volume-rate" });
    const view = api.CAL_HYPO_UI.evaluate(state);
    expect(view.stock.valid).toBe(true);
    expect(view.stock.millilitersPerUsGallon).toBeCloseTo(4.008208, 6);
    expect(view.equipmentStatus).toMatchObject({ within: true });
  });

  test("selecting MZ2 fills the 3 g/gal rate", () => {
    const state = api.CAL_HYPO_UI.selectStockPreset(api.CAL_HYPO_UI.createState(), "mz2");
    expect(state.values["stock-solution"]).toMatchObject({ preset: "mz2", stockRate: 3 });
    expect(api.CAL_HYPO_UI.evaluate(state).equipmentStatus).toMatchObject({ within: true });
  });

  test("editing the stock rate automatically selects Custom", () => {
    const state = api.CAL_HYPO_UI.setField(api.CAL_HYPO_UI.createState(), "stock-solution", "stockRate", 8.5);
    expect(state.values["stock-solution"]).toMatchObject({ preset: "custom", stockRate: 8.5 });
    expect(api.CAL_HYPO_UI.evaluate(state).equipmentStatus).toBeNull();
  });

  test("metric mode converts the stock rate and volumes without changing the dose", () => {
    const us = api.CAL_HYPO_UI.createState();
    const metric = api.CAL_HYPO_UI.changeUnitSystem(us, "metric");
    expect(metric.values["stock-solution"].stockRate).toBeCloseTo(2.905892576, 9);
    expect(metric.values["stock-solution"].stockRateUnit).toBe("g-per-l");
    expect(metric.values["stock-solution"].treatedVolume).toBeCloseTo(378.5411784, 7);
    const usView = api.CAL_HYPO_UI.evaluate(us);
    const metricView = api.CAL_HYPO_UI.evaluate(metric);
    expect(metricView.stock.totalStockMilliliters).toBeCloseTo(usView.stock.totalStockMilliliters, 7);
  });

  test("switching a custom rate to metric and back preserves it", () => {
    let state = api.CAL_HYPO_UI.setField(api.CAL_HYPO_UI.createState(), "stock-solution", "stockRate", 8.5);
    state = api.CAL_HYPO_UI.changeUnitSystem(state, "metric");
    expect(state.values["stock-solution"].stockRate).toBeCloseTo(2.245462445, 9);
    state = api.CAL_HYPO_UI.changeUnitSystem(state, "us");
    expect(state.values["stock-solution"].stockRate).toBeCloseTo(8.5, 8);
    expect(state.values["stock-solution"].preset).toBe("custom");
  });

  test("limits the primary navigation to stock solution and direct powder", () => {
    expect(api.CAL_HYPO_UI.modes.map(mode => mode.id)).toEqual(["stock-solution", "direct-powder"]);
    expect(calculator).not.toContain("Make stock</button>");
    expect(calculator).not.toContain("Dose stock</button>");
    expect(calculator).not.toContain("Injector / skid</button>");
  });

  test("separates stock preparation from stock usage", () => {
    expect(calculator).toContain("Mix the stock solution");
    expect(calculator).toContain("Determine how much stock to use");
    expect(calculator).toContain("Total DryTec required");
    expect(calculator).toContain("Total stock for 100 US gal");
    expect(calculator).toContain("Injection percent");
    expect(calculator).toContain("11 g/gal · 0.03–0.3% injection range");
    expect(calculator).toContain("3 g/gal · 0.2–2% injection range");
  });

  test("includes the direct-dose quick table and elevated-rate caution", () => {
    expect(calculator).toContain("Direct-dose quick table");
    expect(calculator).toContain("DryTec / 100 US gal");
    expect(calculator).toContain('label: "Continuous use"');
    expect(calculator).toContain('label: "Elevated applied dose"');
    expect(calculator).toContain('label: "Cleaning protocols"');
    expect(calculator).toContain("Elevated cleaning references are not continuous-use plant targets");
    expect(calculator).toContain("Fusarium cleaning reference");
  });

  test("keeps elevated applied doses together before cleaning protocols", () => {
    expect(api.buildDirectDoseReferenceRows("us").map(row => row.ppm)).toEqual([0.5, 1, 2, 3, 5, 10, 8, 15, 20]);
  });

  test("rounds generated unit-conversion values for editable fields", () => {
    expect(api.editableFieldValue(2.9058925759)).toBe(2.91);
    expect(api.editableFieldValue(18.92705892)).toBe(18.93);
    expect(api.editableFieldValue(378.5411784)).toBe(378.54);
    expect(api.editableFieldValue("2.905")).toBe("2.905");
  });

  test("classifies measured residuals against the current FRA range", () => {
    expect(api.CAL_HYPO_UI.compareResidual(0.4).status).toBe("below");
    expect(api.CAL_HYPO_UI.compareResidual(0.5).status).toBe("within");
    expect(api.CAL_HYPO_UI.compareResidual(2).status).toBe("within");
    expect(api.CAL_HYPO_UI.compareResidual(2.1).status).toBe("above");
    expect(api.CAL_HYPO_UI.compareResidual("bad").status).toBe("invalid");
  });

  test("keeps the internal page unlisted and states the theoretical-dose distinction", () => {
    expect(calculator).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(calculator).toContain("Calculated chlorine values are theoretical applied doses");
    expect(calculator).toContain("0.5–2 ppm");
  });

  test("does not expose available-chlorine chemistry as a sales-team input", () => {
    expect(calculator).not.toContain('id="make-strength"');
    expect(calculator).not.toContain('id="dose-strength"');
    expect(calculator).not.toContain('id="injector-strength"');
    expect(calculator).not.toContain("Stock described as");
  });
});
