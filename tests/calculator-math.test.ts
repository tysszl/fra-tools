import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const costCalculator = readFileSync(new URL("../cost-calc.html", import.meta.url), "utf8");
const usageCalculator = readFileSync(new URL("../usage-calc.html", import.meta.url), "utf8");

function getCalculatorScript(html: string) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("Calculator is missing its inline script");
  return script.replace(/\/\/ ═+\n\/\/ INIT[\s\S]*$/, "");
}

function createRuntime<T>(html: string, exportsExpression: string, search = "") {
  let replacedUrl = "";
  const elements = new Map<string, Record<string, unknown>>();
  const documentStub = {
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, { value: "", className: "", textContent: "", innerHTML: "" });
      return elements.get(id);
    },
    querySelectorAll() { return []; },
  };
  const windowStub = { location: { search } };
  const historyStub = {
    replaceState(_state: unknown, _title: string, url: string) { replacedUrl = url; },
  };
  const localStorageStub = { getItem() { return null; }, setItem() {} };
  const factory = new Function(
    "window",
    "history",
    "document",
    "localStorage",
    "navigator",
    `${getCalculatorScript(html)}\nreturn (${exportsExpression});`,
  ) as (...args: unknown[]) => T;

  return {
    api: factory(windowStub, historyStub, documentStub, localStorageStub, {}),
    getReplacedUrl: () => replacedUrl,
  };
}

function createCostRuntime() {
  return createRuntime<{
    MASTER_RECIPES: Array<{ name: string; products: Array<{ name: string; usage: number }> }>;
    calcRecipe: (recipe: unknown) => { rawCost: number };
  }>(costCalculator, "{ MASTER_RECIPES, calcRecipe }");
}

function createUsageRuntime(search = "") {
  return createRuntime<{
    BASE_CONFIG: Record<string, any>;
    state: Record<string, any>;
    getBaseFertilizerEC: (feedEC: number) => number;
    calcProductAmount: (name: string, phase: string, volume: number, feedEC: number) => number;
    parseNonNegative: (value: unknown, fallback?: number) => number;
    updateURL: () => void;
    loadFromURL: () => void;
  }>(usageCalculator, "{ BASE_CONFIG, state, getBaseFertilizerEC, calcProductAmount, parseNonNegative, updateURL, loadFromURL }", search);
}

describe("FRA Swell recipe math", () => {
  test("the cost calculator executes the canonical EC 3.0 Swell doses", () => {
    const { api } = createCostRuntime();
    const fra = api.MASTER_RECIPES.find(recipe => recipe.name === "Front Row Ag · Swell");
    expect(fra).toBeDefined();

    const doses = Object.fromEntries(fra!.products.map(product => [product.name, product.usage]));
    expect(doses["Part A"]).toBeCloseTo(4.323529, 6);
    expect(doses["Part B"]).toBeCloseTo(2.752941, 6);
    expect(doses.Bloom).toBeCloseTo(4.875, 6);
    expect(api.calcRecipe(fra).rawCost).toBeCloseTo(0.10295, 5);
  });

  test("the usage calculator executes current 3-Part potency and recipes", () => {
    const { api } = createUsageRuntime();
    const fra = api.BASE_CONFIG.fra;
    expect(fra.ecPerGram["Part A"]).toBe(0.306);
    expect(fra.recipes.Veg).toEqual({ "Part A": 0.6428571428571, "Part B": 0.3571428571429, Bloom: 0 });
    expect(fra.recipes.Stack).toEqual({ "Part A": 0.5021882, "Part B": 0.2789934, Bloom: 0.2188184 });
    expect(fra.flowerRecipe).toBe("Swell");

    expect(api.calcProductAmount("Part A", "flower", 1, 3) * 454).toBeCloseTo(4.323529, 6);
    expect(api.calcProductAmount("Part B", "flower", 1, 3) * 454).toBeCloseTo(2.752941, 6);
    expect(api.calcProductAmount("Bloom", "flower", 1, 3) * 454).toBeCloseTo(4.875, 6);
  });
});

describe("additive handling", () => {
  test("PhosZyme reduces the production base-fertilizer target by 0.088 EC", () => {
    const { api } = createUsageRuntime();
    expect(api.getBaseFertilizerEC(3)).toBe(3);

    api.state.products.find((product: any) => product.name === "PhosZyme").included = true;
    expect(api.getBaseFertilizerEC(3)).toBeCloseTo(2.912, 8);
    expect(api.calcProductAmount("Part A", "flower", 1, 3) * 454)
      .toBeCloseTo(2.912 * 0.441 / 0.306, 8);
  });

  test("Triologic uses explicit nonnegative weekly treated volume at 1 mL/gal", () => {
    const { api } = createUsageRuntime();
    api.state.veg.triologicGalPerWeek = 100;
    api.state.flower.triologicGalPerWeek = 500;

    expect(api.calcProductAmount("Triologic", "veg", 2000, 3)).toBeCloseTo(200 / 3785, 8);
    expect(api.calcProductAmount("Triologic", "flower", 90000, 3)).toBeCloseTo(4500 / 3785, 8);
    expect(api.parseNonNegative("-25")).toBe(0);
    expect(api.parseNonNegative("not-a-number")).toBe(0);
  });

  test("share URLs round-trip all additive and Triologic state", () => {
    const current = createUsageRuntime();
    current.api.state.products.filter((product: any) => !product.isBase)
      .forEach((product: any) => { product.included = true; });
    current.api.state.veg.triologicGalPerWeek = 100;
    current.api.state.flower.triologicGalPerWeek = 500;
    current.api.updateURL();

    const url = current.getReplacedUrl();
    expect(url).toContain("ai=1111");
    expect(url).toContain("tvg=100");
    expect(url).toContain("tfg=500");

    const restored = createUsageRuntime(url);
    restored.api.loadFromURL();
    expect(restored.api.state.products.filter((product: any) => !product.isBase)
      .every((product: any) => product.included)).toBe(true);
    expect(restored.api.state.veg.triologicGalPerWeek).toBe(100);
    expect(restored.api.state.flower.triologicGalPerWeek).toBe(500);
  });

  test("negative Triologic values from URLs clamp to zero", () => {
    const { api } = createUsageRuntime("?ve=3&tvg=-100&tfg=-500");
    api.loadFromURL();
    expect(api.state.veg.triologicGalPerWeek).toBe(0);
    expect(api.state.flower.triologicGalPerWeek).toBe(0);
  });
});
