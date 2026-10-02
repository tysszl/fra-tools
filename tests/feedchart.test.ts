// Feed Chart app: strings in both languages, share-link compatibility with the
// pre-rebuild pages, and the printed sheets' content.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { compilePage } from "./support/page-runtime";
import * as E from "../src/engine/index.js";
import { STRINGS } from "../src/feedchart/strings.js";
import { translator, missingKeys } from "../shared/i18n.js";
import { decodeParams, encodeParams } from "../src/feedchart/url.js";
import { buildView, buildSummary } from "../src/feedchart/content.js";
import { renderPrint } from "../src/feedchart/print.js";

const PHASES = ["Veg", "Stretch", "Stack", "Swell", "Ripen"] as const;
type Page = { line: "3part" | "cplus"; mode: "customer" | "team" };

// Every config the app can reach, sampled across each dimension.
function configs() {
  const out: any[] = [];
  for (const line of ["3part", "cplus"] as const) {
    for (const application of ["stock", "direct"] as const) {
      for (const doserCount of [3, 2] as const) {
        for (const unit of application === "stock" ? E.DATA.feedUnits.stock : E.DATA.feedUnits.direct) {
          for (const usePhoszyme of [false, true]) {
            out.push({ line, application, doserCount, unit, usePhoszyme });
          }
        }
      }
    }
  }
  out.push({ line: "3part", method: "custom", unit: "mL/L" }, { line: "3part", method: "4-3-3" });
  out.push({ line: "cplus", method: "custom", stockTankVolumeGal: 75, customLbs: { partA: 150, partB: 75, bloom: 100 }, usePhoszyme: true });
  out.push({ line: "cplus", doserCount: 2, cplusFinalPhase: "near-ripen", cplusCaStockLbPerGal: 1 });
  out.push({ line: "cplus", recipeSchedule: "swell-flower" }, { line: "3part", ecPreset: "custom", targetEc: { Swell: 0.05 } });
  out.push({ line: "3part", application: "direct", usePhoszyme: true, ecPreset: "custom", targetEc: { Ripen: 0.05 } });
  return out;
}

function render(input: any, lang: "en" | "es", mode: "customer" | "team" = "customer") {
  const t = translator(STRINGS, lang);
  const view = buildView(E.computeFeedChart(input), t, { facility: "Green Valley", show: { phup: true, bf: true, tri: true }, lang, mode });
  return { view, print: renderPrint(view, t, { logo: "logo.png", qr: "qr.png" }), summary: buildSummary(view, t, "https://tools.frontrowag.com/feed-calc.html") };
}

describe("strings", () => {
  test("every key exists in English and Spanish", () => {
    expect(missingKeys(STRINGS)).toEqual([]);
  });

  test("every literal key the app asks for exists", () => {
    const dir = new URL("../src/feedchart/", import.meta.url);
    const used = new Set<string>();
    for (const file of readdirSync(dir)) {
      const source = readFileSync(new URL(file, dir), "utf8");
      for (const match of source.matchAll(/\bt\("([^"]+)"/g)) used.add(match[1]);
    }
    expect(used.size).toBeGreaterThan(100);
    expect([...used].filter(key => !(key in STRINGS.en))).toEqual([]);
  });

  test("every reachable screen, print, and summary renders in both languages", () => {
    for (const input of configs()) for (const lang of ["en", "es"] as const) {
      expect(() => render(input, lang, input.method === "custom" ? "team" : "customer")).not.toThrow();
    }
  });

  test("C+ custom stock prints its weights and lb/gal", () => {
    const { print, view } = render({ line: "cplus", method: "custom", stockTankVolumeGal: 75, customLbs: { partA: 150, partB: 75, bloom: 100 } }, "en", "team");
    expect(view.title).toBe("Component Plus Feed Chart · Team");
    expect(view.chips).toContain("Custom 2 / 1 / 1.33 lb/gal · 3 dosers");
    expect(view.chips).toContain("75 gal tanks");
    expect(view.tanks.map(tank => [tank.weight, tank.conc, tank.validates])).toEqual([
      ["150 lb", "2 lb/gal", "Validates at 3.80 EC"], ["75 lb", "1 lb/gal", "Validates at 1.70 EC"], ["100 lb", "1.333 lb/gal", "Validates at 1.56 EC"],
    ]);
    expect(print).toContain("Custom 2/1/1.33 lb/gal");
  });
});

describe("share links", () => {
  const PAGES = {
    "feed-calc.html": { run: compilePage<any>("feed-calc.html", ["state"]), page: { line: "3part", mode: "customer" } as Page },
    "feed-calc-admin.html": { run: compilePage<any>("feed-calc-admin.html", ["state"]), page: { line: "3part", mode: "team" } as Page },
    "cplus-calc.html": { run: compilePage<any>("cplus-calc.html", ["state"]), page: { line: "cplus", mode: "customer" } as Page },
  };
  const LINKS: Array<[keyof typeof PAGES, string]> = [
    ["feed-calc.html", ""],
    ["feed-calc.html", "?m=4-3-3"],
    ["feed-calc.html", "?m=1-1-1&u=injection%20%25&p=standard&phz=yes"],
    ["feed-calc.html", "?m=custom"],
    ["feed-calc.html", "?d=2&tv=37.5&u=ratio"],
    ["feed-calc.html", "?a=direct&u=g%2FL&rs=swell-flower"],
    ["feed-calc.html", "?a=direct&d=2&u=mL%2Fgal"],
    ["feed-calc.html", "?rs=stack-flower&rp_stack=Ripen"],
    ["feed-calc.html", "?rs=swell-flower&rp_ripen=Ripen&p=custom&ec_veg=2.2&ec_swell=11&ec_ripen=0"],
    ["feed-calc.html", "?rp_stretch=Stretch&rp_stack=Stack&si=yes&phup=yes&bf=yes&tri=yes&fac=Green%20Valley&lang=es"],
    ["feed-calc-admin.html", "?m=custom&pa=100&pb=60&pbl=40&tv=40"],
    ["feed-calc-admin.html", "?m=custom&pa=500&pb=1&pbl=40"],
    ["feed-calc-admin.html", "?m=4-3-3&u=mL%2FL"],
    ["cplus-calc.html", "?key=x&tv=12.5"],
    ["cplus-calc.html", "?d=2&ca=1&fp=near-ripen&tv=75&phz=yes"],
    ["cplus-calc.html", "?a=direct&d=2&u=g%2Fgal"],
    ["cplus-calc.html", "?m=4-3-3&rp_stretch=Stretch&rp_ripen=Veg"],
  ];

  test("old links open the same chart as the pre-rebuild pages", () => {
    for (const [file, search] of LINKS) {
      const { run, page } = PAGES[file];
      const legacy = run(search).api.state;
      const settings = E.resolveFeedSettings(decodeParams(new URLSearchParams(search), page).input);
      expect({
        file, search,
        application: settings.application, doserCount: String(settings.doserCount), unit: settings.unit, usePhoszyme: settings.usePhoszyme,
        ecPreset: settings.ecPreset, targetEc: settings.targetEc, phaseRecipe: settings.doserCount === 2 ? legacy.phaseRecipe : settings.phaseRecipe,
        method: settings.doserCount === 2 ? legacy.method : settings.method,
        ...(page.mode === "team" && settings.method === "custom" ? { customLbs: settings.customLbs } : {}),
      }).toEqual({
        file, search,
        application: legacy.application, doserCount: legacy.doserMode, unit: legacy.unit, usePhoszyme: legacy.usePhoszyme,
        ecPreset: legacy.ecPreset, targetEc: legacy.targetEC, phaseRecipe: legacy.phaseRecipe,
        method: legacy.method,
        ...(page.mode === "team" && settings.method === "custom" ? { customLbs: legacy.customLbs } : {}),
      });
    }
  });

  test("the retired Si toggle is ignored", () => {
    const { extras } = decodeParams(new URLSearchParams("?si=yes&phup=yes"), { line: "3part", mode: "customer" });
    expect(extras.show).toEqual({ phup: true, bf: false, tri: false });
    const p = encodeParams(E.resolveFeedSettings({}), { ...extras, lang: "en", mode: "customer" });
    expect(p.has("si")).toBe(false);
  });

  test("links the app writes decode to the same chart", () => {
    const cases: Array<[Page, any]> = [
      [{ line: "3part", mode: "customer" }, {}],
      [{ line: "3part", mode: "customer" }, { method: "4-3-3", unit: "ratio", usePhoszyme: true }],
      [{ line: "3part", mode: "customer" }, { doserCount: 2, stockTankVolumeGal: 37.5 }],
      [{ line: "3part", mode: "customer" }, { ecPreset: "custom", targetEc: { Veg: 2.2, Stretch: 2.9, Stack: 2.5, Swell: 2.1, Ripen: 1.2 } }],
      [{ line: "3part", mode: "customer" }, { recipeSchedule: "custom", phaseRecipe: { Veg: "Veg", Stretch: "Stretch", Stack: "Stack", Swell: "Swell", Ripen: "Ripen" } }],
      [{ line: "3part", mode: "customer" }, { application: "direct", unit: "g/L" }],
      [{ line: "3part", mode: "team" }, { method: "custom", stockTankVolumeGal: 40, customLbs: { partA: 90, partB: 50.5, bloom: 40 } }],
      [{ line: "cplus", mode: "team" }, { method: "custom", stockTankVolumeGal: 75, customLbs: { partA: 150, partB: 75, bloom: 100 }, ecPreset: "custom", targetEc: { Veg: 3, Stretch: 3, Stack: 2.7, Swell: 2.4, Ripen: 1.8 } }],
      [{ line: "cplus", mode: "team" }, { method: "custom", customLbs: { partA: 62.5, partB: 40, bloom: 30.1 }, unit: "mL/L", usePhoszyme: true }],
      [{ line: "cplus", mode: "customer" }, { doserCount: 2, cplusCaStockLbPerGal: 1, cplusFinalPhase: "near-ripen", stockTankVolumeGal: 12.5 }],
      [{ line: "cplus", mode: "customer" }, { stockTankVolumeGal: 75, recipeSchedule: "swell-flower", unit: "mL/L" }],
    ];
    for (const [page, input] of cases) {
      const settings = E.resolveFeedSettings({ ...input, line: page.line });
      const extras = { facility: "Farm & Co", show: { phup: true, bf: false, tri: true } };
      const params = encodeParams(settings, { ...extras, lang: "es", key: page.line === "cplus" ? "code" : null, mode: page.mode });
      const decoded = decodeParams(new URLSearchParams(params.toString()), page);
      expect(E.resolveFeedSettings(decoded.input)).toEqual(settings);
      expect(decoded.extras).toEqual(extras);
      expect(params.get("lang")).toBe("es");
    }
  });

  test("C+ custom stock is team mode only", () => {
    const search = "?m=custom&pa=150&pb=75&pbl=100&tv=75";
    const team = E.resolveFeedSettings(decodeParams(new URLSearchParams(search), { line: "cplus", mode: "team" }).input);
    expect(team.method).toBe("custom");
    expect(team.customLbs).toEqual({ partA: 150, partB: 75, bloom: 100 });
    const customer = E.resolveFeedSettings(decodeParams(new URLSearchParams(search), { line: "cplus", mode: "customer" }).input);
    expect(customer.method).toBe("1-1-1");
    expect(E.stockRates(customer)).toEqual({ partA: 1, partB: 1, bloom: 1 });
    const params = encodeParams(team, { facility: "", show: { phup: false, bf: false, tri: false }, lang: "en", key: null, mode: "team" });
    expect(Object.fromEntries(params)).toEqual({ m: "custom", pa: "150", pb: "75", pbl: "100", tv: "75" });
  });

  test("old rs=custom links read a missing phase as its own recipe", () => {
    // The old pages skipped rp_<phase> when the recipe matched the phase name.
    for (const line of ["3part", "cplus"] as const) {
      const { input } = decodeParams(new URLSearchParams("?rs=custom&rp_swell=Ripen"), { line, mode: "customer" });
      const s = E.resolveFeedSettings({ ...input, line });
      expect(s.phaseRecipe.Stack).toBe("Stack");
      expect(s.phaseRecipe.Swell).toBe("Ripen");
    }
  });
});

describe("printed chart", () => {
  const sheets = (html: string) => html.match(/<section class="sheet">/g)?.length;

  test("two Letter pages, each with the contact footer", () => {
    for (const input of configs()) {
      const { print } = render(input, "en");
      expect(sheets(print)).toBe(2);
      expect(print.match(/order@solsticeag\.com · \+1 844-420-6883 · frontrowag\.com/g)?.length).toBe(2);
    }
  });

  test("metric charts print metric validation and never US units in the procedure", () => {
    const { print } = render({ line: "3part", unit: "mL/L" }, "en");
    expect(print).toContain("Mix the sample into 20 L of RO water.");
    expect(print).toContain("250 mL in 20 L RO");
    expect(print).not.toContain("5 gal");
    expect(print).not.toContain("gallons");
    expect(print).not.toContain("USA");
    const us = render({ line: "3part" }, "en").print;
    expect(us).toContain("Mix the sample into 5 gal of RO water.");
  });

  test("dripper pH prints per column, with no at-the-line note", () => {
    const { print, view } = render({ line: "cplus", recipeSchedule: "swell-flower" }, "en");
    expect(view.phases.map(p => p.ph && p.ph.text)).toEqual(["5.5–6.0", "5.5", "5.5–5.6", "5.5–5.6", "5.5–5.9"]);
    expect(print).not.toContain("calcium-phosphate line");
  });

  test("rulings in the printed additive table and notes", () => {
    const { print } = render({ line: "3part" }, "en");
    expect(print).toContain("30 mL/gal heavy · 15 mL/gal maintenance");
    expect(print).toContain("0.2–0.25 g/gal max");
    expect(print).toContain("Stop at 0.15–0.2 g/gal on high-strength flower.");
    expect(print).toContain("up to 2 mL/gal (for example at transplant)");
    expect(print).toContain("wait 5–15 minutes");
    const dtr = render({ line: "3part", application: "direct" }, "en").print;
    expect(dtr).toContain("calcium hypochlorite at about 1.2 g per 100 gal for 2 ppm");
    expect(render({ line: "cplus", application: "direct", unit: "g/L" }, "en").print).toContain("about 1.2 g per 100 gal (0.32 g per 100 L) for 2 ppm");
  });

  test("summary carries the chart and the link", () => {
    const { summary } = render({ line: "3part" }, "en");
    expect(summary.plain).toContain("Part A | ");
    expect(summary.plain).toContain("Chart link: https://tools.frontrowag.com/feed-calc.html");
    expect(summary.html).toContain("<table");
  });
});

describe("entry pages", () => {
  test("each page mounts the shared app; team and C+ pages stay out of search", () => {
    const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    expect(read("feed-calc.html")).toContain('mount(document.getElementById("app"), { line: "3part", mode: "customer" })');
    expect(read("cplus-calc.html")).toContain("gate: true");
    for (const f of ["cplus-calc.html", "feed-calc-admin.html"]) expect(read(f)).toContain('name="robots" content="noindex');
    expect(read("feed-calc.html")).not.toContain("robots");
  });
});

void PHASES;
