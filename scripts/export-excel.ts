// Writes the Excel copy of the Feed Chart from the engine: every US commercial chart the
// web pages print (both lines, each stock method and DTR, standard and high strength,
// PhosZyme off and on) plus a Ref tab of the engine's constants. Values come from the
// engine; this script only lays them out. Regenerate whenever engine numbers change.
//
//   bun scripts/export-excel.ts --out <dir | file.xlsx>
//
// A directory gets the rolling name fra-feed-calc-<YY-MM-DD>-LATEST.xlsx.
import ExcelJS from "exceljs";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import * as E from "../src/engine/index.js";
import { STRINGS } from "../src/feedchart/strings.js";
import { translator } from "../shared/i18n.js";
import { buildView } from "../src/feedchart/content.js";

type LineId = "3part" | "cplus";
type Unit = "mL/gal" | "injection %" | "ratio" | "g/gal";

export type ChartSheet = {
  name: string;
  line: LineId;
  application: "stock" | "direct";
  doserCount: 2 | 3;
  method?: string;
  units: Unit[];
};

export const CHART_SHEETS: ChartSheet[] = [
  ...E.DATA.lines["3part"].methods.map(method => ({
    name: `3-Part ${method}`, line: "3part" as const, application: "stock" as const, doserCount: 3 as const, method,
    units: ["mL/gal", "injection %", "ratio"] as Unit[],
  })),
  { name: "3-Part 2-Doser", line: "3part", application: "stock", doserCount: 2, units: ["mL/gal", "injection %", "ratio"] },
  { name: "3-Part DTR", line: "3part", application: "direct", doserCount: 3, units: ["g/gal"] },
  ...E.DATA.lines.cplus.methods.map(method => ({
    name: `C+ ${method}`, line: "cplus" as const, application: "stock" as const, doserCount: 3 as const, method,
    units: ["mL/gal", "injection %", "ratio"] as Unit[],
  })),
  { name: "C+ 2-Doser", line: "cplus", application: "stock", doserCount: 2, units: ["mL/gal", "injection %", "ratio"] },
  { name: "C+ DTR", line: "cplus", application: "direct", doserCount: 3, units: ["g/gal"] },
];

export const PRESETS = [
  { id: "high", label: "High Strength" },
  { id: "standard", label: "Standard Strength" },
] as const;

export const PHOSZYME = [
  { on: false, label: "PhosZyme off" },
  { on: true, label: "PhosZyme on" },
] as const;

/** Block title as written in column A, used by the test to find a block. */
export function blockTitle(sheet: ChartSheet, preset: (typeof PRESETS)[number], phz: (typeof PHOSZYME)[number]) {
  return `${sheet.name} · ${preset.label} · ${phz.label}`;
}

export function chartSettings(sheet: ChartSheet, ecPreset: "high" | "standard", usePhoszyme: boolean, unit: Unit) {
  return {
    line: sheet.line,
    application: sheet.application,
    doserCount: sheet.doserCount,
    ...(sheet.method ? { method: sheet.method } : {}),
    ecPreset,
    recipeSchedule: "commercial",
    usePhoszyme,
    unit,
  } as const;
}

export function headerText(sha: string, date: string) {
  return `Generated from tools.frontrowag.com engine ${sha} on ${date}; do not edit by hand`;
}

const t = translator(STRINGS, "en");
const VIEW_OPTIONS = { facility: "", show: { phup: true, bf: true, tri: true }, lang: "en", mode: "team" } as const;
const BOLD = { bold: true };
const TITLE = { bold: true, size: 12 };

function decimalsFormat(display: string) {
  const decimals = display.includes(".") ? display.split(".")[1].length : 0;
  return decimals ? `0.${"0".repeat(decimals)}` : "0";
}

/** A dose cell as Excel shows it: the number at the web's printed precision, or the printed text. */
function setDose(cell: ExcelJS.Cell, dose: { dosage: number; display: string } | null) {
  if (!dose || dose.display === "–") { cell.value = "–"; return; }
  if (dose.display.startsWith("1:")) { cell.value = dose.display; return; }
  cell.value = dose.dosage;
  cell.numFmt = decimalsFormat(dose.display);
}

function addHeader(ws: ExcelJS.Worksheet, header: string) {
  ws.getCell("A1").value = header;
  ws.getCell("A1").font = { bold: true, color: { argb: "FFB00020" } };
}

function writeChartSheet(wb: ExcelJS.Workbook, sheet: ChartSheet, header: string) {
  const ws = wb.addWorksheet(sheet.name);
  ws.getColumn(1).width = 34;
  for (let c = 2; c <= 9; c++) ws.getColumn(c).width = 14;
  addHeader(ws, header);
  let r = 3;
  const stepSets: string[][] = [];
  const noteSets: string[][] = [];

  for (const preset of PRESETS) {
    for (const phz of PHOSZYME) {
      const charts = sheet.units.map(unit => E.computeFeedChart(chartSettings(sheet, preset.id, phz.on, unit)));
      const base = charts[0];
      const view = buildView(base, t, VIEW_OPTIONS);

      ws.getCell(r, 1).value = blockTitle(sheet, preset, phz);
      ws.getCell(r, 1).font = TITLE;
      r++;
      ws.getCell(r, 1).value = view.chips.join(" · ");
      ws.getCell(r, 1).font = { italic: true };
      r++;

      const phaseRow = ws.getRow(r++);
      phaseRow.getCell(1).value = "Phase";
      base.phases.forEach((p, i) => { phaseRow.getCell(i + 2).value = p.label.print; });
      phaseRow.font = BOLD;
      const recipeRow = ws.getRow(r++);
      recipeRow.getCell(1).value = "Recipe";
      base.phases.forEach((p, i) => { recipeRow.getCell(i + 2).value = p.recipeLabel; });
      const ecRow = ws.getRow(r++);
      ecRow.getCell(1).value = "Target EC";
      base.phases.forEach((p, i) => {
        const cell = ecRow.getCell(i + 2);
        if (sheet.doserCount === 2 && i === 0) { cell.value = "–"; return; }
        cell.value = p.targetEc; cell.numFmt = "0.0";
      });
      const phRow = ws.getRow(r++);
      phRow.getCell(1).value = "Dripper pH";
      base.ph.columns.forEach((col, i) => { phRow.getCell(i + 2).value = col ? col.text : "–"; });

      base.rows.forEach((row, rowIndex) => {
        charts.forEach((chart, unitIndex) => {
          const out = ws.getRow(r++);
          out.getCell(1).value = `${row.label} (${sheet.units[unitIndex]})`;
          chart.rows[rowIndex].cells.forEach((cell, i) => setDose(out.getCell(i + 2), cell));
        });
        const ecOut = ws.getRow(r++);
        ecOut.getCell(1).value = `${row.label} EC`;
        row.cells.forEach((cell, i) => {
          const target = ecOut.getCell(i + 2);
          if (!cell || cell.display === "–") { target.value = "–"; return; }
          target.value = cell.ec; target.numFmt = "0.00";
        });
        ecOut.font = { italic: true, color: { argb: "FF666666" } };
      });

      for (const note of view.chartNotes) ws.getCell(r++, 1).value = `${note.kind === "warn" ? "Warning: " : ""}${note.text}`;

      if (base.stock) {
        r++;
        ws.getCell(r++, 1).value = `${base.stockConfigLabel} stock tanks`;
        ws.getCell(r - 1, 1).font = BOLD;
        const st = base.stock;
        const head = ws.getRow(r++);
        ["Part", "Tank", `Volume (${st.volUnit})`, `Weight (${st.wtUnit})`, `Conc. (${st.concUnit})`, `Sample (${st.sampleUnit})`, st.ecUnit, "Validation EC"]
          .forEach((h, i) => { head.getCell(i + 1).value = h; });
        head.font = BOLD;
        for (const row of st.rows) {
          // Labels as the printed table shows them (PhosZyme only when used; 2-doser Tank 2 sub-rows unnumbered).
          const label = view.stockTableRows.find(v => v.key === row.key);
          if (!label) continue;
          const out = ws.getRow(r++);
          out.getCell(1).value = label.part;
          out.getCell(2).value = label.tank === "" ? "" : Number(label.tank);
          out.getCell(3).value = row.vol;
          out.getCell(4).value = row.wt;
          out.getCell(5).value = row.conc;
          out.getCell(6).value = row.sample;
          out.getCell(7).value = row.ecG;
          out.getCell(8).value = row.valEC; out.getCell(8).numFmt = "0.00";
        }
        if (st.tank2Total !== null) {
          const out = ws.getRow(r++);
          out.getCell(1).value = "Tank 2 total";
          out.getCell(8).value = Number(st.tank2Total); out.getCell(8).numFmt = "0.00";
        }
      }
      stepSets.push(view.steps);
      noteSets.push(view.notes);
      r += 2;
    }
  }

  // Mixing steps and notes: the PhosZyme-off text, then any PhosZyme-on text that differs.
  const writeList = (title: string, sets: string[][]) => {
    ws.getCell(r++, 1).value = title;
    ws.getCell(r - 1, 1).font = BOLD;
    const seen = new Set<string>();
    sets.forEach((set, index) => {
      const fresh = set.filter(line => !seen.has(line));
      if (!fresh.length) return;
      const withPhz = PHOSZYME[index % PHOSZYME.length].on;
      fresh.forEach(line => { seen.add(line); ws.getCell(r++, 1).value = `${withPhz ? "With PhosZyme: " : ""}${line}`; });
    });
    r++;
  };
  writeList(sheet.application === "stock" ? "Mixing steps" : "Reservoir steps", stepSets);
  writeList("Notes", noteSets);
  ws.getCell(r++, 1).value = t("chart.disclaimer");
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function writeRefSheet(wb: ExcelJS.Workbook, header: string) {
  const D = E.DATA;
  const ws = wb.addWorksheet("Ref");
  ws.getColumn(1).width = 34;
  for (let c = 2; c <= 8; c++) ws.getColumn(c).width = 14;
  addHeader(ws, header);
  let r = 3;
  const section = (title: string) => { r++; ws.getCell(r, 1).value = title; ws.getCell(r, 1).font = TITLE; r++; };
  const row = (values: Array<string | number | null>, bold = false) => {
    const out = ws.getRow(r++);
    values.forEach((v, i) => { if (v !== null) out.getCell(i + 1).value = v; });
    if (bold) out.font = BOLD;
    return out;
  };

  section("EC per g/gal");
  row(["Product", "Line", "EC / g / gal"], true);
  for (const lineId of ["3part", "cplus"] as const) {
    const line = E.getLine(lineId);
    for (const role of ["partA", "partB", "bloom"] as const) row([line.fullNames[role], line.label, line.ecPerGram[role]]);
  }
  row(["PhosZyme", "Both", D.phoszyme.ecPerGram]);

  for (const lineId of ["3part", "cplus"] as const) {
    const line = E.getLine(lineId);
    section(`${line.label} recipe shares (fraction of target EC)`);
    row(["Recipe", line.productsByRole.partA, line.productsByRole.partB, line.productsByRole.bloom], true);
    for (const name of line.recipeNames) {
      const recipe = E.getRecipe(lineId, name);
      row([name, recipe.partA, recipe.partB, recipe.bloom]);
    }
    section(`${line.label} stock methods`);
    row(["Method", `${line.productsByRole.partA} lb/gal`, `${line.productsByRole.partB} lb/gal`, `${line.productsByRole.bloom} lb/gal`, "Tank A gal", "Tank B gal"], true);
    for (const [method, entry] of Object.entries(line.stockMethods) as Array<[string, any]>) {
      const tanks = entry.tankVolumes ?? { tankA: line.stockTankVolume.defaultGal, tankB: line.stockTankVolume.defaultGal };
      row([method, entry.rates.partA, entry.rates.partB, entry.rates.bloom, tanks.tankA, tanks.tankB]);
    }
    if (lineId === "cplus") row([`2-doser CaNO3 options (lb/gal): ${D.lines.cplus.twoDoser.caStockOptions.join(", ")}; default ${D.lines.cplus.twoDoser.defaultCaStock}`]);
    section(`${line.label} recipe schedules`);
    row(["Schedule", ...D.phaseLabels.print], true);
    for (const [id, schedule] of Object.entries(line.schedules) as Array<[string, Record<string, string>]>) {
      row([(D.recipeSchedules.options as any)[id]?.label ?? id, ...D.phases.map(p => schedule[p])]);
    }
    row(["2-doser (Veg / Moms not served)", ...D.phases.map((p, i) => (i === 0 ? "–" : line.twoDoser.recipe))]);
  }

  section("Target EC presets");
  row(["Preset", ...D.phaseLabels.print], true);
  row(["High Strength", ...D.phases.map(p => D.ecPresets.high[p])]);
  row(["Standard Strength", ...D.phases.map(p => D.ecPresets.standard[p])]);

  section("PhosZyme");
  row(["Stock: share of carrier (Part B / C+) by weight", D.phoszyme.stockCarrierRatio]);
  row(["DTR fixed rate (g/gal)", D.phoszyme.directGramsPerGallon]);
  row(["DTR EC contribution", D.phoszyme.directEc]);

  section("Units and conversions");
  row(["Grams per pound", D.units.gramsPerPound]);
  row(["mL per gallon", D.units.millilitersPerGallon]);
  row(["Liters per gallon", D.units.litersPerGallon]);
  row(["Unit", "Factor from g/gal at 1 lb/gal stock"], true);
  for (const [unit, factor] of Object.entries(D.feedUnits.factors)) row([unit, factor === null ? "1:N, N = round(100 / injection %)" : factor]);

  section("Stock validation");
  row(["US sample (mL) in water (gal)", D.validation.us.sampleMl, D.validation.us.waterGal]);
  row(["Metric sample (mL) in water (L)", D.validation.metric.sampleMl, D.validation.metric.waterL]);

  section("Dripper pH rule");
  row([`Range = ${D.dripperPh.floor} to the column's modeled 22 °C calcium-phosphate limit, rounded to 0.1, capped at ${D.dripperPh.cap}. Lines above ${D.dripperPh.warmLineC} °C run the low end.`]);
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export function buildWorkbook({ sha, date }: { sha: string; date: string }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "fra-tools scripts/export-excel.ts";
  const header = headerText(sha, date);
  for (const sheet of CHART_SHEETS) writeChartSheet(wb, sheet, header);
  writeRefSheet(wb, header);
  return wb;
}

export function engineSha() {
  const run = (args: string[]) => Bun.spawnSync(["git", ...args], { cwd: join(import.meta.dir, "..") });
  const sha = run(["rev-parse", "--short", "HEAD"]).stdout.toString().trim() || "unknown";
  const dirty = run(["status", "--porcelain", "--", "src/engine"]).stdout.toString().trim();
  return dirty ? `${sha}+uncommitted-engine-changes` : sha;
}

/** "2026-10-02" and "26-10-02" for today, local time. */
export function today(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return { iso, slug: iso.slice(2) };
}

if (import.meta.main) {
  const outIndex = process.argv.indexOf("--out");
  const out = outIndex > 0 ? process.argv[outIndex + 1] : undefined;
  if (!out) {
    console.error("Usage: bun scripts/export-excel.ts --out <dir | file.xlsx>");
    process.exit(1);
  }
  const { iso, slug } = today();
  const path = existsSync(out) && statSync(out).isDirectory() ? join(out, `fra-feed-calc-${slug}-LATEST.xlsx`) : out;
  const wb = buildWorkbook({ sha: engineSha(), date: iso });
  await wb.xlsx.writeFile(path);
  console.log(`Wrote ${path}`);
}
