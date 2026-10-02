// Usage Estimator quick mode and the sealed price list.
import { describe, expect, test } from "bun:test";
import { DATA, quickUsageInput, quickVolumes, usageEstimate } from "../src/engine/index.js";
import { applyTier, initialState, quickToAdvanced, stateParams, usageInput } from "../src/pages/usage.js";
import { loadPriceList, openPrices, sealPrices, tierPrices } from "../src/pages/usage-prices.js";
import { assumptions } from "../src/pages/usage-print.js";

const TEST_CODE = "test-code-not-real";
const LIST = {
  tiers: [
    { id: "commercial", label: "Commercial", line: "3part", additives: "commercial", prices: { "Part A": 11, "Part B": 12, Bloom: 13 } },
    { id: "wholesale", label: "Wholesale", line: "3part", additives: "wholesale", prices: { "Part A": 9, "Part B": 9, Bloom: 9 } },
    { id: "cplus-mixed", label: "Mixed", line: "cplus", additives: "commercial", prices: { CaNO3: 1, "C+": 2, MKP: 3 } },
  ],
  additiveTiers: [
    { id: "commercial", label: "Commercial", prices: { PhosZyme: 20, Si: 21, Triologic: 22 } },
    { id: "wholesale", label: "Wholesale", prices: { PhosZyme: 10, Si: 11, Triologic: 12 } },
  ],
};
const total = (est: any) => est.products.map((p: any) => p.amount);

describe("quick mode engine", () => {
  test("10,000 ft²: 5,000 flowering plants, ~18,492 gal/week flower, ~2,543 gal/week veg", () => {
    const v = quickVolumes(10000);
    expect(v.flowerPlants).toBe(5000);
    expect(v.vegPlants).toBeCloseTo(5500, 6);
    expect(Math.abs(v.flowerGalPerWeek - 18492)).toBeLessThan(5);
    expect(Math.abs(v.vegGalPerWeek - 2543)).toBeLessThan(1);
  });

  test("fixed assumptions: 9 flower weeks, 2 veg weeks, high commercial chart, pH Up at 10 ppm", () => {
    const q = quickUsageInput({ lineId: "3part", canopyFt2: 10000 });
    expect(Object.values(q.flowerWeeks).reduce((a, b) => a + b, 0)).toBe(9);
    expect(q.vegWeeks).toBe(2);
    expect(q.ec).toEqual({ ...DATA.ecPresets.high });
    expect(q.schedule).toBe("commercial");
    expect([q.phUp, q.alkPpm]).toEqual([true, 10]);
    expect([q.phoszyme, q.triologic, q.si]).toEqual([false, false, false]);
    expect(usageEstimate(q).totalGal).toBeCloseTo(9 * quickVolumes(10000).flowerGalPerWeek + 2 * quickVolumes(10000).vegGalPerWeek, 6);
  });
});

describe("quick mode page state", () => {
  test("a bare link opens Quick; a pre-Quick full-calculator link opens Advanced", () => {
    expect(initialState(new URLSearchParams(""), "k").mode).toBe("quick");
    expect(initialState(new URLSearchParams("vg=1000&fg=10000"), "k").mode).toBe("advanced");
    expect(initialState(new URLSearchParams("b=fra&ve=2&fe=2&fw=4"), "k").mode).toBe("advanced");
  });

  test("share links round-trip quick mode", () => {
    const s = initialState(new URLSearchParams(""), "k");
    Object.assign(s, { line: "cplus", canopy: 24000, cycles: 4, phoszyme: true, si: true, tier: "cplus-mixed", facility: "Green Valley", showPrices: true });
    const params = stateParams(s);
    expect(params.get("m")).toBe("q");
    expect(params.has("vg")).toBe(false);
    const back = initialState(params, "k");
    for (const k of ["mode", "line", "canopy", "cycles", "phoszyme", "triologic", "si", "tier", "facility", "showPrices"] as const) expect(back[k]).toEqual(s[k]);
    expect(total(usageEstimate(usageInput(back)))).toEqual(total(usageEstimate(usageInput(s))));
  });

  test("Advanced opens with the quick inputs carried over, on the same estimate", () => {
    const s = initialState(new URLSearchParams("ft=10000&phz=1&tri=1&si=1&cy=6"), "k");
    const quickEst = usageEstimate(usageInput(s));
    quickToAdvanced(s);
    expect(s.mode).toBe("advanced");
    expect(s.cycles).toBe(6);
    expect(s.preset).toBe("high");
    expect(s.alk).toBe(10);
    expect([s.phoszyme, s.phUp, s.triologic, s.si]).toEqual([true, true, true, true]);
    expect(s.flowerGalPerWeek).toBeCloseTo(quickVolumes(10000).flowerGalPerWeek, 6);
    expect(s.triFlower).toBeGreaterThan(0);
    expect(s.siGal).toBeGreaterThan(0);
    const advEst = usageEstimate(usageInput(s));
    expect(advEst.totalGal).toBeCloseTo(quickEst.totalGal, 6);
    expect(total(advEst)).toEqual(total(quickEst));
    // The Advanced share link reopens Advanced with the carried inputs (to 0.1 gal).
    const back = initialState(stateParams(s), "k");
    expect(back.mode).toBe("advanced");
    expect(back.flowerGalPerWeek).toBeCloseTo(s.flowerGalPerWeek, 1);
  });

  test("quick assumptions name the canopy, plant counts and fixed volumes", () => {
    const a = assumptions({
      metric: false, lineLabel: "3-Part", strengthPhrase: "high strength", scheduleLabel: "Commercial (Stack → Swell)",
      est: usageEstimate(quickUsageInput({ lineId: "3part", canopyFt2: 10000 })), purchase: { cyclesPerYear: 5 },
      quick: { canopyFt2: 10000, ...quickVolumes(10000) },
      inputs: { vegWeeks: 2, vegGalPerWeek: 2543, flowerGalPerWeek: 18494, phoszyme: false, phUp: true, alk: 10, triologic: false, triVeg: 0, triFlower: 0, si: false, siGal: 0, siRate: 2 },
    } as any).join(" ");
    expect(a).toContain("10,000 ft²");
    expect(a).toContain("one plant per 2 ft² (5,000 plants), each fed 2 L per day");
    expect(a).toContain("10% more plants than flower (5,500");
    expect(a).toContain("Mother plants are not included");
    expect(a).toContain("10 ppm alkalinity");
    expect(a).toContain("9 weeks of flower");
  });
});

describe("sealed price list", () => {
  test("round trip with the code; PBKDF2 at 200k+ iterations with a random salt", async () => {
    const sealed = await sealPrices(LIST, TEST_CODE);
    expect(sealed.iterations).toBeGreaterThanOrEqual(200000);
    expect(JSON.stringify(sealed)).not.toContain("Commercial");
    expect(await openPrices(sealed, `  ${TEST_CODE.toUpperCase()} `)).toEqual(LIST);
    const again = await sealPrices(LIST, TEST_CODE);
    expect(again.salt).not.toBe(sealed.salt);
  });

  test("the page preloads the default tier: Commercial for 3-Part, Mixed for C+", async () => {
    const sealed = await sealPrices(LIST, TEST_CODE);
    const list = await loadPriceList(TEST_CODE, async () => ({ ok: true, json: async () => sealed }));
    expect(list.tiers.length).toBe(3);
    const s = initialState(new URLSearchParams("phz=1"), TEST_CODE);
    s.list = list;
    applyTier(s);
    expect([s.tier, s.addTier]).toEqual(["commercial", "commercial"]);
    expect(s.prices).toMatchObject({ "Part A": 11, Bloom: 13, PhosZyme: 20, Triologic: 22 });
    expect(s.prices["pH Up"] ?? null).toBeNull();
    s.tier = "wholesale";
    applyTier(s, true);
    expect(s.prices).toMatchObject({ "Part A": 9, PhosZyme: 10 });
    s.line = "cplus";
    applyTier(s);
    expect(s.tier).toBe("cplus-mixed");
    expect(s.prices).toMatchObject({ CaNO3: 1, "C+": 2, MKP: 3 });
    expect(tierPrices(list, "nope", "commercial", ["Part A"])).toBeNull();
  });

  test("a wrong code opens nothing and the page keeps blank typed prices", async () => {
    const sealed = await sealPrices(LIST, TEST_CODE);
    expect(await openPrices(sealed, "wrong-code")).toBeNull();
    const list = await loadPriceList("wrong-code", async () => ({ ok: true, json: async () => sealed }));
    expect(list).toEqual({ tiers: [], additiveTiers: [] });
    expect(await loadPriceList(TEST_CODE, async () => ({ ok: false, json: async () => ({}) }))).toEqual({ tiers: [], additiveTiers: [] });
    const s = initialState(new URLSearchParams(""), "wrong-code");
    s.list = list;
    applyTier(s);
    expect(s.prices).toEqual({});
    expect(s.tier).toBe("");
  });
});
