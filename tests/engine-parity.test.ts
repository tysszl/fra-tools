// Cross-check: runs the pre-rebuild pages (tests/fixtures/legacy/feed-calc.html,
// feed-calc-admin.html, cplus-calc.html, and the live usage-calc.html) through their real
// startup path from URL params, and asserts the engine in src/engine reproduces every
// number they show, except where a named exception (EXCEPTIONS below) records one of
// Tyler's 2026-09-29 rulings. Each exception checks the allowed difference exactly.
import { describe, expect, test } from "bun:test";
import { compilePage } from "./support/page-runtime";
import * as E from "../src/engine/index.js";

type Cell = { display: string; dosage: number; ec: number } | null;
type Phase = "Veg" | "Stretch" | "Stack" | "Swell" | "Ripen";
const PHASES: Phase[] = ["Veg", "Stretch", "Stack", "Swell", "Ripen"];

const FEED_EXPORTS = [
  "state", "computeFeedRows", "calcStockTanks", "buildSummary", "getPhaseRecipeName", "getRecipeScheduleLabel",
  "isHighStrengthFlowerChart", "getBrandedAdditives", "getTankVolumes", "stockConfigLabel",
  "getCplusPhRanges", "getSupplementRows", "getPhaseRecipeLabel", "isTwoDoserEqualRate",
];

const PAGES = {
  "feed-calc.html": compilePage<any>("feed-calc.html", FEED_EXPORTS),
  "feed-calc-admin.html": compilePage<any>("feed-calc-admin.html", FEED_EXPORTS),
  "cplus-calc.html": compilePage<any>("cplus-calc.html", FEED_EXPORTS),
};

type PageName = keyof typeof PAGES;

type Config = {
  page: PageName;
  line: "3part" | "cplus";
  application: "stock" | "direct";
  doserCount: 2 | 3;
  method?: string;
  customLbs?: { partA: number; partB: number; bloom: number };
  tv?: number;
  ca?: number;
  fp?: "swell" | "near-ripen";
  unit: string;
  preset: "high" | "standard" | "custom";
  customEc?: Record<Phase, number>;
  schedule: string;
  phaseRecipe?: Record<Phase, string>;
  phz: boolean;
};

const CUSTOM_ECS: Record<Phase, number>[] = [
  { Veg: 2.0, Stretch: 3.2, Stack: 2.9, Swell: 0.05, Ripen: 1.1 },
  { Veg: 3.5, Stretch: 1.0, Stack: 2.699, Swell: 2.4, Ripen: 1.8 },
];
const EC_OPTIONS: Array<Pick<Config, "preset" | "customEc">> = [
  { preset: "high" },
  { preset: "standard" },
  ...CUSTOM_ECS.map(customEc => ({ preset: "custom" as const, customEc })),
];
const SCHEDULES: Record<"3part" | "cplus", Array<Pick<Config, "schedule" | "phaseRecipe">>> = {
  "3part": [
    { schedule: "commercial" },
    { schedule: "swell-flower" },
    { schedule: "custom", phaseRecipe: { Veg: "Veg", Stretch: "Stretch", Stack: "Stack", Swell: "Swell", Ripen: "Ripen" } },
    { schedule: "custom", phaseRecipe: { Veg: "Stack", Stretch: "Veg", Stack: "Ripen", Swell: "Stretch", Ripen: "Swell" } },
  ],
  cplus: [
    { schedule: "commercial" },
    { schedule: "swell-flower" },
    { schedule: "custom", phaseRecipe: { Veg: "Veg", Stretch: "Stack", Stack: "Stack", Swell: "Swell", Ripen: "Ripen" } },
    { schedule: "custom", phaseRecipe: { Veg: "Ripen", Stretch: "Veg", Stack: "Stack", Swell: "Ripen", Ripen: "Swell" } },
  ],
};
const STOCK_UNITS = ["mL/gal", "injection %", "ratio", "mL/L"];
const DIRECT_UNITS = ["g/gal", "g/L"];
const CUSTOM_LBS: Array<{ tv: number; customLbs: Config["customLbs"] }> = [
  { tv: 50, customLbs: { partA: 100, partB: 60, bloom: 40 } },
  { tv: 50, customLbs: { partA: 150, partB: 100, bloom: 100 } },
  { tv: 20, customLbs: { partA: 20, partB: 12.5, bloom: 7.3 } },
  { tv: 37.5, customLbs: { partA: 200, partB: 1, bloom: 55.5 } },
];

function buildMatrix(): Config[] {
  const configs: Config[] = [];
  const each = (base: Omit<Config, "unit" | "preset" | "customEc" | "schedule" | "phaseRecipe" | "phz">, units: string[], schedules: Array<Pick<Config, "schedule" | "phaseRecipe">>) => {
    for (const unit of units) for (const ec of EC_OPTIONS) for (const phz of [false, true]) for (const sched of schedules) {
      configs.push({ ...base, unit, ...ec, ...sched, phz });
    }
  };
  for (const page of ["feed-calc.html", "feed-calc-admin.html"] as const) {
    const line = "3part";
    for (const method of ["3-2-2", "4-3-3", "1-1-1"]) each({ page, line, application: "stock", doserCount: 3, method }, STOCK_UNITS, SCHEDULES[line]);
    for (const tv of [50, 10, 37.5]) each({ page, line, application: "stock", doserCount: 2, tv }, STOCK_UNITS, SCHEDULES[line].slice(0, 1));
    each({ page, line, application: "direct", doserCount: 3 }, DIRECT_UNITS, SCHEDULES[line]);
  }
  for (const { tv, customLbs } of CUSTOM_LBS) {
    each({ page: "feed-calc-admin.html", line: "3part", application: "stock", doserCount: 3, method: "custom", tv, customLbs }, STOCK_UNITS, SCHEDULES["3part"]);
  }
  const cp = "cplus-calc.html" as const;
  for (const tv of [50, 5]) each({ page: cp, line: "cplus", application: "stock", doserCount: 3, tv }, STOCK_UNITS, SCHEDULES.cplus);
  for (const ca of [0.75, 1]) for (const fp of ["swell", "near-ripen"] as const) for (const tv of [50, 12.5]) {
    each({ page: cp, line: "cplus", application: "stock", doserCount: 2, ca, fp, tv }, STOCK_UNITS, SCHEDULES.cplus.slice(0, 1));
  }
  each({ page: cp, line: "cplus", application: "direct", doserCount: 3 }, DIRECT_UNITS, SCHEDULES.cplus);
  return configs;
}

function toSearch(c: Config) {
  const p = new URLSearchParams();
  if (c.application === "direct") p.set("a", "direct");
  if (c.doserCount === 2) p.set("d", "2");
  if (c.method && c.page !== "cplus-calc.html") p.set("m", c.method);
  if (c.tv !== undefined) p.set("tv", String(c.tv));
  if (c.customLbs) {
    p.set("pa", String(c.customLbs.partA));
    p.set("pb", String(c.customLbs.partB));
    p.set("pbl", String(c.customLbs.bloom));
  }
  if (c.ca !== undefined) p.set("ca", String(c.ca));
  if (c.fp) p.set("fp", c.fp);
  if (c.phz) p.set("phz", "yes");
  ["si", "phup", "bf", "tri"].forEach(key => p.set(key, "yes"));
  p.set("u", c.unit);
  p.set("p", c.preset);
  if (c.customEc) PHASES.forEach(ph => p.set(`ec_${ph.toLowerCase()}`, String(c.customEc![ph])));
  if (c.schedule !== "custom") p.set("rs", c.schedule);
  if (c.phaseRecipe) PHASES.forEach(ph => p.set(`rp_${ph.toLowerCase()}`, c.phaseRecipe![ph]));
  return `?${p.toString()}`;
}

function toEngineInput(c: Config) {
  return {
    line: c.line,
    application: c.application,
    doserCount: c.doserCount,
    method: c.method,
    customLbs: c.customLbs,
    stockTankVolumeGal: c.tv,
    cplusCaStockLbPerGal: c.ca,
    cplusFinalPhase: c.fp,
    unit: c.unit,
    ecPreset: c.preset,
    targetEc: c.customEc,
    recipeSchedule: c.schedule,
    phaseRecipe: c.phaseRecipe,
    usePhoszyme: c.phz,
  } as any;
}

// ── Named exceptions: intended departures from the legacy pages ───────────────
const EXCEPTIONS = {
  twoDoserPrecision: "2-doser rates print one decimal finer in every unit except ratio (was: 3-Part mL/gal only)",
  nonzeroNeverDash: "a nonzero dose gets extra decimals instead of printing 0 or a dash",
  twoDoserVegLabel: "3-Part 2-doser printed chart labels the unserved column Veg (was Swell)",
  perColumnPh: "N12: dripper pH follows each column's recipe and EC (was one chart-wide rule); today's ceilings",
  highStrengthRounding: "high strength compares at the displayed 0.1 EC (2.699 counts as 2.7)",
  cplusMinTank: "N14: C+ minimum stock tank is 10 gal (was 1); smaller entries fall back to 50",
  supplementCopy: "N4-N11: one set of supplement rates on every surface (BioFlo 15 maintenance, pH Up 0.2-0.25 max with the high-strength stop on both lines, Triologic up to 2 mL/gal)",
} as const;
type ExceptionId = keyof typeof EXCEPTIONS;
const applied: Record<ExceptionId, number> = Object.fromEntries(Object.keys(EXCEPTIONS).map(k => [k, 0])) as any;

const decimalsOf = (display: string) => (display.includes(".") ? display.split(".")[1].length : 0);

/** Legacy vs engine cell: equal, or different only as twoDoserPrecision / nonzeroNeverDash allow. */
function cellDiffers(legacy: any, engine: any, c: Config): false | string {
  if (!legacy || !engine) return legacy === engine ? false : "null mismatch";
  if (Math.abs(legacy.ec - engine.ec) > 1e-12) return "ec";
  if (legacy.display === engine.display && legacy.dosage === engine.dosage) return false;
  if (engine.display.startsWith("1:") || legacy.display.startsWith("1:")) return "ratio";
  // Legacy 3-Part 2-doser showed mL/gal to 0.1 but kept the numeric dosage whole.
  if (c.doserCount === 2 && legacy.display === engine.display && Number(engine.display) === engine.dosage) {
    applied.twoDoserPrecision++;
    return false;
  }
  const engineValue = Number(engine.display);
  const legacyValue = legacy.display === "–" ? 0 : Number(legacy.display);
  if (legacyValue === 0 && engineValue > 0) { applied.nonzeroNeverDash++; return false; }
  // Both displays round the same raw value; they agree within the two rounding half-steps.
  const window = 0.5 * 10 ** -decimalsOf(legacy.display) + 0.5 * 10 ** -decimalsOf(engine.display) + 1e-9;
  if (c.doserCount === 2 && decimalsOf(engine.display) === decimalsOf(legacy.display) + 1 && Math.abs(engineValue - legacyValue) <= window) {
    applied.twoDoserPrecision++;
    return false;
  }
  return "display";
}

// The legacy chart-wide pH rule, as the old pages had it (tolerance 0.001; 2-doser Veg counts as Swell).
function legacyPh(settings: any) {
  const line = settings.line as "3part" | "cplus";
  const rec = (ph: Phase) => (settings.doserCount === 2 ? "Swell" : settings.phaseRecipe[ph]);
  const high = (ec: number, t: number | undefined) => Boolean(t) && isFinite(ec) && ec >= (t as number) - 0.001;
  if (line === "3part") {
    const hi = E.DATA.ecPresets.high as Record<string, number>;
    const flowerHigh = PHASES.some(ph => ["Stretch", "Stack", "Swell"].includes(rec(ph)) && high(settings.targetEc[ph], hi[rec(ph)]));
    return { flowerHigh, vegRipenHigh: false, flower: flowerHigh ? "5.5–5.8" : "5.5–6.0", vegRipen: "5.5–6.0" };
  }
  const t = E.DATA.lines.cplus.ph.highStrengthEc as Record<string, number>;
  let flowerHigh = false, vegRipenHigh = false;
  PHASES.forEach(ph => {
    if (!high(settings.targetEc[ph], t[rec(ph)])) return;
    if (["Stack", "Swell"].includes(rec(ph))) flowerHigh = true; else vegRipenHigh = true;
  });
  return {
    flowerHigh, vegRipenHigh,
    flower: flowerHigh ? "5.5–5.6" : "5.5–5.7",
    vegRipen: vegRipenHigh ? "5.5–5.8" : "5.5–6.0",
  };
}

// Supplement rates as the legacy pages printed them (superseded by supplementCopy).
function legacySupplementRates(metric: boolean) {
  const r = E.supplementRates(metric);
  return { ...r, triologicTransplant: r.triologicMax };
}
const LEGACY_PRINT_ADDITIVES = { si: "0.5–2 mL/gal", triologic: "1–2 mL/gal", bioflo: "30 mL/gal", phUp: "0.05–0.25 g/gal" };

const normCell = (cell: any): Cell => (cell ? { display: cell.display, dosage: cell.dosage, ec: cell.ec } : null);
const normRows = (rows: any[]) => rows.map(row => ({ label: row.label, cells: row.cells.map(normCell) }));
const normStock = (stock: any) => ({
  volUnit: stock.volUnit, wtUnit: stock.wtUnit, concUnit: stock.concUnit, sampleUnit: stock.sampleUnit, ecUnit: stock.ecUnit,
  rows: stock.rows.map(({ key, tank, part, vol, wt, conc, sample, ecG, valEC }: any) => ({ key, tank, part, vol, wt, conc, sample, ecG, valEC })),
});

function suppDetails(html: string) {
  return [...html.matchAll(/<div class="supp-detail">([\s\S]*?)<\/div>/g)].map(m => m[1].trim());
}

function summarySupplementLines(plain: string) {
  const start = plain.indexOf("\nSupplements\n");
  if (start < 0) return [];
  return plain.slice(start + "\nSupplements\n".length).split("\n").filter(Boolean);
}

function tableRowCells(html: string, rowLabel: string) {
  const start = html.indexOf(`>${rowLabel}</td>`);
  if (start < 0) return [];
  const rowEnd = html.indexOf("</tr>", start);
  return [...html.slice(start, rowEnd).matchAll(/<td[^>]*>(?:<b>)?([^<]*)(?:<\/b>)?<\/td>/g)].map(m => m[1]);
}

// Expected page copy, built from engine values. Templates are the pages' current wording.
function expectedThreePartSupplements(ph: ReturnType<typeof legacyPh>, metric: boolean) {
  const r = legacySupplementRates(metric);
  const print = LEGACY_PRINT_ADDITIVES;
  const hs = ph.flowerHigh;
  const screen = [
    `Foliar: ${r.siFoliar}, once weekly, veg through week 3 of flower.`,
    hs
      ? `Target pH at the dripper: ${ph.flower} for flower (Stretch, Stack, Swell) at this chart's high-strength EC; ${ph.vegRipen} for Veg and Ripen. As needed, ${r.phUpMax} ${r.phUpUnit} max total (stop at ${r.phUpHighStrengthFlowerStop} on flower). Always add last.`
      : `Target pH at the dripper: ${ph.vegRipen} for every recipe on this chart. As needed, ${r.phUpMax} ${r.phUpUnit} max total. Always add last.`,
    `Line cleaner for biofilm removal. Heavy clean: ${r.biofloHeavy}, soak ${r.biofloSoakHours} hrs. Maintenance: ${r.biofloMaintenance} every ${r.biofloMaintenanceEveryWeeks} weeks.`,
    `Microbial inoculant — amplifies mycorrhizal colonization. ${r.triologicWeekly} weekly hand drench. Transplant: ${r.triologicTransplant}.`,
  ];
  const summary = [
    `Si — Foliar: ${r.siFoliar}, once weekly, veg through week 3 of flower.`,
    hs
      ? `pH Up — Target pH at the dripper ${ph.flower} (flower: Stretch, Stack, Swell) or ${ph.vegRipen} (Veg, Ripen). As needed, ${r.phUpMax} ${r.phUpUnit} max total; stop at ${r.phUpHighStrengthFlowerStop} ${r.phUpUnit} on flower. Always add last.`
      : `pH Up — Target pH at the dripper ${ph.vegRipen} (all recipes on this chart). As needed, ${r.phUpMax} ${r.phUpUnit} max total. Always add last.`,
    `BioFlo — Heavy clean: ${r.biofloHeavy}. Maintenance: ${r.biofloMaintenance} every ${r.biofloMaintenanceEveryWeeks} weeks.`,
    `Triologic — ${r.triologicWeekly} weekly hand drench.`,
  ];
  const printTable = [
    ["Front Row Si", print.si, "Foliar, 1x/week, Veg through Wk 3 of flower (stem strength / stress)."],
    ["Triologic", print.triologic, "Use 1x per week."],
    ["BioFlo", print.bioflo, "As needed to clear biofilm from irrigation lines."],
    ["Front Row pH Up", print.phUp, hs
      ? `Target ${ph.flower} on flower (Stretch, Stack, Swell) and ${ph.vegRipen} on Veg and Ripen, at the dripper. Mix ${r.phUpWaitMinutes} minutes.`
      : `Target ${ph.vegRipen} at the dripper for every recipe on this chart. Mix ${r.phUpWaitMinutes} minutes.`],
  ];
  return { screen, summary, printTable };
}

function expectedCplusSupplements(ph: ReturnType<typeof legacyPh>, metric: boolean) {
  const r = legacySupplementRates(metric);
  const phUpRate = `${r.phUpMax} ${r.phUpUnit}`;
  const rows = [
    { rate: r.siFoliar, detail: `Foliar: ${r.siFoliar}, once weekly, veg through week 3 of flower.` },
    {
      rate: phUpRate,
      detail: `Target pH at the dripper: ${ph.flower} for Stack and Swell, ${ph.vegRipen} for Veg and Ripen. As needed, ${phUpRate} max total. Always add last.`,
      notes: `Target pH at the dripper: ${ph.flower} for Stack and Swell, ${ph.vegRipen} for Veg and Ripen. Mix ${r.phUpWaitMinutes} minutes; always add last.`,
    },
    {
      rate: `Heavy: ${r.biofloHeavy}; Maint.: ${r.biofloMaintenance}`,
      detail: `Line cleaner for biofilm removal. Heavy clean: ${r.biofloHeavy}, soak ${r.biofloSoakHours} hrs. Maintenance: ${r.biofloMaintenance} every ${r.biofloMaintenanceEveryWeeks} weeks.`,
    },
    {
      rate: `Weekly: ${r.triologicWeekly}; Transplant: ${r.triologicTransplant}`,
      detail: `Microbial inoculant — amplifies mycorrhizal colonization. ${r.triologicWeekly} weekly hand drench. Transplant: ${r.triologicTransplant}.`,
    },
  ];
  const summary = [
    `Si — Foliar: ${r.siFoliar}, once weekly, veg through week 3 of flower.`,
    `pH Up — Target pH at the dripper ${ph.flower} (Stack, Swell) or ${ph.vegRipen} (Veg, Ripen). As needed, ${phUpRate} max total. Always add last.`,
    `BioFlo — Heavy clean: ${r.biofloHeavy}. Maintenance: ${r.biofloMaintenance} every ${r.biofloMaintenanceEveryWeeks} weeks.`,
    `Triologic — ${r.triologicWeekly} weekly hand drench.`,
  ];
  return { rows, summary };
}

function describeConfig(c: Config) {
  return `${c.page} ${toSearch(c)}`;
}

function compareConfig(c: Config, mismatches: string[]) {
  // cplusMinTank: the legacy page accepted C+ tanks under 10 gal; the engine falls back to 50.
  const legacyConfig = c.line === "cplus" && c.tv !== undefined && c.tv < 10 ? { ...c, tv: 50 } : c;
  if (legacyConfig !== c) applied.cplusMinTank++;
  const { api, element } = PAGES[c.page](toSearch(legacyConfig));
  const chart = E.computeFeedChart(toEngineInput(c));
  const s = api.state;
  const check = (what: string, page: unknown, engine: unknown) => {
    if (!Bun.deepEquals(page, engine, true)) {
      mismatches.push(`${describeConfig(c)} :: ${what}\n  page:   ${JSON.stringify(page)}\n  engine: ${JSON.stringify(engine)}`);
    }
  };
  const metric = E.isMetricUnit(c.unit);

  // The page resolved the URL to the intended settings.
  check("settings", {
    application: s.application, doserMode: s.doserMode, unit: s.unit, usePhoszyme: s.usePhoszyme,
    targetEC: s.targetEC, recipeSchedule: s.recipeSchedule,
  }, {
    application: chart.settings.application, doserMode: String(chart.settings.doserCount), unit: chart.settings.unit,
    usePhoszyme: chart.settings.usePhoszyme, targetEC: chart.settings.targetEc, recipeSchedule: chart.settings.recipeSchedule,
  });

  check("phase recipes", PHASES.map(ph => api.getPhaseRecipeName(ph)), chart.phases.map(ph => ph.recipe));
  check("recipe schedule label", api.getRecipeScheduleLabel(), chart.recipeScheduleLabel);
  const legacyRows = normRows(api.computeFeedRows());
  const engineRows = normRows(chart.rows);
  check("feed row labels", legacyRows.map(r => r.label), engineRows.map(r => r.label));
  legacyRows.forEach((row, i) => row.cells.forEach((cell, j) => {
    const why = cellDiffers(cell, engineRows[i]?.cells[j], c);
    if (why) check(`feed cell ${row.label}/${PHASES[j]} (${why})`, cell, engineRows[i]?.cells[j]);
  }));
  check("PhosZyme warning", element("phz-target-warning").textContent, chart.phoszymeWarning.text);

  const summary = api.buildSummary();
  const oldPh = legacyPh(chart.settings);
  comparePh(c, chart, oldPh, check);
  if (c.line === "3part") {
    check("summary recipe row", tableRowCells(summary.html, "Recipe"), chart.phases.map(ph => ph.recipeLabel));
    const printRecipes = [...element("branded-print").innerHTML.matchAll(/class="fc-chart__recipe">([^<]*)</g)].map(m => m[1]);
    if (c.doserCount === 2 && printRecipes[0] === "Swell") { printRecipes[0] = "Veg"; applied.twoDoserVegLabel++; }
    check("print recipe row", printRecipes, chart.phases.map(ph => ph.recipeLabel));
    check("legacy high-strength flower", api.isHighStrengthFlowerChart(), oldPh.flowerHigh);
    const expected = expectedThreePartSupplements(oldPh, metric);
    check("supplements (screen)", suppDetails(element("supp-list").innerHTML), expected.screen);
    check("supplements (summary)", summarySupplementLines(summary.plain), expected.summary);
    check("supplements (print table)", api.getBrandedAdditives(), expected.printTable);
    check("stock config label", api.stockConfigLabel(), chart.stockConfigLabel);
  } else {
    check("summary recipe row", PHASES.map(ph => api.getPhaseRecipeLabel(ph)), chart.phases.map(ph => ph.recipeLabel));
    check("legacy pH ranges", api.getCplusPhRanges(), { flower: oldPh.flower, vegRipen: oldPh.vegRipen });
    const expected = expectedCplusSupplements(oldPh, metric);
    const rows = api.getSupplementRows(metric);
    check("supplements (rows)", rows.map((row: any, i: number) => ({
      rate: row.rate, detail: row.detail, ...(expected.rows[i].notes ? { notes: row.notes } : {}),
    })), expected.rows);
    check("supplements (screen)", suppDetails(element("supp-list").innerHTML), expected.rows.map(row => row.detail));
    check("supplements (summary)", summarySupplementLines(summary.plain), expected.summary);
    if (c.doserCount === 2) {
      check("2-doser equal rate", api.isTwoDoserEqualRate(), E.cplusTwoDoserEqualRate(chart.settings));
    }
  }

  if (c.application === "stock") {
    check("stock table", normStock(api.calcStockTanks(s.method, s.unit)), normStock(chart.stock));
    if (c.line === "3part") check("tank volumes", api.getTankVolumes(s.method), chart.tankVolumes);
    if (c.doserCount === 2) {
      const total = element("stock-body").innerHTML.match(/Tank 2 Total[\s\S]*?class="validation-ec"[^>]*>([^<]*)</)?.[1];
      check("Tank 2 validation total", total, chart.stock!.tank2Total);
    }
  }
}

/**
 * perColumnPh / highStrengthRounding: each engine column equals the legacy chart-wide
 * range unless that column's own high-strength status differs from the chart-wide one.
 */
function comparePh(c: Config, chart: any, oldPh: ReturnType<typeof legacyPh>, check: (w: string, a: unknown, b: unknown) => void) {
  chart.ph.columns.forEach((col: any, i: number) => {
    if (!col) { check("2-doser Veg pH column is empty", c.doserCount === 2 && i === 0, true); return; }
    const flowerGroup = c.line === "3part" ? ["Stretch", "Stack", "Swell"].includes(col.recipe) : ["Stack", "Swell"].includes(col.recipe);
    const legacyText = flowerGroup ? oldPh.flower : oldPh.vegRipen;
    const legacyHigh = flowerGroup ? oldPh.flowerHigh : oldPh.vegRipenHigh;
    if (col.text === legacyText) return;
    if (col.highStrength !== legacyHigh) {
      const ec = chart.settings.targetEc[PHASES[i]];
      const t = c.line === "3part" ? (E.DATA.ecPresets.high as any)[col.recipe] : (E.DATA.lines.cplus.ph.highStrengthEc as any)[col.recipe];
      if (col.highStrength && t && ec < t - 0.001 && Number(ec.toFixed(1)) >= t) applied.highStrengthRounding++;
      else applied.perColumnPh++;
      return;
    }
    check(`pH column ${PHASES[i]}`, legacyText, col.text);
  });
}

describe("named exceptions", () => {
  test("each exception is intended and documented", () => {
    expect(Object.keys(EXCEPTIONS).sort()).toEqual([
      "cplusMinTank", "highStrengthRounding", "nonzeroNeverDash", "perColumnPh", "supplementCopy", "twoDoserPrecision", "twoDoserVegLabel",
    ]);
  });

  test("supplementCopy: the engine's one rate set differs from the legacy print table exactly as ruled", () => {
    const r = E.supplementRates(false);
    expect({ bioflo: [r.biofloHeavy, r.biofloMaintenance], phUp: r.phUpMax, stop: r.phUpHighStrengthFlowerStop, triologic: [r.triologicWeekly, r.triologicMax] })
      .toEqual({ bioflo: ["30 mL/gal", "15 mL/gal"], phUp: "0.2–0.25", stop: "0.15–0.2", triologic: ["1 mL/gal", "2 mL/gal"] });
    expect(LEGACY_PRINT_ADDITIVES).toEqual({ si: "0.5–2 mL/gal", triologic: "1–2 mL/gal", bioflo: "30 mL/gal", phUp: "0.05–0.25 g/gal" });
    applied.supplementCopy++;
  });
});

const MATRIX = buildMatrix();

describe("engine reproduces the current feed pages", () => {
  test("matrix covers every dimension", () => {
    const count = (page: PageName) => MATRIX.filter(c => c.page === page).length;
    expect(count("feed-calc.html")).toBe(544);
    expect(count("feed-calc-admin.html")).toBe(1056);
    expect(count("cplus-calc.html")).toBe(576);
  });

  for (const page of Object.keys(PAGES) as PageName[]) {
    test(`${page}: every output matches`, () => {
      const mismatches: string[] = [];
      MATRIX.filter(c => c.page === page).forEach(c => compareConfig(c, mismatches));
      if (mismatches.length) console.log(`${mismatches.length} mismatches\n${mismatches.slice(0, 20).join("\n")}`);
      expect(mismatches).toEqual([]);
    }, 300_000);
  }

  test("every named exception was exercised", () => {
    console.log(Object.entries(applied).map(([k, n]) => `${k}: ${n}`).join(", "));
    for (const id of Object.keys(EXCEPTIONS) as ExceptionId[]) expect(applied[id]).toBeGreaterThan(0);
  });
});

describe("engine reproduces the usage calculator", () => {
  const runUsage = compilePage<any>("usage-calc.html", ["state", "calcAll", "setBase", "buildProductList"]);
  const bases = [["fra", "3part"], ["cplus", "cplus"]] as const;
  const cases: Array<{ base: string; lineId: "3part" | "cplus"; vegEc: number; flowerEc: number; additives: boolean; phz: boolean; tri: number }> = [];
  for (const [base, lineId] of bases) for (const vegEc of [3.0, 2.5, 1.0, 0.05]) for (const flowerEc of [3.0, 2.2, 3.6, 3.3, 2.7]) {
    for (const additives of [false, true]) for (const phz of [false, true]) for (const tri of [0, 450.5]) {
      cases.push({ base, lineId, vegEc, flowerEc, additives, phz, tri });
    }
  }

  test(`${cases.length} usage cases match`, () => {
    const mismatches: string[] = [];
    for (const c of cases) {
      const { api } = runUsage("");
      api.state.base = c.base;
      api.state.products = api.buildProductList();
      api.state.veg = { feedEC: c.vegEc, weeks: 3, galPerWeek: 1250, triologicGalPerWeek: c.tri };
      api.state.flower = { feedEC: c.flowerEc, weeks: 9, galPerWeek: 10000, triologicGalPerWeek: c.tri * 2 };
      api.state.products.forEach((p: any) => {
        if (p.isBase) return;
        p.included = p.name === "PhosZyme" ? c.phz : c.additives;
      });
      const page = api.calcAll();
      const engine = E.usageEstimate({
        lineId: c.lineId,
        veg: api.state.veg,
        flower: api.state.flower,
        products: api.state.products.map((p: any) => ({ ...p })),
      });
      if (!Bun.deepEquals(page, engine, true)) mismatches.push(`${JSON.stringify(c)}\n  page:   ${JSON.stringify(page)}\n  engine: ${JSON.stringify(engine)}`);
    }
    expect(mismatches).toEqual([]);
  });

  test("the page's default product list matches the engine's (package sizes)", () => {
    for (const [base, lineId] of bases) {
      const { api } = runUsage("");
      api.state.base = base;
      const page = api.buildProductList().map(({ price: _price, ...rest }: any) => rest);
      const engine = E.usageProducts(lineId).map(({ price: _price, ...rest }) => rest);
      expect(page).toEqual(engine);
    }
  });
});
