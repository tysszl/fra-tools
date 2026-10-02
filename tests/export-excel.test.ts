// The Excel export: read the generated workbook back and check its cells against the
// engine, so the Excel copy cannot drift from the web charts.
import { beforeAll, describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import * as E from "../src/engine/index.js";
import { CHART_SHEETS, PHOSZYME, PRESETS, blockTitle, buildWorkbook, chartSettings, headerText } from "../scripts/export-excel.ts";

const SHA = "test123";
const DATE = "2026-10-02";
let wb: ExcelJS.Workbook;

beforeAll(async () => {
  const buffer = await buildWorkbook({ sha: SHA, date: DATE }).xlsx.writeBuffer();
  wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
});

const sheetDef = (name: string) => CHART_SHEETS.find(s => s.name === name)!;
const preset = (id: "high" | "standard") => PRESETS.find(p => p.id === id)!;
const phz = (on: boolean) => PHOSZYME.find(p => p.on === on)!;

/** Row number of the first column-A cell equal to `label` at or after `from`. */
function findRow(ws: ExcelJS.Worksheet, label: string, from = 1) {
  for (let r = from; r <= ws.rowCount; r++) if (ws.getCell(r, 1).value === label) return r;
  throw new Error(`No row "${label}" in ${ws.name} after row ${from}`);
}

/** The row `label` inside the block for one chart. */
function blockRow(sheetName: string, presetId: "high" | "standard", phzOn: boolean, label: string) {
  const ws = wb.getWorksheet(sheetName)!;
  const start = findRow(ws, blockTitle(sheetDef(sheetName), preset(presetId), phz(phzOn)));
  return ws.getRow(findRow(ws, label, start));
}

const phaseCells = (row: ExcelJS.Row) => E.DATA.phases.map((_, i) => row.getCell(i + 2).value);
const engineChart = (sheetName: string, presetId: "high" | "standard", phzOn: boolean, unit: any) =>
  E.computeFeedChart(chartSettings(sheetDef(sheetName), presetId, phzOn, unit));

describe("Excel export", () => {
  test("every sheet carries the generated-from header, and every chart block exists", () => {
    expect(wb.worksheets.map(ws => ws.name)).toEqual([...CHART_SHEETS.map(s => s.name), "Ref"]);
    for (const ws of wb.worksheets) expect(ws.getCell("A1").value).toBe(headerText(SHA, DATE));
    for (const sheet of CHART_SHEETS) {
      for (const p of PRESETS) for (const z of PHOSZYME) findRow(wb.getWorksheet(sheet.name)!, blockTitle(sheet, p, z));
    }
  });

  test("3-Part 3-2-2 high strength: Part A in every unit, EC, and dripper pH match the engine", () => {
    for (const unit of ["mL/gal", "injection %", "ratio"] as const) {
      const cells = engineChart("3-Part 3-2-2", "high", false, unit).rows[0].cells;
      const expected = cells.map(c => (c!.display.startsWith("1:") ? c!.display : c!.dosage));
      expect(phaseCells(blockRow("3-Part 3-2-2", "high", false, `Part A (${unit})`))).toEqual(expected);
    }
    const chart = engineChart("3-Part 3-2-2", "high", false, "mL/gal");
    expect(phaseCells(blockRow("3-Part 3-2-2", "high", false, "Part A EC"))).toEqual(chart.rows[0].cells.map(c => c!.ec));
    expect(phaseCells(blockRow("3-Part 3-2-2", "high", false, "Dripper pH"))).toEqual(chart.ph.columns.map(c => c!.text));
  });

  test("3-Part 4-3-3 PhosZyme on: B + PhosZyme row and stock validation EC match the engine", () => {
    const chart = engineChart("3-Part 4-3-3", "standard", true, "mL/gal");
    const combo = chart.rows.find(r => r.key === "partB+phoszyme")!;
    expect(phaseCells(blockRow("3-Part 4-3-3", "standard", true, `${combo.label} (mL/gal)`))).toEqual(combo.cells.map(c => c!.dosage));
    const stockA = chart.stock!.rows.find(r => r.key === "partA")!;
    const row = blockRow("3-Part 4-3-3", "standard", true, "A");
    expect([row.getCell(3).value, row.getCell(4).value, row.getCell(5).value, row.getCell(8).value])
      .toEqual([stockA.vol, stockA.wt, stockA.conc, stockA.valEC]);
  });

  test("C+ 2-doser PhosZyme on: Tank 2 doses, Veg not served, and Tank 2 total match the engine", () => {
    const chart = engineChart("C+ 2-Doser", "high", true, "injection %");
    const tank2 = chart.rows.find(r => r.key === "tank2")!;
    const cells = phaseCells(blockRow("C+ 2-Doser", "high", true, `${tank2.label} (injection %)`));
    expect(cells[0]).toBe("–");
    expect(cells.slice(1)).toEqual(tank2.cells.slice(1).map(c => c!.dosage));
    expect(blockRow("C+ 2-Doser", "high", true, "Tank 2 total").getCell(8).value).toBe(Number(chart.stock!.tank2Total));
  });

  test("DTR PhosZyme on prints the fixed PhosZyme rate", () => {
    const chart = engineChart("3-Part DTR", "high", true, "g/gal");
    const row = chart.rows.find(r => r.key === "phoszyme")!;
    expect(phaseCells(blockRow("3-Part DTR", "high", true, "PhosZyme (g/gal)"))).toEqual(row.cells.map(c => c!.dosage));
    expect(row.cells[0]!.dosage).toBe(E.DATA.phoszyme.directGramsPerGallon);
  });

  test("Ref tab reads the engine constants", () => {
    const ws = wb.getWorksheet("Ref")!;
    const partA = ws.getRow(findRow(ws, "Part A"));
    expect(partA.getCell(3).value).toBe(E.DATA.lines["3part"].ecPerGram.partA);
    const shares = ws.getRow(findRow(ws, "Swell", findRow(ws, "Component Plus recipe shares (fraction of target EC)")));
    const swell = E.DATA.lines.cplus.recipes.Swell;
    expect([shares.getCell(2).value, shares.getCell(3).value, shares.getCell(4).value]).toEqual([swell.partA, swell.partB, swell.bloom]);
    const method = ws.getRow(findRow(ws, "4-3-3"));
    expect([method.getCell(2).value, method.getCell(5).value]).toEqual([
      E.DATA.lines["3part"].stockMethods["4-3-3"].rates.partA, E.DATA.lines["3part"].stockMethods["4-3-3"].tankVolumes.tankA,
    ]);
  });
});
