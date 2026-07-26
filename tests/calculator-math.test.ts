import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const costCalculator = readFileSync(new URL("../cost-calc.html", import.meta.url), "utf8");
const usageCalculator = readFileSync(new URL("../usage-calc.html", import.meta.url), "utf8");
const feedCalculator = readFileSync(new URL("../feed-calc.html", import.meta.url), "utf8");
const toolsIndex = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const cplusCalculator = readFileSync(new URL("../cplus-calc.html", import.meta.url), "utf8");
const nutritionCoreSource = readFileSync(new URL("../src/nutrition-core.js", import.meta.url), "utf8").trimEnd();
const nutritionCore = new Function(`${nutritionCoreSource}\nreturn FRA_NUTRITION_CORE;`)() as any;

const GENERATED_START = "// BEGIN GENERATED: nutrition-core";
const GENERATED_END = "// END GENERATED: nutrition-core";

describe("public calculator navigation", () => {
  test("lists the calcium hypochlorite calculator", () => {
    expect(toolsIndex).toContain('href="cal-hypo/"');
    expect(toolsIndex).toContain("Calcium Hypochlorite Calculator");
  });

  test("brands the feed calculator and collapses customization by default", () => {
    expect(feedCalculator).toContain('src="assets/feed-chart/logo-dark.png"');
    expect(feedCalculator).toContain("Customize your feed chart");
    expect(feedCalculator).toContain('id="configuration-body" hidden');
    expect(feedCalculator).toContain('aria-expanded="false"');
  });
});

function getEmbeddedCore(html: string) {
  const pattern = new RegExp(`${GENERATED_START}\\n([\\s\\S]*?)\\n${GENERATED_END}`);
  const match = html.match(pattern);
  if (!match) throw new Error("Calculator is missing its generated nutrition core");
  return match[1];
}

function stripEmbeddedCore(html: string) {
  const start = html.indexOf(GENERATED_START);
  const end = html.indexOf(GENERATED_END, start) + GENERATED_END.length;
  return `${html.slice(0, start)}${html.slice(end)}`;
}

function getCalculatorScript(html: string, includeInit = false) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("Calculator is missing its inline script");
  return includeInit ? script : script.replace(/\/\/ ═+\n\/\/ INIT[\s\S]*$/, "");
}

function createClassList() {
  const classes = new Set<string>();
  return {
    add(...names: string[]) { names.forEach(name => classes.add(name)); },
    remove(...names: string[]) { names.forEach(name => classes.delete(name)); },
    contains(name: string) { return classes.has(name); },
    toggle(name: string, force?: boolean) {
      const enabled = force === undefined ? !classes.has(name) : force;
      if (enabled) classes.add(name); else classes.delete(name);
      return enabled;
    },
  };
}

function createElementStub(id = "") {
  const element: Record<string, any> = {
    id,
    value: "",
    className: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    style: {},
    dataset: {},
    classList: createClassList(),
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    appendChild() {},
    removeChild() {},
    focus() {},
    select() {},
    remove() {},
  };
  return element;
}

function createRuntime<T>(html: string, exportsExpression: string, search = "", includeInit = false) {
  let replacedUrl = "";
  const windowListeners = new Map<string, Array<() => void>>();
  const printSnapshots: string[] = [];
  const elements = new Map<string, Record<string, any>>();
  const body = createElementStub("body");
  const documentStub = {
    body,
    title: "",
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, createElementStub(id));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement(tag: string) { return createElementStub(tag); },
    execCommand() { return true; },
  };
  const windowStub = {
    location: { search, pathname: "/", href: `https://tools.frontrowag.com/${search}` },
    isSecureContext: false,
    print() { printSnapshots.push(documentStub.getElementById("branded-print").innerHTML); },
    addEventListener(type: string, listener: () => void) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
  };
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
    `${getCalculatorScript(html, includeInit)}\nreturn (${exportsExpression});`,
  ) as (...args: unknown[]) => T;

  return {
    api: factory(windowStub, historyStub, documentStub, localStorageStub, {}),
    getReplacedUrl: () => replacedUrl,
    getElement: (id: string) => documentStub.getElementById(id),
    dispatchWindowEvent: (type: string) => windowListeners.get(type)?.forEach(listener => listener()),
    getPrintSnapshots: () => printSnapshots,
  };
}

function createCostRuntime() {
  return createRuntime<{
    MASTER_RECIPES: Array<{ name: string; products: Array<{ name: string; usage: number }> }>;
    calcRecipe: (recipe: unknown) => { rawCost: number };
    getFRASwellDose: (lineId: string, productName: string) => number;
    FRA_NUTRITION_CORE: any;
  }>(costCalculator, "{ MASTER_RECIPES, calcRecipe, getFRASwellDose, FRA_NUTRITION_CORE }");
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
    FRA_NUTRITION_CORE: any;
  }>(usageCalculator, "{ BASE_CONFIG, state, getBaseFertilizerEC, calcProductAmount, parseNonNegative, updateURL, loadFromURL, FRA_NUTRITION_CORE }", search);
}

function createFeedRuntime(html: string) {
  return createRuntime<{
    state: Record<string, any>;
    getPhzAdjustedTargetEC: (phase: string, targetEC: number) => number;
    getPhzAdjustment: (phase: string, targetEC: number) => { achievable: boolean; minimumFinalEc: number };
    calcPhoszymeDosage: (phase: string, method: string, unit: string, targetEC: number) => { dosage: number; ec: number };
    calcDosage: (phase: string, role: string, method: string, unit: string, targetEC: number) => { dosage: number; ec: number };
    LINES: Record<string, any>;
    CORE_LINE: any;
    handleApplicationChange: (application: string) => void;
    render: () => void;
    renderBrandedPrint: () => void;
    printPage: () => void;
    formatTargetEC: (value: number) => string;
    FRA_NUTRITION_CORE: any;
  }>(html, "{ state, getPhzAdjustedTargetEC, getPhzAdjustment, calcPhoszymeDosage, calcDosage, LINES, CORE_LINE, handleApplicationChange, render, renderBrandedPrint, printPage, formatTargetEC, FRA_NUTRITION_CORE }");
}

// feed-calc.html only — the 3-Part page owns the 2-doser tank build, so these names
// don't exist on cplus-calc.html and can't go in the shared factory above.
function createThreePartRuntime() {
  return createRuntime<{
    state: Record<string, any>;
    LINES: Record<string, any>;
    computeFeedRows: () => Array<{ label: string; cells: Array<{ display: string; dosage: number; ec: number } | null> }>;
    calcStockTanks: (method: string, unit: string) => any;
    getTankVolumes: (method: string) => { tankA: number; tankB: number };
    stockConfigLabel: () => string;
    buildSummary: () => { html: string; plain: string };
    calcDosage: (phase: string, role: string, method: string, unit: string, targetEc: number) => { display: string };
    BP_STOCK_NOTES_2DOSER: string[];
  }>(feedCalculator, "{ state, LINES, computeFeedRows, calcStockTanks, getTankVolumes, stockConfigLabel, buildSummary, calcDosage, BP_STOCK_NOTES_2DOSER }");
}

function createCplusFeedRuntime(search = "") {
  return createRuntime<{
    state: Record<string, any>;
    handleStockTankVolumeInput: (value: unknown) => void;
    handleStockTankVolumeChange: (value: unknown) => void;
    calcStockTanks: (method: string, unit: string) => { rows: Array<Record<string, any>> };
    loadFromURL: () => void;
  }>(cplusCalculator, "{ state, handleStockTankVolumeInput, handleStockTankVolumeChange, calcStockTanks, loadFromURL }", search);
}

describe("shared nutrition core contract", () => {
  test("a canonical source and deterministic sync tool exist", () => {
    expect(existsSync(new URL("../src/nutrition-core.js", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../scripts/sync-nutrition-core.ts", import.meta.url))).toBe(true);
  });

  test("every calculator embeds the canonical source byte-for-byte", () => {
    [feedCalculator, cplusCalculator, usageCalculator, costCalculator]
      .forEach(html => expect(getEmbeddedCore(html)).toBe(nutritionCoreSource));
  });

  test.each([
    ["3-Part feed", feedCalculator],
    ["Component Plus feed", cplusCalculator],
    ["usage", usageCalculator],
    ["cost", costCalculator],
  ])("%s calculator completes its full startup path", (_label, html) => {
    expect(() => createRuntime(html, "true", "", true)).not.toThrow();
  });

  test("the canonical values match the FRA standards approval snapshot", () => {
    expect(nutritionCore.fieldUnits).toEqual({
      gramsPerPound: 454,
      millilitersPerGallon: 3785,
      litersPerGallon: 3.785,
    });
    expect(nutritionCore.phoszyme).toEqual({
      ecPerGram: 0.220,
      directGramsPerGallon: 0.4,
      directEc: 0.088,
      stockCarrierRatio: 0.10,
    });
    expect(nutritionCore.lines).toEqual({
      "3part": {
        productsByRole: { partA: "Part A", partB: "Part B", bloom: "Bloom" },
        ecPerGram: { "Part A": 0.306, "Part B": 0.255, Bloom: 0.200 },
        recipes: {
          Veg: { "Part A": 0.6428571428571, "Part B": 0.3571428571429, Bloom: 0 },
          Stretch: { "Part A": 0.55, "Part B": 0.29, Bloom: 0.16 },
          Stack: { "Part A": 0.5021882, "Part B": 0.2789934, Bloom: 0.2188184 },
          Swell: { "Part A": 0.441, "Part B": 0.234, Bloom: 0.325 },
          Ripen: { "Part A": 0.35, "Part B": 0.30, Bloom: 0.35 },
        },
      },
      cplus: {
        productsByRole: { partA: "CaNO3", partB: "C+", bloom: "MKP" },
        ecPerGram: { CaNO3: 0.317, "C+": 0.283, MKP: 0.195 },
        recipes: {
          Veg: { CaNO3: 0.60, "C+": 0.40, MKP: 0 },
          Stack: { CaNO3: 0.496, "C+": 0.32, MKP: 0.184 },
          Swell: { CaNO3: 0.3684, "C+": 0.3294, MKP: 0.3022 },
          Ripen: { CaNO3: 0.315, "C+": 0.30, MKP: 0.385 },
        },
      },
    });
  });

  test("sync write and check modes detect drift and malformed markers", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "fra-nutrition-core-"));
    try {
      mkdirSync(join(tempRoot, "scripts"));
      mkdirSync(join(tempRoot, "src"));
      writeFileSync(join(tempRoot, "scripts", "sync-nutrition-core.ts"), readFileSync(new URL("../scripts/sync-nutrition-core.ts", import.meta.url)));
      writeFileSync(join(tempRoot, "src", "nutrition-core.js"), "const TEST_CORE = 1;\n");
      ["feed-calc.html", "cplus-calc.html", "usage-calc.html", "cost-calc.html"].forEach(fileName => {
        writeFileSync(join(tempRoot, fileName), `<script>\n${GENERATED_START}\nold\n${GENERATED_END}\n</script>\n`);
      });

      const script = join(tempRoot, "scripts", "sync-nutrition-core.ts");
      expect(Bun.spawnSync(["bun", script, "--check"]).exitCode).toBe(1);
      expect(Bun.spawnSync(["bun", script, "--write"]).exitCode).toBe(0);
      expect(Bun.spawnSync(["bun", script, "--check"]).exitCode).toBe(0);
      expect(readFileSync(join(tempRoot, "feed-calc.html"), "utf8")).toContain("const TEST_CORE = 1;");

      writeFileSync(join(tempRoot, "feed-calc.html"), `${GENERATED_START}\nmissing end`);
      expect(Bun.spawnSync(["bun", script, "--check"]).exitCode).not.toBe(0);

      writeFileSync(join(tempRoot, "feed-calc.html"), `${GENERATED_END}\nwrong order\n${GENERATED_START}`);
      expect(Bun.spawnSync(["bun", script, "--check"]).exitCode).not.toBe(0);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("covered math is not reimplemented outside generated blocks", () => {
    const feedSource = stripEmbeddedCore(feedCalculator);
    const cplusSource = stripEmbeddedCore(cplusCalculator);
    const usageSource = stripEmbeddedCore(usageCalculator);
    const costSource = stripEmbeddedCore(costCalculator);

    expect(feedSource).toContain("FRA_NUTRITION_CORE.createFeedMathAdapter");
    expect(cplusSource).toContain("FRA_NUTRITION_CORE.createFeedMathAdapter");
    expect(usageSource).toContain("FRA_NUTRITION_CORE.doseGramsPerGallon");
    expect(costSource).toContain("FRA_NUTRITION_CORE.doseGramsPerGallon");
    [feedSource, cplusSource].forEach(source => expect(source).not.toContain("ecContrib / ecPerG"));
    [feedSource, cplusSource].forEach(source => expect(source).not.toContain("recipe.partB * baseTargetEC"));
    expect(usageSource).not.toContain("pct / config.ecPerGram");
    expect(costSource).not.toContain("FRA_SWELL_RECIPE");
  });

  test.each([
    ["3-Part", feedCalculator],
    ["Component Plus", cplusCalculator],
  ])("%s direct PhosZyme uses the fixed 0.088 EC contribution", (_label, html) => {
    const { api } = createFeedRuntime(html);
    api.state.application = "direct";
    api.state.usePhoszyme = true;

    expect(api.getPhzAdjustedTargetEC("Swell", 3)).toBeCloseTo(2.912, 8);
    expect(api.calcPhoszymeDosage("Swell", api.state.method, "g/gal", 3)).toMatchObject({
      dosage: 0.4,
      ec: 0.088,
    });
    expect(api.calcPhoszymeDosage("Swell", api.state.method, "g/L", 3)).toMatchObject({
      dosage: 0.106,
      ec: 0.088,
    });
  });

  test.each([
    ["3-Part", "3part", feedCalculator],
    ["Component Plus", "cplus", cplusCalculator],
  ])("%s feed calculator resolves every recipe and role through core math", (_label, lineId, html) => {
    const { api } = createFeedRuntime(html);
    const coreLine = nutritionCore.getRoleLine(lineId);
    expect(api.CORE_LINE).toBe(api.FRA_NUTRITION_CORE.getRoleLine(lineId));
    api.state.application = "direct";
    api.state.usePhoszyme = false;
    api.state.doserMode = "3";

    for (const recipeName of coreLine.recipeNames) {
      api.state.phaseRecipe.Swell = recipeName;
      for (const role of Object.keys(coreLine.productsByRole)) {
        const expected = nutritionCore.doseRoleGramsPerGallon(lineId, recipeName, role, 3);
        expect(api.calcDosage("Swell", role, api.state.method, "g/gal", 3).dosage)
          .toBe(Number(expected.toFixed(1)));
      }
    }
  });

  test("usage and cost calculators execute every shared Swell product through core math", () => {
    const usage = createUsageRuntime().api;
    const cost = createCostRuntime().api;
    expect(usage.BASE_CONFIG.fra.recipes).toBe(usage.FRA_NUTRITION_CORE.lines["3part"].recipes);
    expect(usage.BASE_CONFIG.cplus.recipes).toBe(usage.FRA_NUTRITION_CORE.lines.cplus.recipes);

    expect(cost.getFRASwellDose("3part", "Part A"))
      .toBeCloseTo(nutritionCore.doseGramsPerGallon("3part", "Swell", "Part A", 3), 12);
    expect(cost.getFRASwellDose("cplus", "CaNO3"))
      .toBeCloseTo(nutritionCore.doseGramsPerGallon("cplus", "Swell", "CaNO3", 3), 12);

    for (const lineId of ["3part", "cplus"]) {
      const baseKey = lineId === "3part" ? "fra" : "cplus";
      usage.state.base = baseKey;
      for (const productName of Object.keys(nutritionCore.lines[lineId].ecPerGram)) {
        expect(usage.calcProductAmount(productName, "veg", 1, 3) * 454)
          .toBeCloseTo(nutritionCore.doseGramsPerGallon(lineId, "Veg", productName, 3), 12);
        expect(usage.calcProductAmount(productName, "flower", 1, 3) * 454)
          .toBeCloseTo(nutritionCore.doseGramsPerGallon(lineId, "Swell", productName, 3), 12);
      }
    }

    const costRecipes = {
      "3part": cost.MASTER_RECIPES.find(recipe => recipe.name === "Front Row Ag · Swell"),
      cplus: cost.MASTER_RECIPES.find(recipe => recipe.name === "C+ SWELL (Pallet)"),
    };
    const costProductNames = {
      "3part": { "Part A": "Part A", "Part B": "Part B", Bloom: "Bloom" },
      cplus: { Calcium: "CaNO3", "C+": "C+", MKP: "MKP" },
    };
    for (const lineId of ["3part", "cplus"] as const) {
      const recipe = costRecipes[lineId];
      expect(recipe).toBeDefined();
      for (const product of recipe!.products) {
        const coreName = costProductNames[lineId][product.name as keyof typeof costProductNames[typeof lineId]];
        expect(product.usage)
          .toBeCloseTo(nutritionCore.doseGramsPerGallon(lineId, "Swell", coreName, 3), 12);
      }
    }
  });

  test.each([
    ["3-Part", "3part", feedCalculator],
    ["Component Plus", "cplus", cplusCalculator],
  ])("%s preserves exact stock correction for every recipe and reports unattainable low DTR targets", (_label, lineId, html) => {
    const { api } = createFeedRuntime(html);
    api.state.usePhoszyme = true;
    api.state.application = "direct";
    expect(api.getPhzAdjustment("Swell", 0.05)).toMatchObject({
      achievable: false,
      minimumFinalEc: 0.088,
    });
    expect(api.getPhzAdjustedTargetEC("Swell", 0.05)).toBe(0);

    api.state.application = "stock";
    const coreLine = nutritionCore.getLine(lineId);
    const carrier = coreLine.productsByRole.partB;
    for (const recipeName of Object.keys(coreLine.recipes)) {
      api.state.phaseRecipe.Swell = recipeName;
      const overheadFraction = coreLine.recipes[recipeName][carrier]
        * nutritionCore.phoszyme.stockCarrierRatio
        * (nutritionCore.phoszyme.ecPerGram / coreLine.ecPerGram[carrier]);
      const expectedBase = 3 / (1 + overheadFraction);
      const adjustment = api.getPhzAdjustment("Swell", 3);
      expect(adjustment.baseTargetEc).toBeCloseTo(expectedBase, 12);
      expect(adjustment.baseTargetEc + adjustment.phoszymeEc).toBeCloseTo(3, 12);
    }
  });

  test.each([
    ["3-Part", feedCalculator],
    ["Component Plus", cplusCalculator],
  ])("%s application changes preserve PhosZyme state and render direct metric dosage", (_label, html) => {
    const runtime = createFeedRuntime(html);
    const { api } = runtime;
    api.state.usePhoszyme = true;
    api.state.unit = "g/L";
    api.handleApplicationChange("direct");

    expect(api.state.usePhoszyme).toBe(true);
    expect(runtime.getElement("feed-body").innerHTML).toContain("PhosZyme");
    expect(runtime.getElement("feed-body").innerHTML).toContain("0.106");

    api.state.targetEC.Swell = 0.05;
    api.render();
    expect(runtime.getElement("phz-target-warning").hidden).toBe(false);
    expect(runtime.getElement("phz-target-warning").textContent).toContain("0.088 EC");

    api.handleApplicationChange("stock");
    expect(api.state.usePhoszyme).toBe(true);
    expect(api.state.application).toBe("stock");
  });

  test.each([
    ["3-Part", feedCalculator],
    ["Component Plus", cplusCalculator],
  ])("%s ratio output cannot become infinite for invalid targets", (_label, html) => {
    const { api } = createFeedRuntime(html);
    api.state.application = "direct";
    api.state.usePhoszyme = false;
    expect(api.calcDosage("Swell", "partA", api.state.method, "ratio", -1).display).toBe("–");
    expect(api.calcDosage("Swell", "partA", api.state.method, "ratio", Number.NaN).display).toBe("–");
  });

  test.each([
    ["3-Part", feedCalculator],
    ["Component Plus", cplusCalculator],
  ])("%s target EC stays at one decimal on screen and in custom inputs", (_label, html) => {
    const runtime = createFeedRuntime(html);
    const { api } = runtime;

    expect(api.formatTargetEC(3)).toBe("3.0");
    expect(api.formatTargetEC(2.7)).toBe("2.7");
    expect(api.formatTargetEC(2.2)).toBe("2.2");

    api.state.targetEC = { Veg: 3, Stretch: 2.7, Stack: 2.2, Swell: 2, Ripen: 1.4 };
    api.state.ecPreset = "high";
    api.render();
    expect(runtime.getElement("ec-veg").textContent).toBe("3.0 EC");
    expect(runtime.getElement("ec-swell").textContent).toBe("2.0 EC");

    api.state.ecPreset = "custom";
    api.render();
    expect(runtime.getElement("ec-veg").innerHTML).toContain('value="3.0"');
    expect(runtime.getElement("ec-swell").innerHTML).toContain('value="2.0"');
  });

  test("3-Part branded print chart keeps target EC at one decimal", () => {
    const runtime = createFeedRuntime(feedCalculator);
    runtime.api.state.targetEC = { Veg: 3, Stretch: 2.7, Stack: 2.2, Swell: 2, Ripen: 1.4 };
    runtime.api.render();

    const printHtml = runtime.getElement("branded-print").innerHTML;
    expect(printHtml).toContain('<td class="fc-chart__ec">3.0</td>');
    expect(printHtml).toContain('<td class="fc-chart__ec">2.0</td>');
  });

  test("Component Plus renders a branded two-page print chart from live calculator state", () => {
    const runtime = createFeedRuntime(cplusCalculator);
    runtime.api.state.targetEC = { Veg: 3, Stretch: 2.7, Stack: 2.2, Swell: 2, Ripen: 1.4 };
    runtime.api.render();
    expect(runtime.getElement("branded-print").innerHTML).toBe("");
    runtime.api.renderBrandedPrint();

    const printHtml = runtime.getElement("branded-print").innerHTML;
    expect(cplusCalculator).toContain('id="branded-print"');
    expect(cplusCalculator).toContain("family=Oswald");
    expect(cplusCalculator).toContain('<link rel="preload" href="assets/feed-chart/logo-dark.png" as="image">');
    expect(cplusCalculator).toContain('<link rel="preload" href="assets/feed-chart/qr-moreinfo.png" as="image">');
    expect(cplusCalculator).toContain("clean two-page PDF");
    expect(cplusCalculator).toContain('addEventListener("beforeprint", renderBrandedPrint)');
    expect(printHtml.match(/class="fc-page/g)?.length).toBe(2);
    expect(printHtml).toContain("Component Plus");
    expect(printHtml).toContain("Feed Chart");
    expect(printHtml).toContain("Mixing Instructions");
    expect(printHtml).toContain('<td class="fc-chart__ec">3.0</td>');
    expect(printHtml).toContain('<td class="fc-chart__ec">2.0</td>');
    expect(printHtml).toContain("50 gal tanks");
    expect(printHtml).toContain("Use C+ stock concentrates within 14 days");
  });

  test("Component Plus branded print retains the direct PhosZyme unattainable-target warning", () => {
    const runtime = createFeedRuntime(cplusCalculator);
    runtime.api.state.application = "direct";
    runtime.api.state.unit = "g/gal";
    runtime.api.state.usePhoszyme = true;
    runtime.api.state.targetEC.Swell = 0.05;
    runtime.api.renderBrandedPrint();

    expect(runtime.getElement("branded-print").innerHTML).toContain(
      runtime.api.FRA_NUTRITION_CORE.formatDirectPhoszymeWarning(["Swell"]),
    );
  });

  test("Component Plus branded print uses metric supplement and EC-contribution units", () => {
    const runtime = createFeedRuntime(cplusCalculator);
    runtime.api.state.application = "direct";
    runtime.api.state.unit = "g/L";
    runtime.api.renderBrandedPrint();

    const printHtml = runtime.getElement("branded-print").innerHTML;
    expect(printHtml).toContain("0.13–0.53 mL/L");
    expect(printHtml).toContain("0.05 g/L");
    expect(printHtml).toContain("Heavy: 8 mL/L; Maint.: 4 mL/L");
    expect(printHtml).toContain("Weekly: 0.25 mL/L; Transplant: 0.5 mL/L");
    expect(printHtml).toContain("Si (mL/L)");
    expect(printHtml).toContain("EC per g/L");
    expect(printHtml).not.toContain("EC per g/gal");
  });

  test("Component Plus branded print builds beforeprint and printPage output before printing", () => {
    const runtime = createFeedRuntime(cplusCalculator);
    expect(runtime.getElement("branded-print").innerHTML).toBe("");

    runtime.dispatchWindowEvent("beforeprint");
    expect(runtime.getElement("branded-print").innerHTML).toContain("Feed Chart");

    runtime.api.printPage();
    expect(runtime.getPrintSnapshots()).toHaveLength(1);
    expect(runtime.getPrintSnapshots()[0]).toContain("Feed Chart");
  });

  test.each([
    [
      "3-doser stock with PhosZyme",
      { application: "stock", doserMode: "3", method: "1-1-1", usePhoszyme: true, unit: "mL/gal" },
      ["1-1-1 · 3-Doser Stock Concentrate", "C+ + PhosZyme", "PhosZyme*", "Tank 3"],
    ],
    [
      "2-doser stock without PhosZyme",
      { application: "stock", doserMode: "2", method: "2-doser", usePhoszyme: false, unit: "mL/gal" },
      ["2-Doser Stock Concentrate", "C+ + MKP", "Tank 2 Total"],
    ],
    [
      "metric stock validation",
      { application: "stock", doserMode: "3", method: "1-1-1", usePhoszyme: false, unit: "mL/L" },
      ["Draw 400 mL", "20 L of RO water", "mL / 20L", "EC / g / L"],
    ],
    [
      "direct-to-reservoir pH Up",
      { application: "direct", doserMode: "3", method: "1-1-1", usePhoszyme: false, showPhUp: true, unit: "g/L" },
      ["Direct to Reservoir", "Add pH Up last, if needed", "pH Up last"],
    ],
  ])("Component Plus branded print covers %s", (_label, settings, expected) => {
    const runtime = createFeedRuntime(cplusCalculator);
    Object.assign(runtime.api.state, settings);
    runtime.api.renderBrandedPrint();
    const printHtml = runtime.getElement("branded-print").innerHTML;
    expected.forEach(text => expect(printHtml).toContain(text));
  });

  test("Component Plus branded print adapts its stock visual and validation table to two-doser PhosZyme mode", () => {
    const runtime = createFeedRuntime(cplusCalculator);
    runtime.api.state.doserMode = "2";
    runtime.api.state.method = "2-doser";
    runtime.api.state.usePhoszyme = true;
    runtime.api.state.stockTankVolumeGal = 100;
    runtime.api.render();
    runtime.api.renderBrandedPrint();

    const printHtml = runtime.getElement("branded-print").innerHTML;
    expect(printHtml).toContain("2-Doser Stock Concentrate");
    expect(printHtml).toContain("100 gal tanks");
    expect(printHtml).toContain("Tank 1");
    expect(printHtml).toContain("Tank 2");
    expect(printHtml).toContain("CaNO3");
    expect(printHtml).toContain("Component Plus");
    expect(printHtml).toContain("MKP");
    expect(printHtml).toContain("pending physical confirmation");
    expect(printHtml).not.toContain(">2.54<");
  });

  test("Component Plus branded DTR print uses the current 90-percent fill procedure", () => {
    const runtime = createFeedRuntime(cplusCalculator);
    runtime.api.state.application = "direct";
    runtime.api.state.unit = "g/L";
    runtime.api.state.usePhoszyme = true;
    runtime.api.render();
    runtime.api.renderBrandedPrint();

    const printHtml = runtime.getElement("branded-print").innerHTML;
    expect(printHtml).toContain("Direct to Reservoir");
    expect(printHtml).toContain("90%");
    expect(printHtml).toContain("top off");
    expect(printHtml).toContain("g/L");
    expect(printHtml).not.toContain("Fill RTU batch tank to final target volume");
    expect(cplusCalculator).not.toContain("dtr-step-art.png");
  });

  test("Component Plus stock-tank volume scales stock weights and round-trips through share links", () => {
    expect(cplusCalculator).toContain('oninput="handleStockTankVolumeInput(this.value)"');
    const runtime = createCplusFeedRuntime();
    const { api } = runtime;

    api.handleStockTankVolumeChange(500);
    expect(api.state.stockTankVolumeGal).toBe(500);
    expect(runtime.getReplacedUrl()).toContain("tv=500");
    expect(runtime.getElement("print-config-line").textContent).toContain("500 gal tanks");

    api.handleStockTankVolumeInput(750);
    expect(api.state.stockTankVolumeGal).toBe(750);
    expect(runtime.getReplacedUrl()).toContain("tv=750");
    api.handleStockTankVolumeChange(500);

    const threeDoser = api.calcStockTanks("1-1-1", "mL/gal").rows;
    expect(threeDoser.find(row => row.key === "partA")).toMatchObject({ vol: 500, wt: 500 });
    expect(threeDoser.find(row => row.key === "partB")).toMatchObject({ vol: 500, wt: 500 });
    expect(threeDoser.find(row => row.key === "bloom")).toMatchObject({ vol: 500, wt: 500 });

    const threeDoserMetric = api.calcStockTanks("1-1-1", "mL/L").rows;
    expect(threeDoserMetric.find(row => row.key === "partA")).toMatchObject({ vol: 1893, wt: 227 });
    expect(threeDoserMetric.find(row => row.key === "partB")).toMatchObject({ vol: 1893, wt: 227 });
    expect(threeDoserMetric.find(row => row.key === "bloom")).toMatchObject({ vol: 1893, wt: 227 });

    api.state.doserMode = "2";
    api.state.method = "2-doser";
    api.handleStockTankVolumeChange(2000);
    const twoDoser = api.calcStockTanks("2-doser", "mL/gal").rows;
    expect(twoDoser.find(row => row.key === "partA")).toMatchObject({ vol: 2000, wt: 1500 });
    expect(twoDoser.find(row => row.key === "partB")).toMatchObject({ vol: 2000, wt: 1500 });
    expect(twoDoser.find(row => row.key === "bloom")).toMatchObject({ vol: 2000, wt: 2000 });

    const twoDoserMetric = api.calcStockTanks("2-doser", "mL/L").rows;
    expect(twoDoserMetric.find(row => row.key === "partA")).toMatchObject({ vol: 7570, wt: 681 });
    expect(twoDoserMetric.find(row => row.key === "partB")).toMatchObject({ vol: 7570, wt: 681 });
    expect(twoDoserMetric.find(row => row.key === "bloom")).toMatchObject({ vol: 7570, wt: 908 });

    api.handleStockTankVolumeChange(12.34);
    expect(api.state.stockTankVolumeGal).toBe(12.3);
    expect(runtime.getReplacedUrl()).toContain("tv=12.3");

    api.handleStockTankVolumeChange(0.5);
    expect(api.state.stockTankVolumeGal).toBe(50);
    expect(runtime.getReplacedUrl()).not.toContain("tv=");

    api.handleStockTankVolumeChange(100001);
    expect(api.state.stockTankVolumeGal).toBe(100000);

    const restored = createCplusFeedRuntime("?tv=1000");
    restored.api.loadFromURL();
    expect(restored.api.state.stockTankVolumeGal).toBe(1000);
    expect(restored.api.calcStockTanks("1-1-1", "mL/gal").rows[0].vol).toBe(1000);
  });

  test("iPhone printing reserves enough page-height slack to avoid footer-only pages", () => {
    expect(feedCalculator).toContain("@supports (-webkit-touch-callout: none)");
    expect(feedCalculator).toContain("--print-page-height: 9.6in");
  });

  test("Component Plus printing reserves footer-safe height in desktop PDF exports", () => {
    expect(cplusCalculator).toContain("--print-page-height, 9.5in");
    expect(cplusCalculator).not.toContain("--print-page-height, 10.1in");
  });

  test("printed Notes lines use an opaque white background", () => {
    expect(feedCalculator).toContain("#fff 0, #fff 27px");
    expect(feedCalculator).not.toContain("transparent, transparent 27px");
  });
});

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

// The 3-Part 2-doser tank is a single vessel, so its Bloom-to-Part-B weight ratio IS the
// recipe, and one rate serves both products. Jun 2026 locked the mode to Swell but left
// the tank at 1.00/1.00 — the Stack ratio — and took the printed rate from Part B's own
// recipe share while reporting EC as the sum of Part B's AND Bloom's shares. Rate and EC
// described different tanks, and charts ran 14.1% under target. These pin the fix.
describe("3-Part 2-doser combined tank", () => {
  const EC_PER_GRAM = { partA: 0.306, partB: 0.255, bloom: 0.2 };
  const SWELL = { partA: 0.441, partB: 0.234, bloom: 0.325 };
  const G_PER_LB = 454;
  const ML_PER_GAL = 3785;
  const HIGH = { Veg: 3, Stretch: 3, Stack: 2.7, Swell: 2.4, Ripen: 1.8 };
  // exact Swell requirement, as a rational: (0.325/0.200) / (0.234/0.255) = 85/48
  const EXACT_RATIO = 85 / 48;

  function twoDoser(partBLb?: number) {
    const { api } = createThreePartRuntime();
    api.state.application = "stock";
    api.state.doserMode = "2";
    api.state.method = "2-doser";
    api.state.usePhoszyme = false;
    api.state.targetEC = { ...HIGH };
    if (partBLb !== undefined) {
      const rates = api.LINES["3part"].stockRates["2-doser"];
      api.LINES["3part"].stockRates["2-doser"] = { ...rates, partB: partBLb / 50 };
    }
    return api;
  }

  test("Swell's required Bloom:Part B weight ratio is exactly 85:48", () => {
    expect((SWELL.bloom / EC_PER_GRAM.bloom) / (SWELL.partB / EC_PER_GRAM.partB))
      .toBeCloseTo(EXACT_RATIO, 12);
    expect(EXACT_RATIO).toBeCloseTo(1.770833, 6);
  });

  test("Tank 1 is byte-identical to the standard 3-2-2 Part A tank", () => {
    const api = twoDoser();
    const twoDoserRates = api.LINES["3part"].stockRates["2-doser"];
    const standard = api.LINES["3part"].stockRates["3-2-2"];
    expect(twoDoserRates.partA).toBe(standard.partA);

    const stock = api.calcStockTanks("2-doser", "mL/gal");
    const partA = stock.rows.find((r: any) => r.key === "partA")!;
    expect(partA.vol).toBe(50);
    expect(partA.wt).toBe(75);
    expect(partA.valEC).toBe(2.75);
  });

  test("Tank 2 charge is 2 whole bags of Bloom plus 28 lb Part B", () => {
    const api = twoDoser();
    const stock = api.calcStockTanks("2-doser", "mL/gal");
    const wt = Object.fromEntries(stock.rows.map((r: any) => [r.key, r.wt]));
    expect(wt.bloom).toBe(50);
    expect(wt.partB).toBe(28);

    // Bloom at its standard 1-1-1 concentration — already validated in the field
    const rates = api.LINES["3part"].stockRates["2-doser"];
    expect(rates.bloom).toBe(api.LINES["3part"].stockRates["1-1-1"].bloom);
    expect(rates.bloom / rates.partB).toBeCloseTo(50 / 28, 12);
  });

  // THE bug: the printed rate and the printed EC described different tanks.
  test.each([["28 lb default", undefined], ["25 lb whole-bag build", 25]])(
    "%s — printed rate and printed EC agree, and total EC lands on target",
    (_label, partBLb) => {
      const api = twoDoser(partBLb as number | undefined);
      const rates = api.LINES["3part"].stockRates["2-doser"];
      [{ Veg: 3, Stretch: 3, Stack: 2.7, Swell: 2.4, Ripen: 1.8 },
       { Veg: 2.6, Stretch: 2.4, Stack: 2.2, Swell: 2.0, Ripen: 1.4 }].forEach(preset => {
      api.state.targetEC = { ...preset };
      const rows = api.computeFeedRows();
      const partA = rows[0];
      const tank2 = rows[1];

      // Veg is not served in 2-doser; cells 1-4 are the flower cycle
      [1, 2, 3, 4].forEach(i => {
        const target = [preset.Veg, preset.Stretch, preset.Stack, preset.Swell, preset.Ripen][i];

        // reconstruct what the tank delivers FROM THE PRINTED mL/gal figure
        const mlPerGal = Number(tank2.cells[i]!.display);
        const gramsPerMl = G_PER_LB / ML_PER_GAL;
        const deliveredEc = mlPerGal * gramsPerMl
          * (rates.partB * EC_PER_GRAM.partB + rates.bloom * EC_PER_GRAM.bloom);

        // printed EC must be what the printed rate actually delivers (±rounding)
        expect(Math.abs(deliveredEc / tank2.cells[i]!.ec - 1)).toBeLessThan(0.02);

        // unrounded math must land on target
        expect(partA.cells[i]!.ec + tank2.cells[i]!.ec).toBeCloseTo(target, 6);

        // and so must the PRINTED rates — what a grower actually dials on both dosers
        const deliveredPartA = Number(partA.cells[i]!.display) * gramsPerMl
          * rates.partA * EC_PER_GRAM.partA;
        expect(Math.abs((deliveredPartA + deliveredEc) / target - 1)).toBeLessThan(0.005);
      });
      });
    },
  );

  test("28 lb rounding costs under 1% on the recipe split", () => {
    const api = twoDoser();
    const rates = api.LINES["3part"].stockRates["2-doser"];
    expect(Math.abs((rates.bloom / rates.partB) / EXACT_RATIO - 1)).toBeLessThan(0.01);
  });

  test("the 25 lb build is reachable by changing only the Part B charge", () => {
    const api = twoDoser(25);
    const rates = api.LINES["3part"].stockRates["2-doser"];
    expect(rates.bloom / rates.partB).toBe(2);
    // whole bags throughout: 3 A, 1 B, 2 Bloom
    const stock = api.calcStockTanks("2-doser", "mL/gal");
    const wt = Object.fromEntries(stock.rows.map((r: any) => [r.key, r.wt]));
    [wt.partA, wt.partB, wt.bloom].forEach(w => expect(w % 25).toBe(0));
  });

  test.each([["28 lb default", undefined], ["25 lb whole-bag build", 25]])(
    "%s — every phase stays inside the 0.2-2.0%% injector band",
    (_label, partBLb) => {
      const api = twoDoser(partBLb as number | undefined);
      [["high", { Veg: 3, Stretch: 3, Stack: 2.7, Swell: 2.4, Ripen: 1.8 }],
       ["standard", { Veg: 2.6, Stretch: 2.4, Stack: 2.2, Swell: 2.0, Ripen: 1.4 }]]
        .forEach(([, ecs]) => {
          api.state.targetEC = { ...(ecs as Record<string, number>) };
          api.computeFeedRows().forEach(row => {
            row.cells.forEach(cell => {
              if (!cell) return;
              const injectionPct = Number(cell.display) / ML_PER_GAL * 100;
              expect(injectionPct).toBeGreaterThanOrEqual(0.2);
              expect(injectionPct).toBeLessThanOrEqual(2.0);
            });
          });
        });
    },
  );

  test("combined Tank 2 density stays under the proven two-product tank (210 g/L)", () => {
    const api = twoDoser();
    const rates = api.LINES["3part"].stockRates["2-doser"];
    const gPerL = (rates.partB + rates.bloom) * G_PER_LB / 3.785;
    expect(gPerL).toBeLessThan(210);
  });

  // Copy Summary rebuilt its own product rows and bypassed the tank solver, copying a
  // different rate than the chart displayed. Both outputs now read computeFeedRows().
  test.each([["28 lb default", undefined], ["25 lb whole-bag build", 25]])(
    "%s — Copy Summary rates match the chart exactly",
    (_label, partBLb) => {
      const api = twoDoser(partBLb as number | undefined);
      const chart = api.computeFeedRows();
      const chartRates = chart.map(r => r.cells.map(c => (c ? c.display : "–")));

      const summary = api.buildSummary();
      chartRates.forEach(row =>
        row.forEach(display => {
          if (display === "–") return;
          expect(summary.html).toContain(`>${display}<`);
          expect(summary.plain).toContain(display);
        }),
      );
      // and nothing from the pre-fix Part-B-share calculation leaks through
      const stale = api.calcDosage("Ripen", "partB", "2-doser", "mL/gal", 1.8).display;
      const live = chart[1].cells[4]!.display;
      if (stale !== live) expect(summary.plain).not.toContain(` ${stale} `);
    },
  );

  test("branded print notes describe a combined Tank 2, not one tank per part", () => {
    const api = twoDoser();
    const notes = api.BP_STOCK_NOTES_2DOSER.join(" ");
    expect(notes).not.toContain("Mix each part into its own stock tank");
    expect(notes).toContain("Tank 2 holds Part B and Bloom together");
    expect(notes).toContain("different injection rates");
  });

  // Public repo — the source ships to customers. Internal incident detail, impact
  // figures, and pending approvals belong in the private repo, not here.
  test("source carries no internal incident or approval detail", () => {
    ["14.1%", "postmortem", "sign-off", "Pending Matthew", "six-week"].forEach(term => {
      expect(feedCalculator).not.toContain(term);
    });
  });

  test("2-doser labels itself instead of echoing a mixing method", () => {
    const api = twoDoser();
    expect(api.stockConfigLabel()).toBe("2-Doser");
    api.state.doserMode = "3";
    api.state.method = "3-2-2";
    expect(api.stockConfigLabel()).toBe("3-2-2");
  });
});
