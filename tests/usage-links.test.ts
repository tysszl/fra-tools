// Usage Estimator: links from the previous page keep their inputs on the per-column model.
import { describe, expect, test } from "bun:test";
import { DATA, usageEstimate } from "../src/engine/index.js";
import { applyLegacyParams } from "../src/pages/usage.js";

const D = DATA.usage.defaults;
function fresh() {
  return {
    ec: { ...DATA.ecPresets.high }, preset: "high", flowerWeeks: { ...D.flowerWeeks },
    phoszyme: false, phUp: true, si: false, triologic: false,
  };
}

describe("legacy usage links", () => {
  test("old link keeps ECs, total gallons and additives", () => {
    const params = new URLSearchParams("b=fra&ve=2&vw=2&vg=1000&fe=2&fw=4&fg=10000&ai=1111&tvg=100&tfg=500");
    const s = fresh();
    applyLegacyParams(params, s);
    expect(s.ec).toEqual({ Veg: 2, Stretch: 2, Stack: 2, Swell: 2, Ripen: 2 });
    expect(s.preset).toBe("custom");
    expect(Object.values(s.flowerWeeks).reduce((a, b) => a + b, 0)).toBe(4);
    expect([s.phoszyme, s.phUp, s.si, s.triologic]).toEqual([true, true, true, true]);
    const est = usageEstimate({
      lineId: "3part", schedule: "commercial", ec: s.ec, vegWeeks: 2, vegGalPerWeek: 1000,
      flowerWeeks: s.flowerWeeks, flowerGalPerWeek: 10000, phoszyme: s.phoszyme, phUp: s.phUp, alkPpm: 0,
      triologic: s.triologic, triologicVegGalPerWeek: 100, triologicFlowerGalPerWeek: 500, si: s.si, siFoliarGal: 0, siMlPerGal: 2,
    });
    expect(est.totalGal).toBe(42000);
  });

  test("fractional flower weeks keep their total; no ai means no additives", () => {
    const s = fresh();
    applyLegacyParams(new URLSearchParams("ve=3&fe=3.5&fw=8.5"), s);
    expect(Math.round(Object.values(s.flowerWeeks).reduce((a, b) => a + b, 0) * 10) / 10).toBe(8.5);
    expect([s.phoszyme, s.phUp, s.si, s.triologic]).toEqual([false, false, false, false]);
  });

  test("new links are untouched", () => {
    const s = fresh();
    applyLegacyParams(new URLSearchParams("vw=2&w0=3"), s);
    expect(s).toEqual(fresh());
  });
});
